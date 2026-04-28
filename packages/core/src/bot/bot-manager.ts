import { randomUUID } from 'crypto'
import type {
  ConversationMessageRow,
  ConversationTopicRow,
  DB,
  BotInstanceRow,
  RoleRow,
} from '@zakobot/database'
import { getEnabledBots, getBotWithRole, getLlmProvider, getRole, updateBot } from '@zakobot/database'
import type { GeneralSettings, LocalMemorySettings } from '@zakobot/shared'
import { hasTask4BridgeRuntimeConfig, isTask4BridgeCompatibleProviderFormat } from '@zakobot/shared'
import { DiscordAdapter } from './discord-adapter.js'
import { runPostReplyHooks } from './post-reply-hooks.js'
import { Agent } from '../llm/agent.js'
import { ConversationService } from '../llm/conversation-service.js'
import { fetchAvailableModels } from '../llm/list-models.js'
import { toProviderLlmConfig } from '../llm/provider-config.js'
import type { ToolRegistry } from '../tools/index.js'
import type { SkillManager } from '../skills/index.js'
import { LocalMemoryService } from '../memory/local-memory-service.js'

export class BotManager {
  private adapters = new Map<string, DiscordAdapter>()
  private conversations: ConversationService
  private localMemoryService: LocalMemoryService

  constructor(
    private db: DB,
    private toolRegistry: ToolRegistry,
    private skillManager: SkillManager,
    private getGeneralSettings: () => GeneralSettings,
    getLocalMemorySettings: () => LocalMemorySettings,
  ) {
    this.conversations = new ConversationService(db)
    this.localMemoryService = new LocalMemoryService(db, getLocalMemorySettings)
  }

  async startAll() {
    const rows = getEnabledBots(this.db)
    for (const row of rows) {
      await this.startInstance(row).catch((err) =>
        console.error(`[BotManager] Failed to start "${row.instance.name}":`, err),
      )
    }
    console.log(`[BotManager] ${this.adapters.size} bot(s) online.`)
  }

  async startOne(instanceId: string) {
    const row = getBotWithRole(this.db, instanceId)
    if (!row) throw new Error(`Bot instance "${instanceId}" not found`)
    await this.startInstance(row)
  }

  async syncInstance(instanceId: string) {
    const row = getBotWithRole(this.db, instanceId)

    if (!row || !row.instance.enabled) {
      await this.stopOne(instanceId)
      return
    }

    if (this.adapters.has(instanceId)) {
      await this.stopOne(instanceId)
    }

    await this.startInstance(row)
  }

  listConversationTopics(instanceId: string): ConversationTopicRow[] {
    this.requireBotRow(instanceId)
    return this.conversations.listTopics(instanceId)
  }

  listConversationMessages(instanceId: string, topicId: string): ConversationMessageRow[] {
    const row = this.requireBotRow(instanceId)
    const topic = this.conversations.getTopic(topicId)

    if (!topic || topic.botInstanceId !== row.instance.id) {
      throw new Error(`Conversation topic "${topicId}" not found`)
    }

    return this.conversations.listTopicMessages(topicId)
  }

  async deleteConversationTopic(instanceId: string, topicId: string): Promise<ConversationTopicRow> {
    const row = this.requireBotRow(instanceId)
    const topic = this.conversations.getTopic(topicId)

    if (!topic || topic.botInstanceId !== row.instance.id) {
      throw new Error(`Conversation topic "${topicId}" not found`)
    }

    const metadata = this.parseJsonRecord(topic.metadata)
    if (topic.sourceType === 'discord_thread') {
      const adapter = this.adapters.get(instanceId)
      if (!adapter) {
        throw new Error(`Bot instance "${instanceId}" is not running`)
      }

      await adapter.deleteConversationThread(topic, metadata)
    }

    return this.conversations.deleteTopic(topicId)!
  }

  startPanelConversation(instanceId: string): ConversationTopicRow {
    const row = this.requireBotRow(instanceId)

    return this.conversations.startNewTopic(row.instance, {
      platform: row.instance.platform,
      scopeKey: `panel:${randomUUID()}`,
      sourceType: 'panel',
      sourceId: 'panel',
      metadata: {},
    })
  }

  async sendPanelMessage(instanceId: string, content: string, topicId?: string) {
    const row = this.requireBotRow(instanceId)
    const resolvedContent = content.trim()

    if (!resolvedContent) {
      throw new Error('Message content is required')
    }

    let topic = topicId ? this.conversations.getTopic(topicId) : undefined
    if (topic && topic.botInstanceId !== row.instance.id) {
      throw new Error(`Conversation topic "${topicId}" not found`)
    }

    if (!topic) {
      topic = this.startPanelConversation(instanceId)
    }

    const scope = {
      platform: row.instance.platform,
      scopeKey: topic.scopeKey,
      sourceType: topic.sourceType,
      sourceId: topic.sourceId,
      metadata: this.parseJsonRecord(topic.metadata),
    }

    const userMessage = this.conversations.appendMessage(row.instance, topic.id, scope, {
      role: 'user',
      content: resolvedContent,
      senderId: 'panel',
      senderName: '控制台',
      metadata: {
        origin: 'panel',
      },
    })!

    const agent = this.createAgent(row)
    const reply = await agent.respond(topic.id, {
      requestApproval: async (_callId, name) => {
        const tool = this.toolRegistry.list().find(item => item.name === name)
        if (tool?.sensitive) {
          return {
            approved: false,
            reason: 'Sensitive tool calls from the panel are blocked because no approval UI is available.',
          }
        }

        return { approved: true }
      },
    })

    const assistantMessage = this.conversations.appendMessage(row.instance, topic.id, scope, {
      role: 'assistant',
      content: reply,
      senderId: row.instance.id,
      senderName: row.instance.name,
      metadata: {
        origin: 'panel',
      },
    })!

    runPostReplyHooks(agent, topic.id)

    return {
      topic: this.conversations.getTopic(topic.id)!,
      userMessage,
      assistantMessage,
    }
  }

  private async startInstance(row: { instance: BotInstanceRow; role: RoleRow }) {
    if (row.instance.platform !== 'discord') {
      console.warn(`[BotManager] Platform "${row.instance.platform}" not yet supported, skipping.`)
      return
    }

    if (!row.instance.llmModel?.trim()) {
      throw new Error(`Bot "${row.instance.name}" is missing LLM configuration`)
    }

    if (!row.instance.llmProviderId?.trim() && (!row.instance.llmApiKey?.trim() || !row.instance.llmBaseUrl?.trim())) {
      throw new Error(`Bot "${row.instance.name}" is missing LLM configuration`)
    }

    this.resolveRuntimeLlmConfig(row.instance)

    if (this.adapters.has(row.instance.id)) {
      await this.stopOne(row.instance.id)
    }

    const agent = this.createAgent(row)
    const adapter = new DiscordAdapter(
      row.instance,
      row.role,
      agent,
      this.conversations,
      this.getGeneralSettings,
      () => this.getCurrentProviderName(row.instance.id),
      () => this.listAvailableModels(row.instance.id),
      (modelId) => this.setModel(row.instance.id, modelId),
    )

    await adapter.start()
    this.adapters.set(row.instance.id, adapter)
  }

  async stopOne(instanceId: string) {
    const adapter = this.adapters.get(instanceId)
    if (!adapter) return
    await adapter.stop()
    this.adapters.delete(instanceId)
  }

  async stopAll() {
    const instanceIds = [...this.adapters.keys()]

    for (const instanceId of instanceIds) {
      await this.stopOne(instanceId)
    }
  }

  async sendMessage(instanceId: string, channelId: string, content: string) {
    const adapter = this.adapters.get(instanceId)
    if (!adapter) throw new Error(`Bot instance "${instanceId}" is not running`)
    await adapter.sendMessage(channelId, content)
  }

  getStatus() {
    return {
      botsOnline: this.adapters.size,
      instances: [...this.adapters.entries()].map(([id, a]) => ({
        id,
        name: a.instance.name,
        platform: a.instance.platform,
      })),
    }
  }

  async listAvailableModels(instanceId: string) {
    const row = this.requireBotRow(instanceId)
    const provider = this.requireBoundProvider(row.instance)
    if (provider) {
      return this.parseStringArray(provider.enabledModels)
    }

    return fetchAvailableModels(this.resolveModelListConfig(row.instance))
  }

  async setModel(instanceId: string, modelId: string) {
    const nextModel = modelId.trim()
    if (!nextModel) {
      throw new Error('Model ID is required')
    }

    const row = this.requireBotRow(instanceId)
    const provider = this.requireBoundProvider(row.instance)
    if (provider) {
      if (!this.parseStringArray(provider.enabledModels).includes(nextModel)) {
        throw new Error('Selected LLM model is not enabled for the provider')
      }
    }

    const updated = updateBot(this.db, instanceId, {
      llmModel: nextModel,
      updatedAt: new Date(),
    })

    if (!updated) {
      throw new Error('Failed to update bot model')
    }

    const adapter = this.adapters.get(instanceId)
    if (adapter) {
      adapter.applyRuntimeUpdate(updated.instance, this.createAgent(updated))
    }

    return updated.instance.llmModel
  }

  private createAgent(row: { instance: BotInstanceRow; role: RoleRow }) {
    const roleId = row.role.id
    const fallbackRole = row.role
    return new Agent(
      row.instance.id,
      () => getRole(this.db, roleId) ?? fallbackRole,
      this.resolveRuntimeLlmConfig(row.instance),
      this.conversations,
      this.toolRegistry,
      this.skillManager,
      this.localMemoryService,
      this.getGeneralSettings,
    )
  }

  private requireBotRow(instanceId: string) {
    const row = getBotWithRole(this.db, instanceId)
    if (!row) {
      throw new Error(`Bot instance "${instanceId}" not found`)
    }

    if (!row.instance.llmModel?.trim()) {
      throw new Error(`Bot "${row.instance.name}" is missing LLM configuration`)
    }

    const providerId = row.instance.llmProviderId?.trim()
    if (providerId) {
      this.requireBoundProvider(row.instance)
      return row
    }

    if (!row.instance.llmApiKey?.trim() || !row.instance.llmBaseUrl?.trim()) {
      throw new Error(`Bot "${row.instance.name}" is missing LLM configuration`)
    }

    return row
  }

  private getCurrentProviderName(instanceId: string) {
    const row = this.requireBotRow(instanceId)
    return this.requireBoundProvider(row.instance)?.name ?? (row.instance.llmPlatformName?.trim() || undefined)
  }

  private requireBoundProvider(instance: BotInstanceRow) {
    const providerId = instance.llmProviderId?.trim()
    if (!providerId) {
      return null
    }

    const provider = getLlmProvider(this.db, providerId)
    if (!provider) {
      throw new Error('LLM provider not found')
    }

    if (!provider.enabled) {
      throw new Error('LLM provider is disabled')
    }

    if (!isTask4BridgeCompatibleProviderFormat(provider.format)) {
      throw new Error('LLM provider format is not supported for bot runtime')
    }

    if (!hasTask4BridgeRuntimeConfig(provider)) {
      throw new Error('LLM provider is missing base URL or API key')
    }

    return provider
  }

  private resolveModelListConfig(instance: BotInstanceRow) {
    const provider = this.requireBoundProvider(instance)
    if (provider) {
      return {
        platformName: provider.format,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
      }
    }

    return {
      platformName: instance.llmPlatformName,
      apiKey: instance.llmApiKey,
      baseUrl: instance.llmBaseUrl,
    }
  }

  private resolveRuntimeLlmConfig(instance: BotInstanceRow) {
    const provider = this.requireBoundProvider(instance)
    if (provider) {
      return toProviderLlmConfig(provider, instance.llmModel)
    }

    return {
      provider: instance.llmProvider as 'openai',
      model: instance.llmModel,
      apiKey: instance.llmApiKey,
      baseUrl: instance.llmBaseUrl,
    }
  }

  private parseJsonRecord(value: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  private parseStringArray(value: string): string[] {
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
}
