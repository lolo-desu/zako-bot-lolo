import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'fs'
import test from 'node:test'
import { tmpdir } from 'os'
import { join } from 'path'
import type Database from 'better-sqlite3'
import { BotManager } from '../../src/bot/bot-manager.js'
import { createBot, createDb, createLlmProvider, createRole, getBot, runMigrations } from '@zakobot/database'
import { DiscordAdapter } from '../../src/bot/discord-adapter.js'

test('BotManager#setModel rejects models that are not enabled for the bot provider', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-bot-manager-model-selection-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)

    const provider = createLlmProvider(db, {
      name: 'Provider One',
      format: 'openai',
      baseUrl: 'https://provider.example',
      apiKey: 'secret',
      enabledModels: JSON.stringify(['gpt-4o']),
      disabledModels: '[]',
      region: '',
      enabled: true,
      builtin: false,
    })

    createRole(db, {
      id: 'role-1',
      avatar: '',
      name: 'Tester',
      systemPrompt: '',
      llmProvider: 'openai',
      llmModel: 'gpt-4o',
      llmApiKey: 'secret',
      llmBaseUrl: null,
      enabledTools: '[]',
      enabledSkills: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    createBot(db, {
      id: 'bot-1',
      name: 'Provider-backed bot',
      platform: 'discord',
      token: 'token',
      roleId: 'role-1',
      llmProvider: 'openai',
      llmProviderId: provider.id,
      llmPlatformName: 'Provider One',
      llmModel: 'gpt-4o',
      llmApiKey: 'secret',
      llmBaseUrl: 'https://provider.example',
      discordUserId: '',
      discordChannelId: '',
      discordGuildId: 'guild-1',
      enabled: true,
      requireMention: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const manager = new BotManager(
      db,
      {
        list: () => [],
      } as any,
      {
        listAvailableForBot: () => [],
      } as any,
      () => ({
        systemPrompt: '',
        maxToolCallRounds: 4,
        requireMention: false,
        threadMode: true,
        maxThreadsPerChannel: 3,
        sendTime: false,
        timezone: 'UTC',
        toolApprovalMode: 'none',
        toolProcessMode: 'none',
      }),
      () => ({
        enabled: true,
        writebackEnabled: true,
        maxMemoriesPerUser: 20,
        retrievalLimit: 5,
        rememberTurns: 12,
        cleanupSchedule: '0 4 * * *',
        cleanupRetentionDays: 180,
        provider: 'openai',
        model: 'gpt-test',
        apiKey: 'test-key',
        baseUrl: '',
      }),
    )

    await assert.rejects(
      manager.setModel('bot-1', 'gpt-4.1'),
      /Selected LLM model is not enabled for the provider/,
    )
    assert.equal(getBot(db, 'bot-1')?.llmModel, 'gpt-4o')
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('BotManager#listAvailableModels uses the linked provider enabled model list as truth', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-bot-manager-provider-listing-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client
  const originalFetch = globalThis.fetch
  const requests: { url: string, authorization: string | null }[] = []

  try {
    runMigrations(db)

    const provider = createLlmProvider(db, {
      name: 'Provider One',
      format: 'openai',
      baseUrl: 'https://provider.example',
      apiKey: 'provider-secret',
      enabledModels: JSON.stringify(['gpt-4o', 'gpt-4.1']),
      disabledModels: '[]',
      region: '',
      enabled: true,
      builtin: false,
    })

    createRole(db, {
      id: 'role-1',
      avatar: '',
      name: 'Tester',
      systemPrompt: '',
      llmProvider: 'openai',
      llmModel: 'gpt-4o',
      llmApiKey: 'role-secret',
      llmBaseUrl: null,
      enabledTools: '[]',
      enabledSkills: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    createBot(db, {
      id: 'bot-1',
      name: 'Provider-backed bot',
      platform: 'discord',
      token: 'token',
      roleId: 'role-1',
      llmProvider: 'openai',
      llmProviderId: provider.id,
      llmPlatformName: 'Stale Bot Config',
      llmModel: 'gpt-4o',
      llmApiKey: 'bot-secret',
      llmBaseUrl: 'https://bot.example',
      discordUserId: '',
      discordChannelId: '',
      discordGuildId: 'guild-1',
      enabled: true,
      requireMention: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      requests.push({
        url: input instanceof Request ? input.url : input.toString(),
        authorization: headers.get('Authorization'),
      })

      return new Response(JSON.stringify({ data: [{ id: 'gpt-4o' }, { id: 'gpt-5' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof globalThis.fetch

    const manager = new BotManager(
      db,
      {
        list: () => [],
      } as any,
      {
        listAvailableForBot: () => [],
      } as any,
      () => ({
        systemPrompt: '',
        maxToolCallRounds: 4,
        requireMention: false,
        threadMode: true,
        maxThreadsPerChannel: 3,
        sendTime: false,
        timezone: 'UTC',
        toolApprovalMode: 'none',
        toolProcessMode: 'none',
      }),
      () => ({
        enabled: true,
        writebackEnabled: true,
        maxMemoriesPerUser: 20,
        retrievalLimit: 5,
        rememberTurns: 12,
        cleanupSchedule: '0 4 * * *',
        cleanupRetentionDays: 180,
        provider: 'openai',
        model: 'gpt-test',
        apiKey: 'test-key',
        baseUrl: '',
      }),
    )

    const models = await manager.listAvailableModels('bot-1')

    assert.deepEqual(models, ['gpt-4o', 'gpt-4.1'])
    assert.deepEqual(requests, [])
  }
  finally {
    globalThis.fetch = originalFetch
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('BotManager#listAvailableModels keeps the legacy fallback path on bot-owned LLM config', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-bot-manager-legacy-listing-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client
  const originalFetch = globalThis.fetch
  const requests: { url: string, authorization: string | null }[] = []

  try {
    runMigrations(db)

    createRole(db, {
      id: 'role-legacy',
      avatar: '',
      name: 'Tester',
      systemPrompt: '',
      llmProvider: 'openai',
      llmModel: 'gpt-4o-mini',
      llmApiKey: 'role-secret',
      llmBaseUrl: null,
      enabledTools: '[]',
      enabledSkills: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    createBot(db, {
      id: 'bot-legacy-listing',
      name: 'Legacy listing bot',
      platform: 'discord',
      token: 'token',
      roleId: 'role-legacy',
      llmProvider: 'openai',
      llmProviderId: null,
      llmPlatformName: 'Legacy OpenAI',
      llmModel: 'gpt-4o-mini',
      llmApiKey: 'bot-secret',
      llmBaseUrl: 'https://legacy.example',
      discordUserId: '',
      discordChannelId: '',
      discordGuildId: 'guild-1',
      enabled: true,
      requireMention: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      requests.push({
        url: input instanceof Request ? input.url : input.toString(),
        authorization: headers.get('Authorization'),
      })

      return new Response(JSON.stringify({ data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4.1-mini' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof globalThis.fetch

    const manager = new BotManager(
      db,
      {
        list: () => [],
      } as any,
      {
        listAvailableForBot: () => [],
      } as any,
      () => ({
        systemPrompt: '',
        maxToolCallRounds: 4,
        requireMention: false,
        threadMode: true,
        maxThreadsPerChannel: 3,
        sendTime: false,
        timezone: 'UTC',
        toolApprovalMode: 'none',
        toolProcessMode: 'none',
      }),
      () => ({
        enabled: true,
        writebackEnabled: true,
        maxMemoriesPerUser: 20,
        retrievalLimit: 5,
        rememberTurns: 12,
        cleanupSchedule: '0 4 * * *',
        cleanupRetentionDays: 180,
        provider: 'openai',
        model: 'gpt-test',
        apiKey: 'test-key',
        baseUrl: '',
      }),
    )

    const models = await manager.listAvailableModels('bot-legacy-listing')

    assert.deepEqual(models, ['gpt-4.1-mini', 'gpt-4o-mini'])
    assert.deepEqual(requests, [{
      url: 'https://legacy.example/v1/models',
      authorization: 'Bearer bot-secret',
    }])
  }
  finally {
    globalThis.fetch = originalFetch
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('BotManager#setModel rejects switching models when the linked provider is disabled', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-bot-manager-disabled-provider-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)

    const provider = createLlmProvider(db, {
      name: 'Provider One',
      format: 'openai',
      baseUrl: 'https://provider.example',
      apiKey: 'secret',
      enabledModels: JSON.stringify(['gpt-4o', 'gpt-4.1']),
      disabledModels: '[]',
      region: '',
      enabled: false,
      builtin: false,
    })

    createRole(db, {
      id: 'role-1',
      avatar: '',
      name: 'Tester',
      systemPrompt: '',
      llmProvider: 'openai',
      llmModel: 'gpt-4o',
      llmApiKey: 'secret',
      llmBaseUrl: null,
      enabledTools: '[]',
      enabledSkills: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    createBot(db, {
      id: 'bot-1',
      name: 'Provider-backed bot',
      platform: 'discord',
      token: 'token',
      roleId: 'role-1',
      llmProvider: 'openai',
      llmProviderId: provider.id,
      llmPlatformName: 'Provider One',
      llmModel: 'gpt-4o',
      llmApiKey: 'bot-secret',
      llmBaseUrl: 'https://bot.example',
      discordUserId: '',
      discordChannelId: '',
      discordGuildId: 'guild-1',
      enabled: true,
      requireMention: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const manager = new BotManager(
      db,
      {
        list: () => [],
      } as any,
      {
        listAvailableForBot: () => [],
      } as any,
      () => ({
        systemPrompt: '',
        maxToolCallRounds: 4,
        requireMention: false,
        threadMode: true,
        maxThreadsPerChannel: 3,
        sendTime: false,
        timezone: 'UTC',
        toolApprovalMode: 'none',
        toolProcessMode: 'none',
      }),
      () => ({
        enabled: true,
        writebackEnabled: true,
        maxMemoriesPerUser: 20,
        retrievalLimit: 5,
        rememberTurns: 12,
        cleanupSchedule: '0 4 * * *',
        cleanupRetentionDays: 180,
        provider: 'openai',
        model: 'gpt-test',
        apiKey: 'test-key',
        baseUrl: '',
      }),
    )

    await assert.rejects(
      manager.setModel('bot-1', 'gpt-4.1'),
      /LLM provider is disabled/,
    )
    assert.equal(getBot(db, 'bot-1')?.llmModel, 'gpt-4o')
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('BotManager#startOne preserves legacy startup validation for bots without llmProviderId', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-bot-manager-legacy-startup-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client
  const originalStart = DiscordAdapter.prototype.start

  try {
    runMigrations(db)

    createRole(db, {
      id: 'role-1',
      avatar: '',
      name: 'Tester',
      systemPrompt: '',
      llmProvider: 'openai',
      llmModel: 'gpt-4o',
      llmApiKey: 'secret',
      llmBaseUrl: null,
      enabledTools: '[]',
      enabledSkills: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    createBot(db, {
      id: 'bot-legacy',
      name: 'Legacy bot',
      platform: 'discord',
      token: 'token',
      roleId: 'role-1',
      llmProvider: 'openai',
      llmProviderId: null,
      llmPlatformName: 'OpenAI',
      llmModel: 'gpt-4o',
      llmApiKey: '',
      llmBaseUrl: 'https://api.openai.com',
      discordUserId: '',
      discordChannelId: '',
      discordGuildId: 'guild-1',
      enabled: true,
      requireMention: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    DiscordAdapter.prototype.start = async function () {
      throw new Error('DiscordAdapter.start should not be reached for invalid legacy config')
    }

    const manager = new BotManager(
      db,
      {
        list: () => [],
      } as any,
      {
        listAvailableForBot: () => [],
      } as any,
      () => ({
        systemPrompt: '',
        maxToolCallRounds: 4,
        requireMention: false,
        threadMode: true,
        maxThreadsPerChannel: 3,
        sendTime: false,
        timezone: 'UTC',
        toolApprovalMode: 'none',
        toolProcessMode: 'none',
      }),
      () => ({
        enabled: true,
        writebackEnabled: true,
        maxMemoriesPerUser: 20,
        retrievalLimit: 5,
        rememberTurns: 12,
        cleanupSchedule: '0 4 * * *',
        cleanupRetentionDays: 180,
        provider: 'openai',
        model: 'gpt-test',
        apiKey: 'test-key',
        baseUrl: '',
      }),
    )

    await assert.rejects(
      manager.startOne('bot-legacy'),
      /Bot "Legacy bot" is missing LLM configuration/,
    )
  }
  finally {
    DiscordAdapter.prototype.start = originalStart
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('BotManager#startOne uses the linked provider runtime config instead of stale bot fields', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-bot-manager-provider-runtime-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client
  const originalStart = DiscordAdapter.prototype.start
  let capturedConfig: { apiKey?: string, baseUrl?: string, model?: string } | undefined

  try {
    runMigrations(db)

    const provider = createLlmProvider(db, {
      name: 'Provider One',
      format: 'openai',
      baseUrl: 'https://provider.example',
      apiKey: 'provider-secret',
      enabledModels: JSON.stringify(['gpt-4o']),
      disabledModels: '[]',
      region: '',
      enabled: true,
      builtin: false,
    })

    createRole(db, {
      id: 'role-1',
      avatar: '',
      name: 'Tester',
      systemPrompt: '',
      llmProvider: 'openai',
      llmModel: 'gpt-4o',
      llmApiKey: 'role-secret',
      llmBaseUrl: null,
      enabledTools: '[]',
      enabledSkills: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    createBot(db, {
      id: 'bot-provider-runtime',
      name: 'Provider runtime bot',
      platform: 'discord',
      token: 'token',
      roleId: 'role-1',
      llmProvider: 'openai',
      llmProviderId: provider.id,
      llmPlatformName: 'Stale Bot Config',
      llmModel: 'gpt-4o',
      llmApiKey: 'bot-secret',
      llmBaseUrl: 'https://bot.example',
      discordUserId: '',
      discordChannelId: '',
      discordGuildId: 'guild-1',
      enabled: true,
      requireMention: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    DiscordAdapter.prototype.start = async function () {
      capturedConfig = { ...(this as any).agent.client.config }
    }

    const manager = new BotManager(
      db,
      {
        list: () => [],
      } as any,
      {
        listAvailableForBot: () => [],
      } as any,
      () => ({
        systemPrompt: '',
        maxToolCallRounds: 4,
        requireMention: false,
        threadMode: true,
        maxThreadsPerChannel: 3,
        sendTime: false,
        timezone: 'UTC',
        toolApprovalMode: 'none',
        toolProcessMode: 'none',
      }),
      () => ({
        enabled: true,
        writebackEnabled: true,
        maxMemoriesPerUser: 20,
        retrievalLimit: 5,
        rememberTurns: 12,
        cleanupSchedule: '0 4 * * *',
        cleanupRetentionDays: 180,
        provider: 'openai',
        model: 'gpt-test',
        apiKey: 'test-key',
        baseUrl: '',
      }),
    )

    await manager.startOne('bot-provider-runtime')

    assert.deepEqual(capturedConfig, {
      apiKey: 'provider-secret',
      baseUrl: 'https://provider.example',
      model: 'gpt-4o',
      provider: 'openai',
    })
  }
  finally {
    DiscordAdapter.prototype.start = originalStart
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})
