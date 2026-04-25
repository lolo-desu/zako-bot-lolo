import { getAppSetting, setAppSetting } from '@zakobot/database'
import type { DB } from '@zakobot/database'
import type { LocalMemorySettings } from '@zakobot/shared'

const LOCAL_MEMORY_SETTINGS_KEY = 'local_memory'
const DEFAULT_MAX_MEMORIES = 5
const DEFAULT_MAX_PROMPT_CHARS = 600

export function getLocalMemorySettings(db: DB): LocalMemorySettings {
  const row = getAppSetting(db, LOCAL_MEMORY_SETTINGS_KEY)

  if (!row) {
    return normalizeLocalMemorySettings({
      enabled: process.env.LOCAL_MEMORY_ENABLED,
      maxMemories: process.env.LOCAL_MEMORY_MAX_MEMORIES,
      maxPromptChars: process.env.LOCAL_MEMORY_MAX_PROMPT_CHARS,
      writebackEnabled: process.env.LOCAL_MEMORY_WRITEBACK_ENABLED,
    })
  }

  try {
    return normalizeLocalMemorySettings(JSON.parse(row.value) as Record<string, unknown>)
  }
  catch {
    return normalizeLocalMemorySettings({})
  }
}

export function saveLocalMemorySettings(db: DB, value: Partial<LocalMemorySettings>): LocalMemorySettings {
  const settings = normalizeLocalMemorySettings(value as Record<string, unknown>)
  setAppSetting(db, LOCAL_MEMORY_SETTINGS_KEY, JSON.stringify(settings))
  return settings
}

function normalizeLocalMemorySettings(value: Record<string, unknown>): LocalMemorySettings {
  return {
    enabled: normalizeBoolean(value.enabled, false),
    maxMemories: normalizeInteger(value.maxMemories, DEFAULT_MAX_MEMORIES, 1, 20),
    maxPromptChars: normalizeInteger(value.maxPromptChars, DEFAULT_MAX_PROMPT_CHARS, 100, 4000),
    writebackEnabled: normalizeBoolean(value.writebackEnabled, true),
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
