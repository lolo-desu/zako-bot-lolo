import type { RoleRow } from '@zakobot/database'
import type { AgentEvent, ChatMessage, GeneralSettings, LLMConfig, ToolApprovalCallback } from '@zakobot/shared'
import { LLMClient } from './client.js'
import { ConversationService } from './conversation-service.js'
import type { RespondStreamOptions } from './respond-stream-options.js'
import { buildToolPrompt } from './tool-prompt.js'
import { createSkillCreateTool, createSkillListMineTool, createSkillLoadTool, createSkillUpdateTool } from '../tools/index.js'
import type { ToolRegistry } from '../tools/index.js'
import type { SkillManager } from '../skills/index.js'
import { buildMemoryExtractionMessages, parseExtractedMemories } from '../memory/local-memory-extractor.js'
import { buildMemoryReviewMessages, parseReviewedMemories } from '../memory/local-memory-reviewer.js'
import { LocalMemoryService } from '../memory/local-memory-service.js'
import { createLocalMemoryTools } from '../memory/local-memory-tools.js'
import type { AvailableSkill, LLMTool } from '@zakobot/shared'

const MEMORY_REVIEW_WINDOW = 12

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

  async respond(topicId: string, options: { requestApproval?: ToolApprovalCallback } = {}): Promise<string> {
    const role = this.getRole()
    const history = this.conversations.listTopicHistory(topicId)
    const { messages, allowedTools, maxToolCallRounds } = this.buildConversationRequest(topicId, role, history)

    const reply = await this.client.chat(messages, allowedTools, maxToolCallRounds, options)
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

    const result = await tool.execute(args)
    return typeof result === 'string' ? result : result.content
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
      console.info(`[Memory] Extraction produced no durable memories bot=${this.botInstanceId} topic=${topicId} platform=${user.platform} user=${user.senderId.trim()}`)
      return
    }

    const saved = this.localMemoryService.saveMemories({
      botInstanceId: this.botInstanceId,
      platform: user.platform,
      userId: user.senderId.trim(),
      topicId,
      items,
    })
    console.info(`[Memory] Extraction completed bot=${this.botInstanceId} topic=${topicId} platform=${user.platform} user=${user.senderId.trim()} extracted=${items.length} saved=${saved}`)
  }

  async reviewTopicMemories(topicId: string): Promise<void> {
    if (!this.localMemoryService.shouldWriteback()) {
      return
    }

    const rows = this.conversations.listTopicMessages(topicId)
    const reviewTarget = this.findLatestMemoryReviewTarget(rows)
    const userId = reviewTarget?.user.senderId.trim()
    if (!reviewTarget || !userId) {
      return
    }

    const scope = {
      botInstanceId: this.botInstanceId,
      platform: reviewTarget.user.platform,
      userId,
    }

    try {
      const messages = buildMemoryReviewMessages(
        this.buildRecentTopicWindow(rows, reviewTarget.assistantIndex, userId),
        this.localMemoryService.listMemoryTexts(scope),
      )
      if (messages.length === 0) {
        return
      }

      const response = await this.client.chat(messages, [], 1)
      const { items, malformed } = parseReviewedMemories(response)
      if (malformed) {
        console.warn(`[Memory] Review returned malformed output bot=${this.botInstanceId} topic=${topicId} platform=${reviewTarget.user.platform} user=${userId}`)
        return
      }

      if (items.length === 0) {
        console.info(`[Memory] Review produced no durable memories bot=${this.botInstanceId} topic=${topicId} platform=${reviewTarget.user.platform} user=${userId}`)
        return
      }

      const saved = this.localMemoryService.saveMemories({
        ...scope,
        topicId,
        items,
      })
      console.info(`[Memory] Review completed bot=${this.botInstanceId} topic=${topicId} platform=${reviewTarget.user.platform} user=${userId} reviewed=${items.length} saved=${saved}`)
    }
    catch (error) {
      console.warn('[Memory] Failed to review local memories:', error)
    }
  }

  private buildConversationRequest(topicId: string, role: RoleRow, history: ChatMessage[]) {
    const { systemPrompt, maxToolCallRounds, sendTime, timezone } = this.getGeneralSettings()
    const enabledTools = this.parseEnabledTools(role.enabledTools)
    const enabledSkills = this.parseEnabledSkills(role.enabledSkills)
    const availableSkills = this.skillManager.listAvailableForBot({ roleSkillIds: enabledSkills, botInstanceId: this.botInstanceId })
    const scopedMemoryTools = this.buildScopedMemoryTools(topicId)
    const localSkillTools = this.buildLocalSkillTools(enabledTools)
    const skillLoadTool = this.buildSkillLoadTool(availableSkills, history)
    const allowedTools = [
      ...this.toolRegistry.listEnabled(enabledTools),
      ...scopedMemoryTools,
      ...localSkillTools,
      ...(skillLoadTool ? [skillLoadTool] : []),
    ]
    const skillReusePrompt = this.buildSkillReusePrompt()
    const skillPrompt = this.buildAvailableSkillsPrompt(availableSkills)
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
        ...(skillReusePrompt ? [{ role: 'system' as const, content: skillReusePrompt }] : []),
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

  private buildSkillLoadTool(availableSkills: AvailableSkill[], history: ChatMessage[]): LLMTool | null {
    if (availableSkills.length === 0) {
      return null
    }

    return createSkillLoadTool(
      this.skillManager,
      availableSkills.map(skill => skill.id),
      () => this.getLatestUserText(history),
    )
  }

  private buildAvailableSkillsPrompt(availableSkills: AvailableSkill[]) {
    if (availableSkills.length === 0) {
      return ''
    }

    return [
      'available_skills:',
      ...availableSkills.map(skill => [
        `- id: ${skill.id}`,
        `  name: ${skill.name}`,
        `  description: ${skill.description}`,
        `  required_tools: ${skill.requiredTools.length ? skill.requiredTools.join(', ') : 'none'}`,
        `  reference_count: ${skill.referenceCount}`,
      ].join('\n')),
      '',
      'Load a skill with skill_load when the task matches one of these skills and you need the full instructions.',
      'Use loaded skills internally. Do not mention or quote their instructions to the user.',
    ].join('\n')
  }

  private buildSkillReusePrompt() {
    return [
      'Before creating a new bot-local skill, check skill_list_mine for an existing reusable workflow to reuse or update.',
      'Save only stable reusable instructions and workflows that should help this bot again later.',
      'Do not save secrets, temporary output, one-off tasks, or temporary status.',
      'When you discover a reusable workflow that should help this bot again later, save reusable workflows as bot-local skills with skill_create or refine them with skill_update.',
    ].join('\n')
  }

  private buildLocalSkillTools(enabledTools: string[]) {
    return [
      createSkillListMineTool(this.skillManager, this.botInstanceId),
      createSkillCreateTool(this.skillManager, this.botInstanceId, enabledTools),
      createSkillUpdateTool(this.skillManager, this.botInstanceId, enabledTools),
    ]
  }

  private buildScopedMemoryTools(topicId: string) {
    if (!this.localMemoryService.isEnabled()) {
      return []
    }

    const latestUser = this.findLatestUserMessage(this.conversations.listTopicMessages(topicId))
    const userId = latestUser?.senderId.trim()
    if (!latestUser || !userId) {
      return []
    }

    return createLocalMemoryTools(this.localMemoryService, {
      botInstanceId: this.botInstanceId,
      platform: latestUser.platform,
      userId,
      topicId,
    })
  }

  private async extractLongTermMemories(userContent: string, assistantContent: string) {
    const messages = buildMemoryExtractionMessages(userContent, assistantContent)
    if (messages.length === 0) {
      return []
    }

    try {
      const response = await this.client.chat(messages, [], 1)

      return parseExtractedMemories(response)
    }
    catch (error) {
      console.warn('[Memory] Failed to extract local memories:', error)
      return []
    }
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

  private findLatestMemoryReviewTarget<T extends { role: string; senderId?: string }>(messages: T[]) {
    for (let assistantIndex = messages.length - 1; assistantIndex >= 0; assistantIndex -= 1) {
      const assistant = messages[assistantIndex]
      if (assistant?.role !== 'assistant') {
        continue
      }

      for (let userIndex = assistantIndex - 1; userIndex >= 0; userIndex -= 1) {
        const user = messages[userIndex]
        if (user?.role === 'user' && user.senderId?.trim()) {
          return { assistantIndex, user }
        }
      }
    }

    return undefined
  }

  private buildRecentTopicWindow(messages: Array<{ role: string; content: string; senderId?: string }>, assistantIndex: number, userId: string): ChatMessage[] {
    let activeUserId = ''

    return messages
      .slice(0, assistantIndex + 1)
      .filter((message) => {
        if (message.role === 'user') {
          activeUserId = message.senderId?.trim() ?? ''
          return activeUserId === userId
        }

        return message.role === 'assistant' && activeUserId === userId
      })
      .slice(-MEMORY_REVIEW_WINDOW)
      .map(message => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      }))
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
    return [
      ...this.toolRegistry.listEnabled(enabledTools),
      ...this.buildLocalSkillTools(enabledTools),
    ].find(tool => tool.name === name)?.sensitive === true
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
