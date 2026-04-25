type RankedMemory = {
  id: string
  memory: string
  kind: string
  updatedAt: Date
  lastUsedAt: Date
}

export function selectMemoriesForPrompt(memories: RankedMemory[], query: string, limit: number): RankedMemory[] {
  return memories
    .map(row => ({ row, score: scoreMemory(query, row.memory, row.kind, row.updatedAt, row.lastUsedAt) }))
    .sort((left, right) => right.score - left.score)
    .filter(item => item.score > 0)
    .slice(0, limit)
    .map(item => item.row)
}

export function normalizeMemoryKind(value: string) {
  return value === 'preference' || value === 'constraint' || value === 'profile' || value === 'project'
    ? value
    : 'fact'
}

function scoreMemory(
  query: string,
  memory: string,
  kind: string,
  updatedAt: Date,
  lastUsedAt: Date,
) {
  const queryTerms = buildSearchTerms(query)
  const memoryTerms = new Set(buildSearchTerms(memory))
  let score = 0.25

  for (const term of queryTerms) {
    if (memoryTerms.has(term)) {
      score += term.length >= 4 ? 2.5 : 1.2
    }
  }

  const normalizedQuery = normalizeForSearch(query)
  const normalizedMemory = normalizeForSearch(memory)
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
  score += kindBonus[normalizeMemoryKind(kind)] ?? 0.5

  score += recencyBonus(updatedAt)
  score += recencyBonus(lastUsedAt)
  return score
}

function recencyBonus(value: Date) {
  const ageMs = Date.now() - value.getTime()
  const dayMs = 24 * 60 * 60 * 1000

  if (ageMs <= 3 * dayMs) return 1.2
  if (ageMs <= 14 * dayMs) return 0.8
  if (ageMs <= 60 * dayMs) return 0.4
  return 0.1
}

function buildSearchTerms(value: string) {
  const normalized = normalizeForSearch(value)
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

function normalizeForSearch(value: string) {
  return value
    .toLowerCase()
    .replace(/[`~!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?！￥…（）【】、；：‘’“”，。？]+/g, ' ')
    .trim()
}
