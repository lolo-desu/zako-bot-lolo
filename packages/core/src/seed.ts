import type { DB } from '@zakobot/database'
import { createLlmProvider, listLlmProviders, runMigrations, updateLlmProvider } from '@zakobot/database'
import { BUILTIN_LLM_PROVIDER_TEMPLATES } from '@zakobot/shared'

export function seed(db: DB) {
  runMigrations(db)
  ensureBuiltinLlmProviders(db)
}

function ensureBuiltinLlmProviders(db: DB) {
  const providers = listLlmProviders(db)

  for (const template of BUILTIN_LLM_PROVIDER_TEMPLATES) {
    const existing = providers.find(provider => provider.builtin && provider.name === template.name && provider.format === template.format)

    if (!existing) {
      createLlmProvider(db, {
        name: template.name,
        format: template.format,
        baseUrl: template.defaultBaseUrl,
        apiKey: '',
        enabledModels: '[]',
        disabledModels: '[]',
        region: '',
        enabled: false,
        builtin: true,
      })
      continue
    }

    const patch: Parameters<typeof updateLlmProvider>[2] = {}

    if (!existing.baseUrl) {
      patch.baseUrl = template.defaultBaseUrl
    }

    if (Object.keys(patch).length > 0) {
      updateLlmProvider(db, existing.id, patch)
    }
  }
}
