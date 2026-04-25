import { getAppSetting, setAppSetting } from '@zakobot/database'
import type { DB } from '@zakobot/database'
import type { BrowseProvider, BrowseSettings, JinaEngine, JinaRetainImages } from '@zakobot/shared'

const BROWSE_SETTINGS_KEY = 'browse'
const DEFAULT_TOKEN_BUDGET = 200_000

export function getBrowseSettings(db: DB): BrowseSettings {
  const row = getAppSetting(db, BROWSE_SETTINGS_KEY)

  if (!row) {
    return normalizeBrowseSettings({
      provider: normalizeProvider(process.env.BROWSE_PROVIDER),
      jinaApiKey: process.env.JINA_API_KEY,
      jinaEngine: process.env.JINA_ENGINE,
      jinaRetainImages: process.env.JINA_RETAIN_IMAGES,
      jinaTokenBudgetEnabled: Boolean(process.env.JINA_TOKEN_BUDGET?.trim()),
      jinaTokenBudget: process.env.JINA_TOKEN_BUDGET,
    })
  }

  try {
    return normalizeBrowseSettings(JSON.parse(row.value) as Record<string, unknown>)
  }
  catch {
    return normalizeBrowseSettings({})
  }
}

export function saveBrowseSettings(db: DB, value: Partial<BrowseSettings>): BrowseSettings {
  const settings = normalizeBrowseSettings(value as Record<string, unknown>)
  setAppSetting(db, BROWSE_SETTINGS_KEY, JSON.stringify(settings))
  return settings
}

export function normalizeBrowseSettings(value: Record<string, unknown>): BrowseSettings {
  return {
    provider: normalizeProvider(value.provider),
    jinaApiKey: typeof value.jinaApiKey === 'string' ? value.jinaApiKey.trim() : '',
    jinaEngine: normalizeJinaEngine(value.jinaEngine),
    jinaRetainImages: normalizeJinaRetainImages(value.jinaRetainImages),
    jinaTokenBudgetEnabled: Boolean(value.jinaTokenBudgetEnabled),
    jinaTokenBudget: normalizeTokenBudget(value.jinaTokenBudget),
  }
}

function normalizeProvider(value: unknown): BrowseProvider {
  return value === 'jina' ? 'jina' : 'fetch'
}

function normalizeJinaEngine(value: unknown): JinaEngine {
  return value === 'direct' || value === 'cf-browser-rendering' ? value : 'browser'
}

function normalizeJinaRetainImages(value: unknown): JinaRetainImages {
  return (
    value === 'all'
    || value === 'alt'
    || value === 'all_p'
    || value === 'alt_p'
    || value === 'none'
  )
    ? value
    : 'none'
}

function normalizeTokenBudget(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(number)) {
    return DEFAULT_TOKEN_BUDGET
  }

  return Math.min(Math.max(Math.trunc(number), 1_000), 1_000_000)
}
