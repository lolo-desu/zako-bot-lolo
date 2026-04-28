import http from 'http'
import {
  getRole,
  listMcpServers,
} from '@zakobot/database'
import type { DB } from '@zakobot/database'
import type { BotManager } from '../bot/bot-manager.js'
import type { PluginLoader } from '../plugins/loader.js'
import type { McpManager } from '../mcp/index.js'
import type { SkillManager } from '../skills/index.js'
import { getApiErrorMessage, getApiErrorStatus, readJsonBody, writeApiError, writeJson } from './http.js'
import { getMcpRoute } from './routes/mcp.js'
import { getBotsRoute } from './routes/bots.js'
import { getConversationsRoute } from './routes/conversations.js'
import { getLlmProvidersRoute } from './routes/llm-providers.js'
import { getRolesRoute } from './routes/roles.js'
import { getSettingsRoute } from './routes/settings.js'
import { getSkillsRoute } from './routes/skills.js'
import { getSystemRoute } from './routes/system.js'
import type {
  ApiResponse,
  McpServerStatus,
} from '@zakobot/shared'

export class ApiServer {
  private server: http.Server
  private started = false

  constructor(
    private db: DB,
    private botManager: BotManager,
    private pluginLoader: PluginLoader,
    private mcpManager: McpManager,
    private skillManager: SkillManager,
  ) {
    this.server = http.createServer((req, res) => {
      void this.handle(req, res).catch((error) => {
        console.error('[ApiServer] Unhandled request error:', error)

        if (res.headersSent) {
          res.destroy(error instanceof Error ? error : undefined)
          return
        }

        this.json(res, { ok: false, error: 'Internal server error' }, 500)
      })
    })
  }

  async start() {
    const port = Number(process.env.CORE_API_PORT ?? 6325)
    await this.listenWithRetry(port, '127.0.0.1')
    this.started = true
    console.log(`[ApiServer] Listening on 127.0.0.1:${port}`)
  }

  async stop() {
    if (!this.started) {
      return
    }

    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })

    this.started = false
    console.log('[ApiServer] Stopped.')
  }

  private async listenWithRetry(port: number, host: string) {
    const attempts = 20
    const retryDelayMs = 250

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await this.listen(port, host)
        return
      } catch (error) {
        const code = this.getErrorCode(error)
        const shouldRetry = code === 'EADDRINUSE' && attempt < attempts

        if (!shouldRetry && code === 'EADDRINUSE') {
          throw new Error(
            `Core API port ${host}:${port} is already in use. Stop the existing core process or set CORE_API_PORT to another port.`,
            { cause: error },
          )
        }

        if (!shouldRetry) {
          throw error
        }

        await new Promise(resolve => setTimeout(resolve, retryDelayMs))
      }
    }
  }

  private listen(port: number, host: string) {
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        this.server.off('error', onError)
        this.server.off('listening', onListening)
      }

      const onError = (error: Error) => {
        cleanup()
        reject(error)
      }

      const onListening = () => {
        cleanup()
        resolve()
      }

      this.server.once('error', onError)
      this.server.once('listening', onListening)
      this.server.listen(port, host)
    })
  }

  private getErrorCode(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : undefined
  }

  private json<T>(res: http.ServerResponse, data: ApiResponse<T>, status = 200) {
    return writeJson(res, data, status)
  }

  private async readJson<T>(req: http.IncomingMessage) {
    return readJsonBody<T>(req)
  }

  private errorMessage(error: unknown, fallback: string) {
    return getApiErrorMessage(error, fallback)
  }

  private errorStatus(error: unknown, fallback = 400) {
    return getApiErrorStatus(error, fallback)
  }

  private error(res: http.ServerResponse, error: unknown, fallback: string, status = 400) {
    return writeApiError(res, error, fallback, status)
  }

  private listMcpStatus(): McpServerStatus[] {
    const statusById = new Map(this.mcpManager.getStatus().map(status => [status.id, status]))

    return listMcpServers(this.db).map((server) => {
      const status = statusById.get(server.id)
      return {
        id: server.id,
        name: server.name,
        connected: status?.connected ?? false,
        toolCount: status?.toolCount ?? 0,
        toolNames: status?.toolNames ?? [],
        error: status?.error,
      }
    })
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const { pathname, searchParams } = url

    const systemRoute = getSystemRoute(pathname, req.method, {
      botManager: this.botManager,
      pluginLoader: this.pluginLoader,
    })
    if (systemRoute) {
      return this.json(res, systemRoute.body, systemRoute.status)
    }

    const skillsRoute = await getSkillsRoute(req, pathname, this.skillManager)
    if (skillsRoute) {
      return this.json(res, skillsRoute.body, skillsRoute.status)
    }

    const mcpRoute = await getMcpRoute(req, pathname, {
      db: this.db,
      listStatus: () => this.listMcpStatus(),
      mcpManager: this.mcpManager,
    })
    if (mcpRoute) {
      return this.json(res, mcpRoute.body, mcpRoute.status)
    }

    const settingsRoute = await getSettingsRoute(req, pathname, this.db)
    if (settingsRoute) {
      return this.json(res, settingsRoute.body, settingsRoute.status)
    }

    const rolesRoute = await getRolesRoute(req, pathname, this.db)
    if (rolesRoute) {
      return this.json(res, rolesRoute.body, rolesRoute.status)
    }

    const llmProvidersRoute = await getLlmProvidersRoute(req, pathname, {
      db: this.db,
      botManager: this.botManager,
    })
    if (llmProvidersRoute) {
      return this.json(res, llmProvidersRoute.body, llmProvidersRoute.status)
    }

    const botsRoute = await getBotsRoute(req, pathname, {
      botManager: this.botManager,
      db: this.db,
    })
    if (botsRoute) {
      return this.json(res, botsRoute.body, botsRoute.status)
    }

    const conversationsRoute = await getConversationsRoute(req, pathname, searchParams, this.botManager)
    if (conversationsRoute) {
      return this.json(res, conversationsRoute.body, conversationsRoute.status)
    }

    return this.json(res, { ok: false, error: 'Not found' }, 404)
  }
}
