import { getAppSetting, setAppSetting } from '@zakobot/database'
import type { DB } from '@zakobot/database'
import type { MemorySettings } from '@zakobot/shared'

const MEMORY_SETTINGS_KEY = 'memory'
const DEFAULT_BASE_URL = 'https://api.mem0.ai'
const DEFAULT_TOP_K = 5
const DEFAULT_MAX_MEMORIES = 5
const DEFAULT_MAX_PROMPT_CHARS = 600
const DEFAULT_TIMEOUT_MS = 8000

export function getMemorySettings(db: DB): MemorySettings {
  const row = getAppSetting(db, MEMORY_SETTINGS_KEY)

  if (!row) {
    return normalizeMemorySettings({
      enabled: process.env.MEMORY_ENABLED,
      provider: 'mem0',
      apiKey: process.env.MEM0_API_KEY,
      baseUrl: process.env.MEM0_BASE_URL,
      topK: process.env.MEM0_TOP_K,
      maxMemories: process.env.MEM0_MAX_MEMORIES,
      maxPromptChars: process.env.MEM0_MAX_PROMPT_CHARS,
      timeoutMs: process.env.MEM0_TIMEOUT_MS,
      writebackEnabled: process.env.MEM0_WRITEBACK_ENABLED,
    })
  }

  try {
    return normalizeMemorySettings(JSON.parse(row.value) as Record<string, unknown>)
  }
  catch {
    return normalizeMemorySettings({})
  }
}

export function saveMemorySettings(db: DB, value: Partial<MemorySettings>): MemorySettings {
  const settings = normalizeMemorySettings(value as Record<string, unknown>)
  setAppSetting(db, MEMORY_SETTINGS_KEY, JSON.stringify(settings))
  return settings
}

function normalizeMemorySettings(value: Record<string, unknown>): MemorySettings {
  return {
    enabled: normalizeBoolean(value.enabled, false),
    provider: 'mem0',
    apiKey: typeof value.apiKey === 'string' ? value.apiKey.trim() : '',
    baseUrl: normalizeBaseUrl(value.baseUrl),
    topK: normalizeInteger(value.topK, DEFAULT_TOP_K, 1, 20),
    maxMemories: normalizeInteger(value.maxMemories, DEFAULT_MAX_MEMORIES, 1, 20),
    maxPromptChars: normalizeInteger(value.maxPromptChars, DEFAULT_MAX_PROMPT_CHARS, 100, 4000),
    timeoutMs: normalizeInteger(value.timeoutMs, DEFAULT_TIMEOUT_MS, 1000, 30000),
    writebackEnabled: normalizeBoolean(value.writebackEnabled, true),
  }
}

function normalizeBaseUrl(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : ''
  const fallback = DEFAULT_BASE_URL

  if (!raw) {
    return fallback
  }

  try {
    const url = new URL(raw)
    return url.toString().replace(/\/+$/, '')
  }
  catch {
    return fallback
  }
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.min(Math.max(Math.trunc(number), min), max)
}
