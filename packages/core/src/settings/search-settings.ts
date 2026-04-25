import { getAppSetting, setAppSetting } from '@zakobot/database'
import type { DB } from '@zakobot/database'
import type { SearchProvider, SearchSettings } from '@zakobot/shared'

const SEARCH_SETTINGS_KEY = 'search'

export function getSearchSettings(db: DB): SearchSettings {
  const row = getAppSetting(db, SEARCH_SETTINGS_KEY)

  if (!row) {
    return normalizeSearchSettings({
      provider: normalizeProvider(process.env.SEARCH_PROVIDER),
      tavilyApiKey: process.env.TAVILY_API_KEY,
    })
  }

  try {
    return normalizeSearchSettings(JSON.parse(row.value) as Partial<SearchSettings>)
  }
  catch {
    return normalizeSearchSettings({})
  }
}

export function saveSearchSettings(db: DB, value: Partial<SearchSettings>): SearchSettings {
  const settings = normalizeSearchSettings(value)
  setAppSetting(db, SEARCH_SETTINGS_KEY, JSON.stringify(settings))
  return settings
}

export function normalizeSearchSettings(value: Partial<SearchSettings> & Record<string, unknown>): SearchSettings {
  return {
    provider: normalizeProvider(value.provider),
    tavilyApiKey: typeof value.tavilyApiKey === 'string' ? value.tavilyApiKey.trim() : '',
  }
}

function normalizeProvider(value: unknown): SearchProvider {
  return value === 'tavily' || value === 'google_web' ? value : 'google_web'
}
