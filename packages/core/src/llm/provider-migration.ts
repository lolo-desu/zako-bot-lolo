import {
  createLlmProvider,
  listBotsWithRoles,
  listLlmProviders,
  updateBot,
  updateLlmProvider,
} from '@zakobot/database'
import type { DB, LlmProviderRow } from '@zakobot/database'
import { detectModelListFormat } from './list-models.js'

export type LegacyBotProviderMigrationResult = {
  botId: string
  providerId: string
}

export function migrateLegacyBotProviders(db: DB): LegacyBotProviderMigrationResult[] {
  const providersByIdentity = new Map(listLlmProviders(db).map(provider => [toProviderIdentity(provider.name, provider.baseUrl, provider.apiKey), provider]))
  const migrated: LegacyBotProviderMigrationResult[] = []

  for (const row of listBotsWithRoles(db)) {
    const providerId = row.instance.llmProviderId?.trim() ?? ''
    if (providerId) {
      continue
    }

    const providerName = row.instance.llmPlatformName.trim()
    const baseUrl = row.instance.llmBaseUrl.trim()
    const apiKey = row.instance.llmApiKey.trim()

    if (!providerName || !baseUrl || !apiKey) {
      continue
    }

    const format = detectModelListFormat({ apiKey, baseUrl, platformName: providerName })
    if (format !== 'openai') {
      continue
    }

    const identity = toProviderIdentity(providerName, baseUrl, apiKey)
    const existingProvider = providersByIdentity.get(identity)
    const provider = existingProvider
      ? syncMigratedProvider(db, existingProvider, row.instance.llmModel)
      : createMigratedProvider(db, providerName, baseUrl, apiKey, row.instance.llmModel, format)

    providersByIdentity.set(identity, provider)
    updateBot(db, row.instance.id, {
      llmProviderId: provider.id,
      updatedAt: new Date(),
    })
    migrated.push({
      botId: row.instance.id,
      providerId: provider.id,
    })
  }

  return migrated
}

function createMigratedProvider(db: DB, name: string, baseUrl: string, apiKey: string, model: string, format: ReturnType<typeof detectModelListFormat>): LlmProviderRow {
  return createLlmProvider(db, {
    name,
    format,
    baseUrl,
    apiKey,
    enabledModels: JSON.stringify(model ? [model] : []),
    disabledModels: '[]',
    region: '',
    enabled: true,
    builtin: false,
  })
}

function syncMigratedProvider(db: DB, provider: LlmProviderRow, model: string): LlmProviderRow {
  const enabledModels = parseStringArray(provider.enabledModels)
  const disabledModels = parseStringArray(provider.disabledModels).filter(item => item !== model)

  if (model && !enabledModels.includes(model)) {
    enabledModels.push(model)
    enabledModels.sort((a, b) => a.localeCompare(b))
  }

  if (provider.enabled && arraysEqual(enabledModels, parseStringArray(provider.enabledModels)) && arraysEqual(disabledModels, parseStringArray(provider.disabledModels))) {
    return provider
  }

  return updateLlmProvider(db, provider.id, {
    enabled: true,
    enabledModels: JSON.stringify(enabledModels),
    disabledModels: JSON.stringify(disabledModels),
  }) ?? provider
}

function toProviderIdentity(name: string, baseUrl: string, apiKey: string) {
  return `${name}\u0000${baseUrl}\u0000${apiKey}`
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  }
  catch {
    return []
  }
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index])
}
