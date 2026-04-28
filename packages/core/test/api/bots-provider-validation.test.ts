import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'fs'
import test from 'node:test'
import { tmpdir } from 'os'
import { join } from 'path'
import type http from 'http'
import type Database from 'better-sqlite3'
import { createBot, createDb, createLlmProvider, createRole, getBot, runMigrations } from '@zakobot/database'
import { getBotsRoute } from '../../src/api/routes/bots.js'

function createJsonRequest(method: string, body: Record<string, unknown>): http.IncomingMessage {
  const buffer = Buffer.from(JSON.stringify(body))

  return {
    method,
    async *[Symbol.asyncIterator]() {
      yield buffer
    },
  } as http.IncomingMessage
}

test('bot create rejects unknown non-empty llmProviderId before database insert', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-bot-provider-validation-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)

    createRole(db, {
      id: 'role-1',
      avatar: '',
      name: 'Tester',
      systemPrompt: '',
      llmProvider: 'openai',
      llmModel: 'gpt-test',
      llmApiKey: 'secret',
      llmBaseUrl: null,
      enabledTools: '[]',
      enabledSkills: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const route = await getBotsRoute(createJsonRequest('POST', {
      name: 'Test bot',
      token: 'token',
      roleId: 'role-1',
      llmProviderId: 'missing-provider',
      llmModel: 'gpt-test',
      discordGuildId: 'guild-1',
      enabled: true,
    }), '/bots', {
      db,
      botManager: {
        syncInstance: async () => {},
      } as any,
    })

    assert.deepEqual(route, {
      status: 404,
      body: {
        ok: false,
        error: 'LLM provider not found',
      },
    })
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('bot create rejects empty llmProviderId before database insert', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-bot-provider-validation-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)

    createRole(db, {
      id: 'role-1',
      avatar: '',
      name: 'Tester',
      systemPrompt: '',
      llmProvider: 'openai',
      llmModel: 'gpt-test',
      llmApiKey: 'secret',
      llmBaseUrl: null,
      enabledTools: '[]',
      enabledSkills: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const route = await getBotsRoute(createJsonRequest('POST', {
      name: 'Provider-backed bot',
      token: 'token',
      roleId: 'role-1',
      llmProviderId: '',
      llmPlatformName: 'Google AI Studio',
      llmModel: 'gemini-2.5-pro',
      llmApiKey: 'secret',
      llmBaseUrl: 'https://generativelanguage.googleapis.com',
      discordGuildId: 'guild-1',
      enabled: true,
    }), '/bots', {
      db,
      botManager: {
        syncInstance: async () => {},
      } as any,
    })

    assert.deepEqual(route, {
      status: 400,
      body: {
        ok: false,
        error: 'LLM provider is required',
      },
    })
    const botCount = sqlite.prepare('select count(*) as count from bot_instances').get() as { count: number }
    assert.equal(botCount.count, 0)
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('bot update rejects empty llmProviderId before database update', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-bot-provider-validation-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)

    createRole(db, {
      id: 'role-1',
      avatar: '',
      name: 'Tester',
      systemPrompt: '',
      llmProvider: 'openai',
      llmModel: 'gpt-test',
      llmApiKey: 'secret',
      llmBaseUrl: null,
      enabledTools: '[]',
      enabledSkills: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const provider = createLlmProvider(db, {
      name: 'Provider One',
      format: 'openai',
      baseUrl: 'https://provider.example',
      apiKey: 'secret',
      enabledModels: JSON.stringify(['gemini-2.5-pro']),
      disabledModels: '[]',
      region: '',
      enabled: true,
      builtin: false,
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
      llmModel: 'gemini-2.5-pro',
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

    const route = await getBotsRoute(createJsonRequest('PUT', {
      name: 'Provider-backed bot',
      token: 'token',
      roleId: 'role-1',
      llmProviderId: '',
      llmPlatformName: 'Provider One',
      llmModel: 'gemini-2.5-flash',
      llmApiKey: 'secret',
      llmBaseUrl: 'https://provider.example',
      discordGuildId: 'guild-1',
      enabled: true,
    }), '/bots/bot-1', {
      db,
      botManager: {
        syncInstance: async () => {},
      } as any,
    })

    assert.deepEqual(route, {
      status: 400,
      body: {
        ok: false,
        error: 'LLM provider is required',
      },
    })
    assert.equal(getBot(db, 'bot-1')?.llmProviderId, provider.id)
    assert.equal(getBot(db, 'bot-1')?.llmModel, 'gemini-2.5-pro')
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('bot update allows existing legacy fallback bots to keep saving without llmProviderId', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-bot-provider-validation-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)

    createRole(db, {
      id: 'role-1',
      avatar: '',
      name: 'Tester',
      systemPrompt: '',
      llmProvider: 'openai',
      llmModel: 'gpt-test',
      llmApiKey: 'secret',
      llmBaseUrl: null,
      enabledTools: '[]',
      enabledSkills: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    createBot(db, {
      id: 'bot-legacy',
      name: 'Legacy Google Bot',
      platform: 'discord',
      token: 'token',
      roleId: 'role-1',
      llmProvider: 'openai',
      llmProviderId: null,
      llmPlatformName: 'Google AI Studio',
      llmModel: 'gemini-2.5-pro',
      llmApiKey: 'secret',
      llmBaseUrl: 'https://generativelanguage.googleapis.com',
      discordUserId: '',
      discordChannelId: '',
      discordGuildId: 'guild-1',
      enabled: true,
      requireMention: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const route = await getBotsRoute(createJsonRequest('PUT', {
      name: 'Legacy Google Bot Updated',
      token: 'token',
      roleId: 'role-1',
      llmProviderId: '',
      llmPlatformName: 'Google AI Studio',
      llmModel: 'gemini-2.5-pro',
      llmApiKey: 'secret',
      llmBaseUrl: 'https://generativelanguage.googleapis.com',
      discordGuildId: 'guild-1',
      enabled: false,
    }), '/bots/bot-legacy', {
      db,
      botManager: {
        syncInstance: async () => {},
      } as any,
    })

    assert.equal(route?.status, undefined)
    assert.equal(route?.body.ok, true)
    assert.equal(route?.body.data.name, 'Legacy Google Bot Updated')
    assert.equal(route?.body.data.llmProviderId, '')
    assert.equal(route?.body.data.llmPlatformName, 'Google AI Studio')
    assert.equal(route?.body.data.llmModel, 'gemini-2.5-pro')
    assert.equal(route?.body.data.enabled, false)

    const savedBot = getBot(db, 'bot-legacy')
    assert.equal(savedBot?.name, 'Legacy Google Bot Updated')
    assert.equal(savedBot?.llmProviderId, null)
    assert.equal(savedBot?.llmPlatformName, 'Google AI Studio')
    assert.equal(savedBot?.llmModel, 'gemini-2.5-pro')
    assert.equal(savedBot?.enabled, false)
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('bot create persists bridge fields from the selected provider instead of the request payload', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-bot-provider-validation-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)

    createRole(db, {
      id: 'role-1',
      avatar: '',
      name: 'Tester',
      systemPrompt: '',
      llmProvider: 'openai',
      llmModel: 'gpt-test',
      llmApiKey: 'secret',
      llmBaseUrl: null,
      enabledTools: '[]',
      enabledSkills: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const provider = createLlmProvider(db, {
      name: 'Provider One',
      format: 'openai',
      baseUrl: 'https://provider.example',
      apiKey: 'provider-secret',
      enabledModels: JSON.stringify(['gemini-2.5-pro']),
      disabledModels: '[]',
      region: '',
      enabled: true,
      builtin: false,
    })

    const route = await getBotsRoute(createJsonRequest('POST', {
      name: 'Provider-backed bot',
      token: 'token',
      roleId: 'role-1',
      llmProviderId: provider.id,
      llmPlatformName: 'Wrong Provider Name',
      llmModel: 'gemini-2.5-pro',
      llmApiKey: 'wrong-secret',
      llmBaseUrl: 'https://wrong.example',
      discordGuildId: 'guild-1',
      enabled: true,
    }), '/bots', {
      db,
      botManager: {
        syncInstance: async () => {},
      } as any,
    })

    assert.equal(route.status, 201)
    assert.equal(route.body.ok, true)
    assert.equal(route.body.data.llmPlatformName, 'Provider One')
    assert.equal(route.body.data.llmApiKey, 'provider-secret')
    assert.equal(route.body.data.llmBaseUrl, 'https://provider.example')

    const botId = route.body.data.id as string
    const savedBot = getBot(db, botId)
    assert.equal(savedBot?.llmPlatformName, 'Provider One')
    assert.equal(savedBot?.llmApiKey, 'provider-secret')
    assert.equal(savedBot?.llmBaseUrl, 'https://provider.example')
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('bot create surfaces a server error when syncInstance fails after persistence', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-bot-provider-validation-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)

    createRole(db, {
      id: 'role-1',
      avatar: '',
      name: 'Tester',
      systemPrompt: '',
      llmProvider: 'openai',
      llmModel: 'gpt-test',
      llmApiKey: 'secret',
      llmBaseUrl: null,
      enabledTools: '[]',
      enabledSkills: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const provider = createLlmProvider(db, {
      name: 'Provider One',
      format: 'openai',
      baseUrl: 'https://provider.example',
      apiKey: 'provider-secret',
      enabledModels: JSON.stringify(['gemini-2.5-pro']),
      disabledModels: '[]',
      region: '',
      enabled: true,
      builtin: false,
    })

    const route = await getBotsRoute(createJsonRequest('POST', {
      name: 'Provider-backed bot',
      token: 'token',
      roleId: 'role-1',
      llmProviderId: provider.id,
      llmModel: 'gemini-2.5-pro',
      discordGuildId: 'guild-1',
      enabled: true,
    }), '/bots', {
      db,
      botManager: {
        syncInstance: async () => {
          throw new Error('sync failed')
        },
      } as any,
    })

    assert.deepEqual(route, {
      status: 500,
      body: {
        ok: false,
        error: 'Bot was saved but failed to sync runtime: sync failed',
      },
    })
    const botCount = sqlite.prepare('select count(*) as count from bot_instances').get() as { count: number }
    assert.equal(botCount.count, 1)
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('bot update surfaces a server error when syncInstance fails after persistence', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-bot-provider-validation-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)

    createRole(db, {
      id: 'role-1',
      avatar: '',
      name: 'Tester',
      systemPrompt: '',
      llmProvider: 'openai',
      llmModel: 'gpt-test',
      llmApiKey: 'secret',
      llmBaseUrl: null,
      enabledTools: '[]',
      enabledSkills: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const provider = createLlmProvider(db, {
      name: 'Provider One',
      format: 'openai',
      baseUrl: 'https://provider.example',
      apiKey: 'provider-secret',
      enabledModels: JSON.stringify(['gemini-2.5-pro', 'gemini-2.5-flash']),
      disabledModels: '[]',
      region: '',
      enabled: true,
      builtin: false,
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
      llmModel: 'gemini-2.5-pro',
      llmApiKey: 'provider-secret',
      llmBaseUrl: 'https://provider.example',
      discordUserId: '',
      discordChannelId: '',
      discordGuildId: 'guild-1',
      enabled: true,
      requireMention: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const route = await getBotsRoute(createJsonRequest('PUT', {
      name: 'Provider-backed bot updated',
      token: 'token',
      roleId: 'role-1',
      llmProviderId: provider.id,
      llmModel: 'gemini-2.5-flash',
      discordGuildId: 'guild-1',
      enabled: true,
    }), '/bots/bot-1', {
      db,
      botManager: {
        syncInstance: async () => {
          throw new Error('sync failed')
        },
      } as any,
    })

    assert.deepEqual(route, {
      status: 500,
      body: {
        ok: false,
        error: 'Bot was updated but failed to sync runtime: sync failed',
      },
    })
    assert.equal(getBot(db, 'bot-1')?.llmModel, 'gemini-2.5-flash')
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('bot create rejects selected provider formats that are not bridge-compatible yet', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-bot-provider-validation-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)

    createRole(db, {
      id: 'role-1',
      avatar: '',
      name: 'Tester',
      systemPrompt: '',
      llmProvider: 'openai',
      llmModel: 'gpt-test',
      llmApiKey: 'secret',
      llmBaseUrl: null,
      enabledTools: '[]',
      enabledSkills: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const provider = createLlmProvider(db, {
      name: 'Google AI Studio',
      format: 'google',
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'secret',
      enabledModels: JSON.stringify(['gemini-2.5-pro']),
      disabledModels: '[]',
      region: '',
      enabled: true,
      builtin: false,
    })

    const route = await getBotsRoute(createJsonRequest('POST', {
      name: 'Provider-backed bot',
      token: 'token',
      roleId: 'role-1',
      llmProviderId: provider.id,
      llmModel: 'gemini-2.5-pro',
      discordGuildId: 'guild-1',
      enabled: true,
    }), '/bots', {
      db,
      botManager: {
        syncInstance: async () => {},
      } as any,
    })

    assert.deepEqual(route, {
      status: 400,
      body: {
        ok: false,
        error: 'Selected LLM provider format is not supported for bot runtime yet',
      },
    })
    const botCount = sqlite.prepare('select count(*) as count from bot_instances').get() as { count: number }
    assert.equal(botCount.count, 0)
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('bot create rejects vertex providers even when service-account credentials are present', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-bot-provider-validation-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)

    createRole(db, {
      id: 'role-1',
      avatar: '',
      name: 'Tester',
      systemPrompt: '',
      llmProvider: 'openai',
      llmModel: 'gpt-test',
      llmApiKey: 'secret',
      llmBaseUrl: null,
      enabledTools: '[]',
      enabledSkills: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const provider = createLlmProvider(db, {
      name: 'Vertex Valid',
      format: 'vertex',
      baseUrl: 'https://us-central1-aiplatform.googleapis.com/v1beta1/projects/test-project/locations/us-central1/endpoints/openapi',
      apiKey: JSON.stringify({
        type: 'service_account',
        project_id: 'test-project',
        private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
        client_email: 'bot@test-project.iam.gserviceaccount.com',
      }),
      enabledModels: JSON.stringify(['gemini-2.5-pro']),
      disabledModels: '[]',
      region: 'us-central1',
      enabled: true,
      builtin: false,
    })

    const route = await getBotsRoute(createJsonRequest('POST', {
      name: 'Provider-backed bot',
      token: 'token',
      roleId: 'role-1',
      llmProviderId: provider.id,
      llmModel: 'gemini-2.5-pro',
      discordGuildId: 'guild-1',
      enabled: true,
    }), '/bots', {
      db,
      botManager: {
        syncInstance: async () => {},
      } as any,
    })

    assert.deepEqual(route, {
      status: 400,
      body: {
        ok: false,
        error: 'Selected LLM provider format is not supported for bot runtime yet',
      },
    })
    const botCount = sqlite.prepare('select count(*) as count from bot_instances').get() as { count: number }
    assert.equal(botCount.count, 0)
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('bot create rejects disabled selected providers even when bridge fields are present', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-bot-provider-validation-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)

    createRole(db, {
      id: 'role-1',
      avatar: '',
      name: 'Tester',
      systemPrompt: '',
      llmProvider: 'openai',
      llmModel: 'gpt-test',
      llmApiKey: 'secret',
      llmBaseUrl: null,
      enabledTools: '[]',
      enabledSkills: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const provider = createLlmProvider(db, {
      name: 'Disabled Provider',
      format: 'openai',
      baseUrl: 'https://provider.example',
      apiKey: 'secret',
      enabledModels: JSON.stringify(['gpt-4o']),
      disabledModels: '[]',
      region: '',
      enabled: false,
      builtin: false,
    })

    const route = await getBotsRoute(createJsonRequest('POST', {
      name: 'Provider-backed bot',
      token: 'token',
      roleId: 'role-1',
      llmProviderId: provider.id,
      llmModel: 'gpt-4o',
      discordGuildId: 'guild-1',
      enabled: true,
    }), '/bots', {
      db,
      botManager: {
        syncInstance: async () => {},
      } as any,
    })

    assert.deepEqual(route, {
      status: 400,
      body: {
        ok: false,
        error: 'Selected LLM provider is disabled',
      },
    })
    const botCount = sqlite.prepare('select count(*) as count from bot_instances').get() as { count: number }
    assert.equal(botCount.count, 0)
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('bot update rejects incomplete selected provider even when the request payload includes bridge fields', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-bot-provider-validation-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)

    createRole(db, {
      id: 'role-1',
      avatar: '',
      name: 'Tester',
      systemPrompt: '',
      llmProvider: 'openai',
      llmModel: 'gpt-test',
      llmApiKey: 'secret',
      llmBaseUrl: null,
      enabledTools: '[]',
      enabledSkills: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const completeProvider = createLlmProvider(db, {
      name: 'Provider One',
      format: 'openai',
      baseUrl: 'https://provider.example',
      apiKey: 'secret',
      enabledModels: JSON.stringify(['gemini-2.5-pro']),
      disabledModels: '[]',
      region: '',
      enabled: true,
      builtin: false,
    })

    const incompleteProvider = createLlmProvider(db, {
      name: 'Incomplete Provider',
      format: 'openai',
      baseUrl: '',
      apiKey: '',
      enabledModels: JSON.stringify(['gemini-2.5-pro']),
      disabledModels: '[]',
      region: '',
      enabled: false,
      builtin: false,
    })

    createBot(db, {
      id: 'bot-1',
      name: 'Provider-backed bot',
      platform: 'discord',
      token: 'token',
      roleId: 'role-1',
      llmProvider: 'openai',
      llmProviderId: completeProvider.id,
      llmPlatformName: 'Provider One',
      llmModel: 'gemini-2.5-pro',
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

    const route = await getBotsRoute(createJsonRequest('PUT', {
      name: 'Provider-backed bot',
      token: 'token',
      roleId: 'role-1',
      llmProviderId: incompleteProvider.id,
      llmPlatformName: 'Injected Provider Name',
      llmModel: 'gemini-2.5-flash',
      llmApiKey: 'injected-secret',
      llmBaseUrl: 'https://injected.example',
      discordGuildId: 'guild-1',
      enabled: true,
    }), '/bots/bot-1', {
      db,
      botManager: {
        syncInstance: async () => {},
      } as any,
    })

    assert.deepEqual(route, {
      status: 400,
      body: {
        ok: false,
        error: 'Selected LLM provider is missing base URL or API key',
      },
    })
    assert.equal(getBot(db, 'bot-1')?.llmProviderId, completeProvider.id)
    assert.equal(getBot(db, 'bot-1')?.llmPlatformName, 'Provider One')
    assert.equal(getBot(db, 'bot-1')?.llmApiKey, 'secret')
    assert.equal(getBot(db, 'bot-1')?.llmBaseUrl, 'https://provider.example')
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('bot create rejects openai-labeled providers when apiKey is Vertex service-account JSON', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-bot-provider-validation-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)

    createRole(db, {
      id: 'role-1',
      avatar: '',
      name: 'Tester',
      systemPrompt: '',
      llmProvider: 'openai',
      llmModel: 'gpt-test',
      llmApiKey: 'secret',
      llmBaseUrl: null,
      enabledTools: '[]',
      enabledSkills: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const provider = createLlmProvider(db, {
      name: 'OpenAI Label With Vertex Creds',
      format: 'openai',
      baseUrl: 'https://provider.example',
      apiKey: JSON.stringify({
        type: 'service_account',
        project_id: 'test-project',
        private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
        client_email: 'bot@test-project.iam.gserviceaccount.com',
      }),
      enabledModels: JSON.stringify(['gpt-4.1']),
      disabledModels: '[]',
      region: '',
      enabled: true,
      builtin: false,
    })

    const route = await getBotsRoute(createJsonRequest('POST', {
      name: 'Provider-backed bot',
      token: 'token',
      roleId: 'role-1',
      llmProviderId: provider.id,
      llmModel: 'gpt-4.1',
      discordGuildId: 'guild-1',
      enabled: true,
    }), '/bots', {
      db,
      botManager: {
        syncInstance: async () => {},
      } as any,
    })

    assert.deepEqual(route, {
      status: 400,
      body: {
        ok: false,
        error: 'Selected LLM provider is missing base URL or API key',
      },
    })
    const botCount = sqlite.prepare('select count(*) as count from bot_instances').get() as { count: number }
    assert.equal(botCount.count, 0)
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('bot create rejects models that are not enabled by the selected provider', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-bot-provider-validation-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)

    createRole(db, {
      id: 'role-1',
      avatar: '',
      name: 'Tester',
      systemPrompt: '',
      llmProvider: 'openai',
      llmModel: 'gpt-test',
      llmApiKey: 'secret',
      llmBaseUrl: null,
      enabledTools: '[]',
      enabledSkills: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

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

    const route = await getBotsRoute(createJsonRequest('POST', {
      name: 'Provider-backed bot',
      token: 'token',
      roleId: 'role-1',
      llmProviderId: provider.id,
      llmModel: 'gpt-4.1',
      discordGuildId: 'guild-1',
      enabled: true,
    }), '/bots', {
      db,
      botManager: {
        syncInstance: async () => {},
      } as any,
    })

    assert.deepEqual(route, {
      status: 400,
      body: {
        ok: false,
        error: 'Selected LLM model is not enabled for the provider',
      },
    })
    const botCount = sqlite.prepare('select count(*) as count from bot_instances').get() as { count: number }
    assert.equal(botCount.count, 0)
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('bot update rejects models that are not enabled by the selected provider', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-bot-provider-validation-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)

    createRole(db, {
      id: 'role-1',
      avatar: '',
      name: 'Tester',
      systemPrompt: '',
      llmProvider: 'openai',
      llmModel: 'gpt-test',
      llmApiKey: 'secret',
      llmBaseUrl: null,
      enabledTools: '[]',
      enabledSkills: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

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

    const route = await getBotsRoute(createJsonRequest('PUT', {
      name: 'Provider-backed bot',
      token: 'token',
      roleId: 'role-1',
      llmProviderId: provider.id,
      llmModel: 'gpt-4.1',
      discordGuildId: 'guild-1',
      enabled: true,
    }), '/bots/bot-1', {
      db,
      botManager: {
        syncInstance: async () => {},
      } as any,
    })

    assert.deepEqual(route, {
      status: 400,
      body: {
        ok: false,
        error: 'Selected LLM model is not enabled for the provider',
      },
    })
    assert.equal(getBot(db, 'bot-1')?.llmModel, 'gpt-4o')
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})
