import type http from 'http'
import {
  createLlmProvider,
  deleteLlmProvider,
  getBotByLlmProviderId,
  getLlmProvider,
  listBotsByLlmProviderId,
  listLlmProviders,
  updateBotsByLlmProviderId,
  updateLlmProvider,
} from '@zakobot/database'
import type { DB, LlmProviderRow } from '@zakobot/database'
import type { BotManager } from '../../bot/bot-manager.js'
import {
  hasTask4BridgeRuntimeConfig,
  isTask4BotSelectableProvider,
} from '@zakobot/shared'
import type { ApiResponse } from '@zakobot/shared'
import { fetchAvailableModels } from '../../llm/list-models.js'
import { toLlmProviderProfile } from '../serializers.js'
import { getApiErrorMessage, getApiErrorStatus, readJsonBody } from '../http.js'
import { parseLlmProviderInput } from '../validators.js'

type RouteResult = {
  status?: number
  body: ApiResponse<unknown>
}

export async function getLlmProvidersRoute(
  req: http.IncomingMessage,
  pathname: string,
  deps: {
    db: DB
    botManager: BotManager
  },
): Promise<RouteResult | undefined> {
  const { db, botManager } = deps
  if (pathname === '/llm-providers' && req.method === 'GET') {
    return { body: { ok: true, data: listLlmProviders(db).map(row => toLlmProviderProfile(row)) } }
  }

  if (pathname === '/llm-providers' && req.method === 'POST') {
    try {
      const payload = {
        ...parseLlmProviderInput(await readJsonBody(req)),
        builtin: false,
      }
      const created = createLlmProvider(db, payload)
      return { status: 201, body: { ok: true, data: toLlmProviderProfile(created) } }
    }
    catch (error) {
      return errorResult(error, 'Invalid request body')
    }
  }

  const fetchModelsMatch = pathname.match(/^\/llm-providers\/([^/]+)\/fetch-models$/)
  if (fetchModelsMatch && req.method === 'POST') {
    const existing = getLlmProvider(db, fetchModelsMatch[1])

    if (!existing) {
      return { status: 404, body: { ok: false, error: 'LLM provider not found' } }
    }

    try {
      const models = await fetchAvailableModels({
        platformName: existing.format,
        apiKey: existing.apiKey,
        baseUrl: existing.baseUrl,
      })
      const updated = persistFetchedModels(db, existing.id, models) ?? existing

      return {
        body: {
          ok: true,
          data: {
            models,
            provider: toLlmProviderProfile(updated),
          },
        },
      }
    }
    catch (error) {
      return errorResult(error, 'Failed to fetch models')
    }
  }

  const providerMatch = pathname.match(/^\/llm-providers\/([^/]+)$/)
  if (providerMatch && req.method === 'GET') {
    const provider = getLlmProvider(db, providerMatch[1])

    if (!provider) {
      return { status: 404, body: { ok: false, error: 'LLM provider not found' } }
    }

    return { body: { ok: true, data: toLlmProviderProfile(provider) } }
  }

  if (providerMatch && req.method === 'PUT') {
    const existing = getLlmProvider(db, providerMatch[1])

    if (!existing) {
      return { status: 404, body: { ok: false, error: 'LLM provider not found' } }
    }

    try {
      const payload = {
        ...parseLlmProviderInput(await readJsonBody(req)),
        builtin: existing.builtin,
      }
      const updateError = getProviderUpdateError(db, existing.id, payload)
      if (updateError) {
        return updateError
      }

      const updated = updateLlmProvider(db, providerMatch[1], payload)

      if (!updated) {
        throw new Error('Failed to update LLM provider')
      }

      syncReferencedBotBridgeFields(db, updated)
      const syncError = await syncReferencedBots(botManager, listBotsByLlmProviderId(db, updated.id).map(bot => bot.id))
      if (syncError) {
        return {
          status: 500,
          body: { ok: false, error: syncError },
        }
      }

      return { body: { ok: true, data: toLlmProviderProfile(updated) } }
    }
    catch (error) {
      return errorResult(error, 'Invalid request body')
    }
  }

  if (providerMatch && req.method === 'DELETE') {
    const existing = getLlmProvider(db, providerMatch[1])

    if (!existing) {
      return { status: 404, body: { ok: false, error: 'LLM provider not found' } }
    }

    if (existing.builtin) {
      return { status: 409, body: { ok: false, error: 'Built-in LLM providers cannot be deleted' } }
    }

    if (getBotByLlmProviderId(db, existing.id)) {
      return { status: 409, body: { ok: false, error: 'LLM provider is still used by one or more bots' } }
    }

    try {
      deleteLlmProvider(db, existing.id)
      return { body: { ok: true, data: toLlmProviderProfile(existing) } }
    }
    catch (error) {
      return errorResult(error, 'Failed to delete LLM provider')
    }
  }

  return undefined
}

function persistFetchedModels(db: DB, providerId: string, models: string[]) {
  const existing = getLlmProvider(db, providerId)
  if (!existing) {
    return undefined
  }

  const enabledModels = parseStringArray(existing.enabledModels)
  const disabledModels = parseStringArray(existing.disabledModels)
  const knownModels = new Set([...enabledModels, ...disabledModels])
  let changed = false

  for (const model of models) {
    if (knownModels.has(model)) {
      continue
    }

    enabledModels.push(model)
    knownModels.add(model)
    changed = true
  }

  if (!changed) {
    return existing
  }

  enabledModels.sort((a, b) => a.localeCompare(b))
  return updateLlmProvider(db, providerId, {
    enabledModels: JSON.stringify(enabledModels),
  })
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

function errorResult(error: unknown, fallback: string, status = 400): RouteResult {
  return {
    status: getApiErrorStatus(error, status),
    body: { ok: false, error: getApiErrorMessage(error, fallback) },
  }
}

function getProviderUpdateError(
  db: DB,
  providerId: string,
  nextProvider: Pick<LlmProviderRow, 'enabled' | 'format' | 'apiKey' | 'baseUrl' | 'enabledModels'>,
): RouteResult | undefined {
  const referencedBots = listBotsByLlmProviderId(db, providerId)
  if (referencedBots.length === 0) {
    return undefined
  }

  if (!nextProvider.enabled) {
    return {
      status: 409,
      body: { ok: false, error: 'LLM provider is still used by one or more bots and cannot be disabled' },
    }
  }

  if (!isTask4BotSelectableProvider(nextProvider) || !hasTask4BridgeRuntimeConfig(nextProvider)) {
    return {
      status: 409,
      body: { ok: false, error: 'LLM provider is still used by one or more bots and cannot lose required bridge credentials' },
    }
  }

  const enabledModels = new Set(parseStringArray(nextProvider.enabledModels))
  const missingModel = referencedBots.some(bot => !enabledModels.has(bot.llmModel))
  if (missingModel) {
    return {
      status: 409,
      body: { ok: false, error: 'LLM provider is still used by one or more bots and cannot remove models they use' },
    }
  }

  return undefined
}

function syncReferencedBotBridgeFields(db: DB, provider: Pick<LlmProviderRow, 'id' | 'name' | 'apiKey' | 'baseUrl'>) {
  updateBotsByLlmProviderId(db, provider.id, {
    llmPlatformName: provider.name,
    llmApiKey: provider.apiKey,
    llmBaseUrl: provider.baseUrl,
    updatedAt: new Date(),
  })
}

async function syncReferencedBots(botManager: BotManager, botIds: string[]) {
  const failedBotIds: string[] = []

  for (const botId of botIds) {
    try {
      await botManager.syncInstance(botId)
    }
    catch (error) {
      failedBotIds.push(botId)
      console.error(`[ApiServer] Failed to sync bot "${botId}" after provider update:`, error)
    }
  }

  return failedBotIds.length > 0
    ? `Updated provider but failed to sync one or more bots: ${failedBotIds.join(', ')}`
    : undefined
}
