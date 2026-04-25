import http from 'http'
import { randomUUID } from 'crypto'
import {
  createBot,
  createMcpServer,
  createRole,
  deleteBot,
  deleteMcpServer,
  deleteRole,
  getBotWithRole,
  getMcpServer,
  getRole,
  listBotsWithRoles,
  listMcpServers,
  listRoles,
  updateBot,
  updateMcpServer,
  updateRole,
} from '@zakobot/database'
import type { DB } from '@zakobot/database'
import type { BotManager } from '../bot/bot-manager.js'
import type { PluginLoader } from '../plugins/loader.js'
import type { McpManager } from '../mcp/index.js'
import type { SkillManager } from '../skills/index.js'
import { getApiErrorMessage, getApiErrorStatus, readJsonBody, writeApiError, writeJson } from './http.js'
import { toBotListItem, toBotProfile, toConversationMessage, toConversationTopic, toMcpServerProfile, toRoleProfile } from './serializers.js'
import {
  parseBotInput,
  parseBrowseSettingsInput,
  parseCreateConversationTopicInput,
  parseGeneralSettingsInput,
  parseLocalMemorySettingsInput,
  parseMcpServerInput,
  parseRoleInput,
  parseSearchSettingsInput,
  parseSendConversationMessageInput,
  parseSkillImportInput,
  parseSkillInput,
} from './validators.js'
import { getSearchSettings, saveSearchSettings } from '../settings/search-settings.js'
import { getBrowseSettings, saveBrowseSettings } from '../settings/browse-settings.js'
import { getGeneralSettings, saveGeneralSettings } from '../settings/general-settings.js'
import { getLocalMemorySettings, saveLocalMemorySettings } from '../settings/local-memory-settings.js'
import type {
  ApiResponse,
  BotEditorInput,
  CreateConversationTopicInput,
  McpServerEditorInput,
  McpServerStatus,
  SendConversationMessageInput,
  SendConversationMessageResult,
  SkillContent,
  SkillEditorInput,
  SkillImportInput,
  SkillProfile,
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

    if (pathname === '/status' && req.method === 'GET') {
      const { botsOnline, instances } = this.botManager.getStatus()
      return this.json(res, {
        ok: true,
        data: {
          uptime: process.uptime(),
          botsOnline,
          botsTotal: instances.length,
          pluginsLoaded: this.pluginLoader.list().length,
        },
      })
    }

    if (pathname === '/plugins' && req.method === 'GET') {
      return this.json(res, { ok: true, data: this.pluginLoader.list() })
    }

    if (pathname === '/skills' && req.method === 'GET') {
      return this.json<SkillProfile[]>(res, { ok: true, data: this.skillManager.list() })
    }

    if (pathname === '/skills' && req.method === 'POST') {
      try {
        const payload = parseSkillInput(await this.readJson<SkillEditorInput>(req))
        return this.json<SkillProfile>(res, { ok: true, data: this.skillManager.create(payload) }, 201)
      }
      catch (error) {
        return this.error(res, error, 'Invalid request body')
      }
    }

    if (pathname === '/skills/import' && req.method === 'POST') {
      try {
        const payload = parseSkillImportInput(await this.readJson<SkillImportInput>(req))
        return this.json<SkillProfile>(res, { ok: true, data: this.skillManager.import(payload) }, 201)
      }
      catch (error) {
        return this.error(res, error, 'Invalid request body')
      }
    }

    if (pathname === '/mcp/status' && req.method === 'GET') {
      return this.json(res, { ok: true, data: this.listMcpStatus() })
    }

    if (pathname === '/mcp/servers' && req.method === 'GET') {
      return this.json(res, {
        ok: true,
        data: listMcpServers(this.db).map(row => toMcpServerProfile(row)),
      })
    }

    if (pathname === '/mcp/servers' && req.method === 'POST') {
      try {
        const payload = parseMcpServerInput(await this.readJson<McpServerEditorInput>(req))
        const created = createMcpServer(this.db, payload)

        if (created.enabled) {
          this.mcpManager.connect(created).catch((error) => {
            console.error(`[ApiServer] Failed to connect MCP server "${created.name}":`, error)
          })
        }

        return this.json(res, { ok: true, data: toMcpServerProfile(created) }, 201)
      }
      catch (error) {
        return this.error(res, error, 'Invalid request body')
      }
    }

    if (pathname === '/settings/search' && req.method === 'GET') {
      return this.json(res, { ok: true, data: getSearchSettings(this.db) })
    }

    if (pathname === '/settings/search' && req.method === 'PUT') {
      try {
        const payload = parseSearchSettingsInput(await this.readJson(req))
        return this.json(res, { ok: true, data: saveSearchSettings(this.db, payload) })
      }
      catch (error) {
        return this.error(res, error, 'Invalid request body')
      }
    }

    if (pathname === '/settings/browse' && req.method === 'GET') {
      return this.json(res, { ok: true, data: getBrowseSettings(this.db) })
    }

    if (pathname === '/settings/browse' && req.method === 'PUT') {
      try {
        const payload = parseBrowseSettingsInput(await this.readJson(req))
        return this.json(res, { ok: true, data: saveBrowseSettings(this.db, payload) })
      }
      catch (error) {
        return this.error(res, error, 'Invalid request body')
      }
    }

    if (pathname === '/settings/general' && req.method === 'GET') {
      return this.json(res, { ok: true, data: getGeneralSettings(this.db) })
    }

    if (pathname === '/settings/general' && req.method === 'PUT') {
      try {
        const payload = parseGeneralSettingsInput(await this.readJson(req))
        return this.json(res, { ok: true, data: saveGeneralSettings(this.db, payload) })
      }
      catch (error) {
        return this.error(res, error, 'Invalid request body')
      }
    }

    if (pathname === '/settings/memory' && req.method === 'GET') {
      return this.json(res, { ok: true, data: getLocalMemorySettings(this.db) })
    }

    if (pathname === '/settings/memory' && req.method === 'PUT') {
      try {
        const payload = parseLocalMemorySettingsInput(await this.readJson(req))
        return this.json(res, { ok: true, data: saveLocalMemorySettings(this.db, payload) })
      }
      catch (error) {
        return this.error(res, error, 'Invalid request body')
      }
    }

    const mcpServerReconnectMatch = pathname.match(/^\/mcp\/servers\/([^/]+)\/reconnect$/)
    if (mcpServerReconnectMatch && req.method === 'POST') {
      const server = getMcpServer(this.db, mcpServerReconnectMatch[1])

      if (!server) {
        return this.json(res, { ok: false, error: 'MCP server not found' }, 404)
      }

      try {
        await this.mcpManager.reconnect(server)
        return this.json(res, { ok: true, data: toMcpServerProfile(server) })
      }
      catch (error) {
        return this.error(res, error, 'Failed to reconnect MCP server')
      }
    }

    const mcpServerMatch = pathname.match(/^\/mcp\/servers\/([^/]+)$/)
    if (mcpServerMatch && req.method === 'GET') {
      const server = getMcpServer(this.db, mcpServerMatch[1])

      if (!server) {
        return this.json(res, { ok: false, error: 'MCP server not found' }, 404)
      }

      return this.json(res, { ok: true, data: toMcpServerProfile(server) })
    }

    if (mcpServerMatch && req.method === 'PUT') {
      const existing = getMcpServer(this.db, mcpServerMatch[1])

      if (!existing) {
        return this.json(res, { ok: false, error: 'MCP server not found' }, 404)
      }

      try {
        const payload = parseMcpServerInput(await this.readJson<McpServerEditorInput>(req))
        const updated = updateMcpServer(this.db, mcpServerMatch[1], payload)

        if (!updated) {
          throw new Error('Failed to update MCP server')
        }

        if (updated.enabled) {
          this.mcpManager.reconnect(updated).catch((error) => {
            console.error(`[ApiServer] Failed to reconnect MCP server "${updated.name}":`, error)
          })
        }
        else {
          await this.mcpManager.disconnect(updated.id)
        }

        return this.json(res, { ok: true, data: toMcpServerProfile(updated) })
      }
      catch (error) {
        return this.error(res, error, 'Invalid request body')
      }
    }

    if (mcpServerMatch && req.method === 'DELETE') {
      const existing = getMcpServer(this.db, mcpServerMatch[1])

      if (!existing) {
        return this.json(res, { ok: false, error: 'MCP server not found' }, 404)
      }

      try {
        await this.mcpManager.disconnect(existing.id)
        deleteMcpServer(this.db, existing.id)
        return this.json(res, { ok: true, data: toMcpServerProfile(existing) })
      }
      catch (error) {
        return this.error(res, error, 'Failed to delete MCP server')
      }
    }

    if (pathname === '/roles' && req.method === 'GET') {
      return this.json(res, { ok: true, data: listRoles(this.db).map(row => toRoleProfile(row)) })
    }

    if (pathname === '/roles' && req.method === 'POST') {
      try {
        const payload = parseRoleInput(await this.readJson(req))
        const now = new Date()
        const created = createRole(this.db, {
          id: randomUUID(),
          avatar: payload.avatar,
          name: payload.name,
          systemPrompt: payload.systemPrompt,
          llmProvider: 'openai',
          llmModel: '',
          llmApiKey: '',
          llmBaseUrl: null,
          enabledTools: JSON.stringify(payload.enabledTools),
          enabledSkills: JSON.stringify(payload.enabledSkills),
          createdAt: now,
          updatedAt: now,
        })

        return this.json(res, { ok: true, data: toRoleProfile(created!) }, 201)
      }
      catch (error) {
        return this.error(res, error, 'Invalid request body')
      }
    }

    if (pathname === '/bots' && req.method === 'GET') {
      return this.json(res, {
        ok: true,
        data: listBotsWithRoles(this.db).map(row => toBotListItem(row)),
      })
    }

    if (pathname === '/conversations' && req.method === 'GET') {
      const botInstanceId = searchParams.get('botInstanceId')?.trim()

      if (!botInstanceId) {
        return this.json(res, { ok: false, error: 'Bot instance ID is required' }, 400)
      }

      try {
        const topics = this.botManager
          .listConversationTopics(botInstanceId)
          .map(topic => toConversationTopic(topic))

        return this.json(res, { ok: true, data: topics })
      }
      catch (error) {
        const message = this.errorMessage(error, 'Failed to load conversation topics')
        const status = message.includes('not found') ? 404 : 400
        return this.json(res, { ok: false, error: message }, this.errorStatus(error, status))
      }
    }

    if (pathname === '/conversations' && req.method === 'POST') {
      try {
        const payload = parseCreateConversationTopicInput(await this.readJson<CreateConversationTopicInput>(req))
        const topic = this.botManager.startPanelConversation(payload.botInstanceId)
        return this.json(res, { ok: true, data: toConversationTopic(topic) }, 201)
      }
      catch (error) {
        const message = this.errorMessage(error, 'Failed to create conversation topic')
        const status = message.includes('not found') ? 404 : 400
        return this.json(res, { ok: false, error: message }, this.errorStatus(error, status))
      }
    }

    if (pathname === '/conversations/messages' && req.method === 'POST') {
      try {
        const payload = parseSendConversationMessageInput(await this.readJson<SendConversationMessageInput>(req))
        const result = await this.botManager.sendPanelMessage(payload.botInstanceId, payload.content, payload.topicId)
        const data: SendConversationMessageResult = {
          topic: toConversationTopic(result.topic),
          userMessage: toConversationMessage(result.userMessage),
          assistantMessage: toConversationMessage(result.assistantMessage),
        }

        return this.json(res, { ok: true, data })
      }
      catch (error) {
        const message = this.errorMessage(error, 'Failed to send conversation message')
        const status = message.includes('not found') ? 404 : 400
        return this.json(res, { ok: false, error: message }, this.errorStatus(error, status))
      }
    }

    const conversationMatch = pathname.match(/^\/conversations\/([^/]+)$/)
    if (conversationMatch && req.method === 'DELETE') {
      const botInstanceId = searchParams.get('botInstanceId')?.trim()

      if (!botInstanceId) {
        return this.json(res, { ok: false, error: 'Bot instance ID is required' }, 400)
      }

      try {
        const topic = await this.botManager.deleteConversationTopic(botInstanceId, conversationMatch[1])
        return this.json(res, { ok: true, data: toConversationTopic(topic) })
      }
      catch (error) {
        const message = this.errorMessage(error, 'Failed to delete conversation topic')
        const status = message.includes('not found') ? 404 : 400
        return this.json(res, { ok: false, error: message }, this.errorStatus(error, status))
      }
    }

    if (pathname === '/bots' && req.method === 'POST') {
      try {
        const payload = parseBotInput(await this.readJson<BotEditorInput>(req))

        if (!getRole(this.db, payload.roleId)) {
          return this.json(res, { ok: false, error: 'Role not found' }, 404)
        }

        const now = new Date()
        const created = createBot(this.db, {
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

        await this.botManager.syncInstance(created.instance.id).catch((error) => {
          console.error(`[ApiServer] Failed to sync bot "${created.instance.name}":`, error)
        })

        return this.json(res, { ok: true, data: toBotProfile(created) }, 201)
      }
      catch (error) {
        return this.error(res, error, 'Invalid request body')
      }
    }

    const roleMatch = pathname.match(/^\/roles\/([^/]+)$/)
    if (roleMatch && req.method === 'GET') {
      const role = getRole(this.db, roleMatch[1])

      if (!role) {
        return this.json(res, { ok: false, error: 'Role not found' }, 404)
      }

      return this.json(res, { ok: true, data: toRoleProfile(role) })
    }

    if (roleMatch && req.method === 'PUT') {
      const existing = getRole(this.db, roleMatch[1])

      if (!existing) {
        return this.json(res, { ok: false, error: 'Role not found' }, 404)
      }

      try {
        const payload = parseRoleInput(await this.readJson(req))
        const updated = updateRole(this.db, roleMatch[1], {
          avatar: payload.avatar,
          name: payload.name,
          systemPrompt: payload.systemPrompt,
          enabledTools: JSON.stringify(payload.enabledTools),
          enabledSkills: JSON.stringify(payload.enabledSkills),
          updatedAt: new Date(),
        })

        return this.json(res, { ok: true, data: toRoleProfile(updated!) })
      }
      catch (error) {
        return this.error(res, error, 'Invalid request body')
      }
    }

    const skillContentMatch = pathname.match(/^\/skills\/([^/]+)\/content$/)
    if (skillContentMatch && req.method === 'GET') {
      try {
        return this.json<SkillContent>(res, { ok: true, data: this.skillManager.getContent(skillContentMatch[1]) })
      }
      catch (error) {
        return this.error(res, error, 'Skill not found', 404)
      }
    }

    const skillMatch = pathname.match(/^\/skills\/([^/]+)$/)
    if (skillMatch && req.method === 'GET') {
      const skill = this.skillManager.get(skillMatch[1])

      if (!skill) {
        return this.json(res, { ok: false, error: 'Skill not found' }, 404)
      }

      return this.json<SkillProfile>(res, { ok: true, data: skill })
    }

    if (skillMatch && req.method === 'PUT') {
      if (!this.skillManager.get(skillMatch[1])) {
        return this.json(res, { ok: false, error: 'Skill not found' }, 404)
      }

      try {
        const payload = parseSkillInput(await this.readJson<SkillEditorInput>(req))
        return this.json<SkillProfile>(res, { ok: true, data: this.skillManager.update(skillMatch[1], payload) })
      }
      catch (error) {
        return this.error(res, error, 'Invalid request body')
      }
    }

    if (skillMatch && req.method === 'DELETE') {
      if (!this.skillManager.get(skillMatch[1])) {
        return this.json(res, { ok: false, error: 'Skill not found' }, 404)
      }

      try {
        return this.json<SkillProfile>(res, { ok: true, data: this.skillManager.remove(skillMatch[1]) })
      }
      catch (error) {
        return this.error(res, error, 'Failed to delete skill')
      }
    }

    if (roleMatch && req.method === 'DELETE') {
      const existing = getRole(this.db, roleMatch[1])

      if (!existing) {
        return this.json(res, { ok: false, error: 'Role not found' }, 404)
      }

      try {
        deleteRole(this.db, roleMatch[1])
        return this.json(res, { ok: true, data: toRoleProfile(existing) })
      }
      catch (error) {
        const message = this.errorMessage(error, 'Failed to delete role')
        const status = message.includes('FOREIGN KEY constraint failed') ? 409 : 400
        const userMessage = status === 409 ? 'Role is still used by existing bots' : message
        return this.json(res, { ok: false, error: userMessage }, this.errorStatus(error, status))
      }
    }

    const botMatch = pathname.match(/^\/bots\/([^/]+)$/)
    if (botMatch && req.method === 'GET') {
      const bot = getBotWithRole(this.db, botMatch[1])

      if (!bot) {
        return this.json(res, { ok: false, error: 'Bot not found' }, 404)
      }

      return this.json(res, { ok: true, data: toBotProfile(bot) })
    }

    if (botMatch && req.method === 'PUT') {
      const existing = getBotWithRole(this.db, botMatch[1])

      if (!existing) {
        return this.json(res, { ok: false, error: 'Bot not found' }, 404)
      }

      try {
        const payload = parseBotInput(await this.readJson<BotEditorInput>(req))

        if (!getRole(this.db, payload.roleId)) {
          return this.json(res, { ok: false, error: 'Role not found' }, 404)
        }

        const updated = updateBot(this.db, botMatch[1], {
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

        await this.botManager.syncInstance(updated.instance.id).catch((error) => {
          console.error(`[ApiServer] Failed to sync bot "${updated.instance.name}":`, error)
        })

        return this.json(res, { ok: true, data: toBotProfile(updated) })
      }
      catch (error) {
        return this.error(res, error, 'Invalid request body')
      }
    }

    if (botMatch && req.method === 'DELETE') {
      const existing = getBotWithRole(this.db, botMatch[1])

      if (!existing) {
        return this.json(res, { ok: false, error: 'Bot not found' }, 404)
      }

      try {
        await this.botManager.stopOne(botMatch[1])
        deleteBot(this.db, botMatch[1])
        return this.json(res, { ok: true, data: toBotProfile(existing) })
      }
      catch (error) {
        return this.error(res, error, 'Failed to delete bot')
      }
    }

    const conversationMessagesMatch = pathname.match(/^\/conversations\/([^/]+)\/messages$/)
    if (conversationMessagesMatch && req.method === 'GET') {
      const botInstanceId = searchParams.get('botInstanceId')?.trim()

      if (!botInstanceId) {
        return this.json(res, { ok: false, error: 'Bot instance ID is required' }, 400)
      }

      try {
        const messages = this.botManager
          .listConversationMessages(botInstanceId, conversationMessagesMatch[1])
          .map(message => toConversationMessage(message))

        return this.json(res, { ok: true, data: messages })
      }
      catch (error) {
        const message = this.errorMessage(error, 'Failed to load conversation messages')
        const status = message.includes('not found') ? 404 : 400
        return this.json(res, { ok: false, error: message }, this.errorStatus(error, status))
      }
    }

    return this.json(res, { ok: false, error: 'Not found' }, 404)
  }
}
