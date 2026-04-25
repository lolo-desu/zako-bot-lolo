import type { ApiResponse } from '@zakobot/shared'
import type { BotManager } from '../../bot/bot-manager.js'
import type { PluginLoader } from '../../plugins/loader.js'

type RouteResult = {
  status?: number
  body: ApiResponse<unknown>
}

type SystemRouteContext = {
  botManager: BotManager
  pluginLoader: PluginLoader
}

export function getSystemRoute(pathname: string, method: string | undefined, context: SystemRouteContext): RouteResult | undefined {
  if (pathname === '/status' && method === 'GET') {
    const { botsOnline, instances } = context.botManager.getStatus()

    return {
      body: {
        ok: true,
        data: {
          uptime: process.uptime(),
          botsOnline,
          botsTotal: instances.length,
          pluginsLoaded: context.pluginLoader.list().length,
        },
      },
    }
  }

  if (pathname === '/plugins' && method === 'GET') {
    return { body: { ok: true, data: context.pluginLoader.list() } }
  }

  return undefined
}
