import { randomUUID } from 'crypto'
import type http from 'http'
import {
  createBot,
  deleteBot,
  getBotWithRole,
  getRole,
  listBotsWithRoles,
  updateBot,
} from '@zakobot/database'
import type { DB } from '@zakobot/database'
import type { ApiResponse } from '@zakobot/shared'
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

      const now = new Date()
      const created = createBot(db, {
        id: randomUUID(),
        name: payload.name,
        platform: payload.platform,
        token: payload.token,
        roleId: payload.roleId,
        llmProvider: payload.llmProvider,
        llmPlatformName: payload.llmPlatformName,
        llmModel: payload.llmModel,
        llmApiKey: payload.llmApiKey,
        llmBaseUrl: payload.llmBaseUrl,
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

      await botManager.syncInstance(created.instance.id).catch((error) => {
        console.error(`[ApiServer] Failed to sync bot "${created.instance.name}":`, error)
      })

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
      const payload = parseBotInput(await readJsonBody(req))

      if (!getRole(db, payload.roleId)) {
        return { status: 404, body: { ok: false, error: 'Role not found' } }
      }

      const updated = updateBot(db, botMatch[1], {
        name: payload.name,
        platform: payload.platform,
        token: payload.token,
        roleId: payload.roleId,
        llmProvider: payload.llmProvider,
        llmPlatformName: payload.llmPlatformName,
        llmModel: payload.llmModel,
        llmApiKey: payload.llmApiKey,
        llmBaseUrl: payload.llmBaseUrl,
        discordUserId: payload.discordUserId,
        discordChannelId: payload.discordChannelId,
        discordGuildId: payload.discordGuildId,
        enabled: payload.enabled,
        updatedAt: new Date(),
      })

      if (!updated) {
        throw new Error('Failed to update bot')
      }

      await botManager.syncInstance(updated.instance.id).catch((error) => {
        console.error(`[ApiServer] Failed to sync bot "${updated.instance.name}":`, error)
      })

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
