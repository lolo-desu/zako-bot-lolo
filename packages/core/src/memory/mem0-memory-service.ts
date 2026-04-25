import type { MemorySettings } from '@zakobot/shared'

type SearchInput = {
  query: string
  userId: string
  agentId: string
}

type RememberInput = {
  userId: string
  agentId: string
  runId: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  metadata?: Record<string, unknown>
}

type Mem0SearchResponse = {
  results?: Array<{
    memory?: string
    score?: number
  }>
}

const MEMORY_USAGE_NOTE = '以下是从过往互动中提炼出的高置信记忆。仅在与当前请求相关时使用；如果与用户这次的明确要求冲突，以当前要求为准。'
const MEMORY_EXTRACTION_INSTRUCTIONS = [
  '只提炼长期稳定且对未来互动有帮助的信息。',
  '优先提炼用户偏好、工作约束和稳定环境事实。',
  '不要提炼一次性任务、临时状态、敏感密钥、密码或 token。',
  '如果信息明显是短期上下文或已过时，不要保存。',
].join(' ')

export class Mem0MemoryService {
  constructor(private getSettings: () => MemorySettings) {}

  async buildPromptBlock(input: SearchInput): Promise<string> {
    const settings = this.getSettings()
    const query = input.query.trim()

    if (!this.isReady(settings) || !query) {
      return ''
    }

    try {
      const response = await this.request<Mem0SearchResponse>(settings, '/v3/memories/search/', {
        query,
        filters: {
          AND: [
            { user_id: input.userId },
            { agent_id: input.agentId },
          ],
        },
        top_k: settings.topK,
      })

      const memories = this.uniqueMemories(response.results ?? [], settings.maxMemories)
      if (!memories.length) {
        return ''
      }

      const lines = [MEMORY_USAGE_NOTE, '', ...memories.map(memory => `- ${memory}`)]
      return this.truncate(lines.join('\n'), settings.maxPromptChars)
    }
    catch (error) {
      console.warn('[Memory] Failed to search Mem0 memories:', error)
      return ''
    }
  }

  async rememberConversation(input: RememberInput): Promise<void> {
    const settings = this.getSettings()
    if (!this.isReady(settings) || !settings.writebackEnabled) {
      return
    }

    const messages = input.messages
      .map(message => ({
        role: message.role,
        content: this.truncate(message.content.trim(), 4000),
      }))
      .filter(message => message.content)

    if (!messages.length) {
      return
    }

    try {
      await this.request(settings, '/v3/memories/add/', {
        user_id: input.userId,
        agent_id: input.agentId,
        run_id: input.runId,
        messages,
        metadata: input.metadata ?? {},
        custom_instructions: MEMORY_EXTRACTION_INSTRUCTIONS,
      })
    }
    catch (error) {
      console.warn('[Memory] Failed to add Mem0 memories:', error)
    }
  }

  private isReady(settings: MemorySettings) {
    return settings.enabled && settings.provider === 'mem0' && Boolean(settings.apiKey.trim())
  }

  private async request<T = unknown>(settings: MemorySettings, path: string, body: Record<string, unknown>) {
    const url = new URL(path, `${settings.baseUrl}/`)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${settings.apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(settings.timeoutMs),
    })

    if (!response.ok) {
      throw new Error(`Mem0 request failed (${response.status})`)
    }

    return await response.json() as T
  }

  private uniqueMemories(results: Array<{ memory?: string; score?: number }>, limit: number) {
    const memories: string[] = []
    const seen = new Set<string>()

    for (const result of results) {
      const memory = result.memory?.trim()
      if (!memory) {
        continue
      }

      const normalized = memory.toLowerCase()
      if (seen.has(normalized)) {
        continue
      }

      seen.add(normalized)
      memories.push(memory)
      if (memories.length >= limit) {
        break
      }
    }

    return memories
  }

  private truncate(value: string, maxChars: number) {
    if (value.length <= maxChars) {
      return value
    }

    return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
  }
}
