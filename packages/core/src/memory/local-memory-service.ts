import {
  deleteLocalMemory,
  listLocalMemories,
  touchLocalMemories,
  upsertLocalMemory,
  type DB,
} from '@zakobot/database'
import type { LocalMemorySettings } from '@zakobot/shared'
import { normalizeMemoryKind, selectMemoriesForPrompt } from './local-memory-ranking.js'

type MemoryScope = {
  botInstanceId: string
  platform: string
  userId: string
}

type PromptInput = MemoryScope & {
  query: string
}

type SaveInput = MemoryScope & {
  topicId: string
  items: Array<{ memory: string; kind: string }>
}

const MEMORY_USAGE_NOTE = '以下是从过往互动中沉淀出的长期记忆。仅在与当前请求相关时使用；如果与用户这次的明确要求冲突，以当前要求为准。'

export class LocalMemoryService {
  constructor(
    private db: DB,
    private getSettings: () => LocalMemorySettings,
  ) {}

  isEnabled() {
    return this.getSettings().enabled
  }

  listMemories(input: MemoryScope) {
    if (!this.isEnabled()) {
      return []
    }

    const memories = listLocalMemories(this.db, input, 100)
    console.info(`[Memory] Listed memories bot=${input.botInstanceId} platform=${input.platform} user=${input.userId} count=${memories.length}`)
    return memories
  }

  listMemoryTexts(input: MemoryScope, limit = 20) {
    return this.listMemories(input)
      .slice(0, limit)
      .map(item => item.memory)
  }

  shouldWriteback() {
    const settings = this.getSettings()
    return settings.enabled && settings.writebackEnabled
  }

  buildPromptBlock(input: PromptInput) {
    const settings = this.getSettings()
    const query = input.query.trim()

    if (!settings.enabled || !query) {
      return ''
    }

    const memories = listLocalMemories(this.db, input, 80)
    if (memories.length === 0) {
      return ''
    }

    const selected = selectMemoriesForPrompt(memories, query, settings.maxMemories)
    if (selected.length === 0) {
      return ''
    }

    touchLocalMemories(this.db, selected.map(item => item.id))

    const lines = [MEMORY_USAGE_NOTE, '', ...selected.map(item => `- ${item.memory}`)]
    return this.truncate(lines.join('\n'), settings.maxPromptChars)
  }

  saveMemories(input: SaveInput) {
    const unique = new Map<string, { memory: string; kind: string }>()

    for (const item of input.items) {
      const memory = this.normalizeMemory(item.memory)
      if (!memory) {
        continue
      }

      const key = memory.toLowerCase()
      if (!unique.has(key)) {
        unique.set(key, {
          memory,
          kind: normalizeMemoryKind(item.kind),
        })
      }
    }

    for (const item of unique.values()) {
      upsertLocalMemory(this.db, {
        botInstanceId: input.botInstanceId,
        platform: input.platform,
        userId: input.userId,
        memory: item.memory,
        kind: item.kind,
        sourceTopicId: input.topicId,
      })
    }

    console.info(`[Memory] Saved extracted memories bot=${input.botInstanceId} platform=${input.platform} user=${input.userId} topic=${input.topicId} count=${unique.size}`)
    return unique.size
  }

  saveMemory(input: MemoryScope & { topicId: string; memory: string; kind: string }) {
    const memory = this.normalizeMemory(input.memory)
    if (!memory) {
      throw new Error('Memory must be 4-200 characters')
    }

    upsertLocalMemory(this.db, {
      botInstanceId: input.botInstanceId,
      platform: input.platform,
      userId: input.userId,
      memory,
      kind: normalizeMemoryKind(input.kind),
      sourceTopicId: input.topicId,
    })

    console.info(`[Memory] Saved memory bot=${input.botInstanceId} platform=${input.platform} user=${input.userId} topic=${input.topicId} kind=${normalizeMemoryKind(input.kind)} chars=${memory.length}`)
  }

  deleteMemory(input: MemoryScope & { id: string }) {
    const id = input.id.trim()
    if (!id) {
      throw new Error('Memory id is required')
    }

    const result = deleteLocalMemory(this.db, input, id)
    const deleted = result.changes > 0
    console.info(`[Memory] Deleted memory bot=${input.botInstanceId} platform=${input.platform} user=${input.userId} id=${id} deleted=${deleted}`)
    return deleted
  }

  private normalizeMemory(value: string) {
    const normalized = value.replace(/\s+/g, ' ').trim().replace(/[。；，,;]+$/g, '')
    if (normalized.length < 4 || normalized.length > 200) {
      return ''
    }

    return normalized
  }

  private truncate(value: string, maxChars: number) {
    if (value.length <= maxChars) {
      return value
    }

    return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
  }
}
