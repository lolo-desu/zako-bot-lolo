import type { RoleRow } from '@zakobot/database'
import type { AgentEvent, ChatMessage, GeneralSettings, LLMConfig } from '@zakobot/shared'
import { LLMClient } from './client.js'
import { ConversationService } from './conversation-service.js'
import type { RespondStreamOptions } from './respond-stream-options.js'
import { buildToolPrompt } from './tool-prompt.js'
import type { ToolRegistry } from '../tools/index.js'
import type { SkillManager } from '../skills/index.js'
import { LocalMemoryService } from '../memory/local-memory-service.js'

export class Agent {
  private client: LLMClient

  constructor(
    private botInstanceId: string,
    private getRole: () => RoleRow,
    llmConfig: LLMConfig,
    private conversations: ConversationService,
    private toolRegistry: ToolRegistry,
    private skillManager: SkillManager,
    private localMemoryService: LocalMemoryService,
    private getGeneralSettings: () => GeneralSettings,
  ) {
    this.client = new LLMClient(llmConfig)
  }

  async *respondStream(topicId: string, options: RespondStreamOptions = {}): AsyncGenerator<AgentEvent> {
    const role = this.getRole()
    const history = this.conversations.listTopicHistory(topicId)
    const { requestApproval, abortSignal, onRateLimitRetry } = options
    const { messages, allowedTools, maxToolCallRounds } = this.buildConversationRequest(topicId, role, history)

    yield* this.client.chatStream(messages, allowedTools, {
      maxToolCallRounds,
      requestApproval,
      abortSignal,
      onRateLimitRetry,
    })
  }

  async respond(topicId: string): Promise<string> {
    const role = this.getRole()
    const history = this.conversations.listTopicHistory(topicId)
    const { messages, allowedTools, maxToolCallRounds } = this.buildConversationRequest(topicId, role, history)

    const reply = await this.client.chat(messages, allowedTools, maxToolCallRounds)
    return reply
  }

  findEnabledToolName(suffix: string): string | null {
    const enabledTools = this.parseEnabledTools(this.getRole().enabledTools)
    return enabledTools.find(name => name.endsWith(suffix)) ?? null
  }

  async executeEnabledTool(name: string, args: Record<string, unknown>): Promise<string> {
    const enabledTools = this.parseEnabledTools(this.getRole().enabledTools)
    if (!enabledTools.includes(name)) {
      throw new Error(`Tool "${name}" is not enabled for this role`)
    }

    const tool = this.toolRegistry.list().find(item => item.name === name)
    if (!tool) {
      throw new Error(`Tool "${name}" is not available`)
    }

    return tool.execute(args)
  }

  async explainToolIntent(topicId: string, name: string, input: unknown, question?: string): Promise<string> {
    const role = this.getRole()
    const history = this.conversations.listTopicHistory(topicId)
    const { messages } = this.buildConversationRequest(topicId, role, history)
    const args = this.safeJsonStringify(input)
    const reviewerQuestion = question?.trim() || '为什么现在需要执行这个操作？'

    return this.client.chat([
      ...messages,
      {
        role: 'system',
        content: '你在帮助人工审核一项敏感工具调用。请直接对审核人说明：1) 助手为什么要做这件事；2) 具体会执行什么；3) 主要风险或影响；4) 如果拒绝，当前任务会卡在哪里。不要调用任何工具，不要泄露隐藏推理，不要编造结果。请使用简洁中文，控制在 4 行内。',
      },
      {
        role: 'user',
        content: `待审批工具：${name}\n参数：${args}\n审核人问题：${reviewerQuestion}`,
      },
    ], [], 1)
  }

  async rememberTopicTurn(topicId: string): Promise<void> {
    if (!this.localMemoryService.shouldWriteback()) {
      return
    }

    const rows = this.conversations.listTopicMessages(topicId)
    const assistant = rows.at(-1)
    const user = this.findLatestUserMessage(rows.slice(0, -1))

    if (!assistant || assistant.role !== 'assistant' || !user?.senderId.trim()) {
      return
    }

    const items = await this.extractLongTermMemories(user.content, assistant.content)
    if (items.length === 0) {
      return
    }

    this.localMemoryService.saveMemories({
      botInstanceId: this.botInstanceId,
      platform: user.platform,
      userId: user.senderId.trim(),
      topicId,
      items,
    })
  }

  private buildConversationRequest(topicId: string, role: RoleRow, history: ChatMessage[]) {
    const { systemPrompt, maxToolCallRounds, sendTime, timezone } = this.getGeneralSettings()
    const enabledTools = this.parseEnabledTools(role.enabledTools)
    const enabledSkills = this.parseEnabledSkills(role.enabledSkills)
    const allowedTools = this.toolRegistry.listEnabled(enabledTools)
    const skillPrompt = this.skillManager.buildPrompt(enabledSkills, this.getLatestUserText(history))
    const toolPrompt = buildToolPrompt(allowedTools)
    const historyWithTime = sendTime ? this.injectSendTime(history, timezone) : history
    const memoryPrompt = this.buildMemoryPrompt(topicId, history)

    return {
      maxToolCallRounds,
      allowedTools,
      messages: [
        ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
        { role: 'system' as const, content: role.systemPrompt },
        ...(memoryPrompt ? [{ role: 'system' as const, content: memoryPrompt }] : []),
        ...(skillPrompt ? [{ role: 'system' as const, content: skillPrompt }] : []),
        ...(toolPrompt ? [{ role: 'system' as const, content: toolPrompt }] : []),
        ...historyWithTime,
      ],
    }
  }

  private buildMemoryPrompt(topicId: string, history: ChatMessage[]) {
    const latestUser = this.findLatestUserMessage(this.conversations.listTopicMessages(topicId))
    const query = this.getLatestUserText(history).trim()

    if (!latestUser?.senderId.trim() || !query) {
      return ''
    }

    return this.localMemoryService.buildPromptBlock({
      botInstanceId: this.botInstanceId,
      platform: latestUser.platform,
      userId: latestUser.senderId.trim(),
      query,
    })
  }

  private async extractLongTermMemories(userContent: string, assistantContent: string) {
    const trimmedUser = this.truncate(userContent.replace(/\s+/g, ' ').trim(), 1500)
    const trimmedAssistant = this.truncate(assistantContent.replace(/\s+/g, ' ').trim(), 1500)

    if (!trimmedUser || !trimmedAssistant) {
      return []
    }

    try {
      const response = await this.client.chat([
        {
          role: 'system',
          content: '你是长期记忆提炼器。请从这轮对话中只提炼对未来互动稳定有帮助的信息，并返回严格 JSON 数组。每项格式为 {"memory": string, "kind": "preference"|"constraint"|"profile"|"project"|"fact"}。最多返回 3 项。不要输出 markdown，不要解释。不要记录一次性任务、短期状态、敏感信息、密码、token、密钥、验证码，或明显会过期的信息。',
        },
        {
          role: 'user',
          content: `用户消息：${trimmedUser}\n助手回复：${trimmedAssistant}`,
        },
      ], [], 1)

      return this.parseExtractedMemories(response)
    }
    catch (error) {
      console.warn('[Memory] Failed to extract local memories:', error)
      return []
    }
  }

  private parseExtractedMemories(value: string) {
    const jsonText = this.extractJsonArray(value)
    if (!jsonText) {
      return [] as Array<{ memory: string; kind: string }>
    }

    try {
      const parsed = JSON.parse(jsonText) as Array<{ memory?: unknown; kind?: unknown }>
      if (!Array.isArray(parsed)) {
        return []
      }

      return parsed
        .map(item => ({
          memory: typeof item.memory === 'string' ? item.memory.trim() : '',
          kind: typeof item.kind === 'string' ? item.kind.trim() : 'fact',
        }))
        .filter(item => item.memory)
        .slice(0, 3)
    }
    catch {
      return []
    }
  }

  private extractJsonArray(value: string) {
    const trimmed = value.trim()
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return trimmed
    }

    const blockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (blockMatch?.[1]) {
      const block = blockMatch[1].trim()
      if (block.startsWith('[') && block.endsWith(']')) {
        return block
      }
    }

    const start = trimmed.indexOf('[')
    const end = trimmed.lastIndexOf(']')
    if (start !== -1 && end > start) {
      return trimmed.slice(start, end + 1)
    }

    return ''
  }

  private findLatestUserMessage<T extends { role: string }>(messages: T[]) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      if (message?.role === 'user') {
        return message
      }
    }

    return undefined
  }

  private truncate(value: string, maxChars: number) {
    if (value.length <= maxChars) {
      return value
    }

    return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
  }

  private injectSendTime(history: ChatMessage[], timezone: string): ChatMessage[] {
    const lastUserIndex = history.map(m => m.role).lastIndexOf('user')
    if (lastUserIndex === -1) return history

    const timeStr = new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date())

    const result = [...history]
    const msg = result[lastUserIndex]!
    const timeNote = `\n\n[发送时间：${timeStr} (${timezone})]`
    const newContent = Array.isArray(msg.content)
      ? [...msg.content, { type: 'text' as const, text: timeNote.trim() }]
      : `${msg.content}${timeNote}`
    result[lastUserIndex] = { ...msg, content: newContent }
    return result
  }

  isToolSensitive(name: string): boolean {
    const enabledTools = this.parseEnabledTools(this.getRole().enabledTools)
    return this.toolRegistry.listEnabled(enabledTools).find(t => t.name === name)?.sensitive === true
  }

  private parseEnabledTools(value: string): string[] {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed)
        ? parsed.filter((tool): tool is string => typeof tool === 'string')
        : []
    }
    catch {
      return []
    }
  }

  private parseEnabledSkills(value: string): string[] {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed)
        ? parsed.filter((skill): skill is string => typeof skill === 'string')
        : []
    }
    catch {
      return []
    }
  }

  private getLatestUserText(history: ChatMessage[]) {
    const message = [...history].reverse().find(item => item.role === 'user')
    const content = message?.content

    if (!content) {
      return ''
    }

    if (typeof content === 'string') {
      return content
    }

    return content
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join('\n')
  }

  private safeJsonStringify(value: unknown) {
    try {
      return JSON.stringify(value)
    }
    catch {
      return String(value)
    }
  }
}
