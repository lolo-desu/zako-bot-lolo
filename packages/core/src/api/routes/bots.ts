import { randomUUID } from 'crypto'
import type http from 'http'
import {
  createBot,
  deleteBot,
  getBotWithRole,
  getLlmProvider,
  getRole,
  listBotsWithRoles,
  updateBot,
} from '@zakobot/database'
import type { DB } from '@zakobot/database'
import {
  hasTask4BridgeRuntimeConfig,
  isTask4BridgeCompatibleProviderFormat,
} from '@zakobot/shared'
import type { ApiResponse } from '@zakobot/shared'
import type { LlmProviderRow } from '@zakobot/database'
import type { BotManager } from '../../bot/bot-manager.js'
import { getApiErrorMessage, getApiErrorStatus, readJsonBody } from '../http.js'
import { toBotListItem, toBotProfile } from '../serializers.js'
import { parseBotInput } from '../validators.js'

type RouteResult = {
  status?: number
  body: ApiResponse<unknown>
}

type RouteDeps = {
  botManager: BotManager
  db: DB
}

export async function getBotsRoute(
  req: http.IncomingMessage,
  pathname: string,
  { botManager, db }: RouteDeps,
): Promise<RouteResult | undefined> {
  if (pathname === '/bots' && req.method === 'GET') {
    return {
      body: {
        ok: true,
        data: listBotsWithRoles(db).map(row => toBotListItem(row)),
      },
    }
  }

  if (pathname === '/bots' && req.method === 'POST') {
    try {
      const payload = parseBotInput(await readJsonBody(req))

      if (!getRole(db, payload.roleId)) {
        return { status: 404, body: { ok: false, error: 'Role not found' } }
      }

      const runtimeConfig = getRuntimeBotConfig(db, payload)
      if ('error' in runtimeConfig) {
        return runtimeConfig.error
      }

      if ('provider' in runtimeConfig && !providerHasEnabledModel(runtimeConfig.provider, payload.llmModel)) {
        return {
          status: 400,
          body: { ok: false, error: 'Selected LLM model is not enabled for the provider' },
        }
      }

      const now = new Date()
      const created = createBot(db, {
        id: randomUUID(),
        name: payload.name,
        platform: payload.platform,
        token: payload.token,
        roleId: payload.roleId,
        llmProvider: payload.llmProvider,
        llmProviderId: runtimeConfig.id,
        llmPlatformName: runtimeConfig.name,
        llmModel: payload.llmModel,
        llmApiKey: runtimeConfig.apiKey,
        llmBaseUrl: runtimeConfig.baseUrl,
        discordUserId: payload.discordUserId,
        discordChannelId: payload.discordChannelId,
        discordGuildId: payload.discordGuildId,
        enabled: payload.enabled,
        createdAt: now,
        updatedAt: now,
      })

      if (!created) {
        throw new Error('Failed to create bot')
      }

      const createSyncError = await syncBotRuntime(botManager, created.instance.id, created.instance.name)
      if (createSyncError) {
        return {
          status: 500,
          body: { ok: false, error: `Bot was saved but failed to sync runtime: ${createSyncError}` },
        }
      }

      return { status: 201, body: { ok: true, data: toBotProfile(created) } }
    }
    catch (error) {
      return errorResult(error, 'Invalid request body')
    }
  }

  const botMatch = pathname.match(/^\/bots\/([^/]+)$/)
  if (botMatch && req.method === 'GET') {
    const bot = getBotWithRole(db, botMatch[1])

    if (!bot) {
      return { status: 404, body: { ok: false, error: 'Bot not found' } }
    }

    return { body: { ok: true, data: toBotProfile(bot) } }
  }

  if (botMatch && req.method === 'PUT') {
    const existing = getBotWithRole(db, botMatch[1])

    if (!existing) {
      return { status: 404, body: { ok: false, error: 'Bot not found' } }
    }

    try {
      const payload = parseBotInput(await readJsonBody(req), {
        allowLegacyLlmConfig: !existing.instance.llmProviderId?.trim(),
      })

      if (!getRole(db, payload.roleId)) {
        return { status: 404, body: { ok: false, error: 'Role not found' } }
      }

      const runtimeConfig = getRuntimeBotConfig(db, payload, {
        allowLegacyLlmConfig: !existing.instance.llmProviderId?.trim(),
      })
      if ('error' in runtimeConfig) {
        return runtimeConfig.error
      }

      if ('provider' in runtimeConfig && !providerHasEnabledModel(runtimeConfig.provider, payload.llmModel)) {
        return {
          status: 400,
          body: { ok: false, error: 'Selected LLM model is not enabled for the provider' },
        }
      }

      const updated = updateBot(db, botMatch[1], {
        name: payload.name,
        platform: payload.platform,
        token: payload.token,
        roleId: payload.roleId,
        llmProvider: payload.llmProvider,
        llmProviderId: runtimeConfig.id,
        llmPlatformName: runtimeConfig.name,
        llmModel: payload.llmModel,
        llmApiKey: runtimeConfig.apiKey,
        llmBaseUrl: runtimeConfig.baseUrl,
        discordUserId: payload.discordUserId,
        discordChannelId: payload.discordChannelId,
        discordGuildId: payload.discordGuildId,
        enabled: payload.enabled,
        updatedAt: new Date(),
      })

      if (!updated) {
        throw new Error('Failed to update bot')
      }

      const updateSyncError = await syncBotRuntime(botManager, updated.instance.id, updated.instance.name)
      if (updateSyncError) {
        return {
          status: 500,
          body: { ok: false, error: `Bot was updated but failed to sync runtime: ${updateSyncError}` },
        }
      }

      return { body: { ok: true, data: toBotProfile(updated) } }
    }
    catch (error) {
      return errorResult(error, 'Invalid request body')
    }
  }

  if (botMatch && req.method === 'DELETE') {
    const existing = getBotWithRole(db, botMatch[1])

    if (!existing) {
      return { status: 404, body: { ok: false, error: 'Bot not found' } }
    }

    try {
      await botManager.stopOne(botMatch[1])
      deleteBot(db, botMatch[1])
      return { body: { ok: true, data: toBotProfile(existing) } }
    }
    catch (error) {
      return errorResult(error, 'Failed to delete bot')
    }
  }

  return undefined
}

function errorResult(error: unknown, fallback: string, status = 400): RouteResult {
  return {
    status: getApiErrorStatus(error, status),
    body: { ok: false, error: getApiErrorMessage(error, fallback) },
  }
}

function getProviderBridgeConfig(db: DB, llmProviderId: string):
  | { id: string; name: string; apiKey: string; baseUrl: string; provider: LlmProviderRow }
  | { error: RouteResult } {
  if (!llmProviderId) {
    return { error: { status: 400, body: { ok: false, error: 'LLM provider is required' } } }
  }

  const provider = getLlmProvider(db, llmProviderId)
  if (!provider) {
    return { error: { status: 404, body: { ok: false, error: 'LLM provider not found' } } }
  }

  if (!isTask4BridgeCompatibleProviderFormat(provider.format)) {
    return {
      error: {
        status: 400,
        body: { ok: false, error: 'Selected LLM provider format is not supported for bot runtime yet' },
      },
    }
  }

  if (!hasTask4BridgeRuntimeConfig(provider)) {
    return {
      error: {
        status: 400,
        body: { ok: false, error: 'Selected LLM provider is missing base URL or API key' },
      },
    }
  }

  if (!provider.enabled) {
    return {
      error: {
        status: 400,
        body: { ok: false, error: 'Selected LLM provider is disabled' },
      },
    }
  }

  return {
    id: provider.id,
    name: provider.name,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    provider,
  }
}

function getRuntimeBotConfig(
  db: DB,
  payload: {
    llmProviderId: string
    llmPlatformName: string
    llmApiKey: string
    llmBaseUrl: string
  },
  options: { allowLegacyLlmConfig?: boolean } = {},
):
  | { id: string | null; name: string; apiKey: string; baseUrl: string }
  | { id: string; name: string; apiKey: string; baseUrl: string; provider: LlmProviderRow }
  | { error: RouteResult } {
  if (!payload.llmProviderId) {
    if (!options.allowLegacyLlmConfig) {
      return { error: { status: 400, body: { ok: false, error: 'LLM provider is required' } } }
    }

    return {
      id: null,
      name: payload.llmPlatformName,
      apiKey: payload.llmApiKey,
      baseUrl: payload.llmBaseUrl,
    }
  }

  return getProviderBridgeConfig(db, payload.llmProviderId)
}

function providerHasEnabledModel(provider: Pick<LlmProviderRow, 'enabledModels'>, model: string) {
  return parseStringArray(provider.enabledModels).includes(model)
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

async function syncBotRuntime(botManager: BotManager, botId: string, botName: string) {
  try {
    await botManager.syncInstance(botId)
    return undefined
  }
  catch (error) {
    console.error(`[ApiServer] Failed to sync bot "${botName}":`, error)
    return error instanceof Error ? error.message : String(error)
  }
}
