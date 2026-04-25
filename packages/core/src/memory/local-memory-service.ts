import {
  listLocalMemories,
  touchLocalMemories,
  upsertLocalMemory,
  type DB,
} from '@zakobot/database'
import type { LocalMemorySettings } from '@zakobot/shared'

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

    const ranked = memories
      .map(row => ({ row, score: this.scoreMemory(query, row.memory, row.kind, row.updatedAt, row.lastUsedAt) }))
      .sort((left, right) => right.score - left.score)

    const selected = ranked
      .filter(item => item.score > 0)
      .slice(0, settings.maxMemories)
      .map(item => item.row)

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
          kind: this.normalizeKind(item.kind),
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
  }

  private scoreMemory(
    query: string,
    memory: string,
    kind: string,
    updatedAt: Date,
    lastUsedAt: Date,
  ) {
    const queryTerms = this.buildSearchTerms(query)
    const memoryTerms = new Set(this.buildSearchTerms(memory))
    let score = 0.25

    for (const term of queryTerms) {
      if (memoryTerms.has(term)) {
        score += term.length >= 4 ? 2.5 : 1.2
      }
    }

    const normalizedQuery = this.normalizeForSearch(query)
    const normalizedMemory = this.normalizeForSearch(memory)
    if (normalizedQuery && normalizedMemory) {
      if (normalizedMemory.includes(normalizedQuery) || normalizedQuery.includes(normalizedMemory)) {
        score += 3
      }
    }

    const kindBonus: Record<string, number> = {
      preference: 1.2,
      constraint: 1.4,
      profile: 1,
      project: 0.8,
      fact: 0.5,
    }
    score += kindBonus[this.normalizeKind(kind)] ?? 0.5

    score += this.recencyBonus(updatedAt)
    score += this.recencyBonus(lastUsedAt)
    return score
  }

  private recencyBonus(value: Date) {
    const ageMs = Date.now() - value.getTime()
    const dayMs = 24 * 60 * 60 * 1000

    if (ageMs <= 3 * dayMs) return 1.2
    if (ageMs <= 14 * dayMs) return 0.8
    if (ageMs <= 60 * dayMs) return 0.4
    return 0.1
  }

  private buildSearchTerms(value: string) {
    const normalized = this.normalizeForSearch(value)
    const terms = new Set<string>()

    for (const word of normalized.split(/\s+/).filter(Boolean)) {
      terms.add(word)
    }

    const cjkSegments = normalized.match(/[\p{Script=Han}]{2,}/gu) ?? []
    for (const segment of cjkSegments) {
      for (let index = 0; index < segment.length - 1; index += 1) {
        terms.add(segment.slice(index, index + 2))
      }
    }

    return [...terms]
  }

  private normalizeForSearch(value: string) {
    return value
      .toLowerCase()
      .replace(/[`~!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?！￥…（）【】、；：‘’“”，。？]+/g, ' ')
      .trim()
  }

  private normalizeMemory(value: string) {
    const normalized = value.replace(/\s+/g, ' ').trim().replace(/[。；，,;]+$/g, '')
    if (normalized.length < 4 || normalized.length > 200) {
      return ''
    }

    return normalized
  }

  private normalizeKind(value: string) {
    return value === 'preference' || value === 'constraint' || value === 'profile' || value === 'project'
      ? value
      : 'fact'
  }

  private truncate(value: string, maxChars: number) {
    if (value.length <= maxChars) {
      return value
    }

    return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
  }
}
