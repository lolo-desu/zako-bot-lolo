import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'fs'
import http from 'http'
import test from 'node:test'
import { tmpdir } from 'os'
import { join } from 'path'
import type Database from 'better-sqlite3'
import { createBot, createDb, createLlmProvider, createRole, deleteLlmProvider, getBot, getLlmProvider, runMigrations, updateLlmProvider } from '@zakobot/database'
import { ApiServer } from '../../src/api/server.js'

test('llm provider routes support CRUD over HTTP', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-llm-provider-route-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client
  const server = new ApiServer(
    db,
    createBotManagerStub(),
    {} as any,
    {
      getStatus: () => [],
    } as any,
    {} as any,
  )

  try {
    runMigrations(db)

    process.env.CORE_API_PORT = '0'
    await server.start()

    const port = getListeningPort(server)
    const listBefore = await requestJson(port, '/llm-providers')
    assert.equal(listBefore.status, 200)
    assert.deepEqual(listBefore.body, { ok: true, data: [] })

    const createResponse = await requestJson(port, '/llm-providers', {
      method: 'POST',
      body: {
        name: 'Primary Provider',
        format: 'openai',
        baseUrl: 'https://provider.example',
        apiKey: 'secret',
        enabled: true,
        builtin: false,
        enabledModels: ['gpt-4o'],
        disabledModels: ['old-model'],
        region: 'us-west-1',
      },
    })

    assert.equal(createResponse.status, 201)
    assert.equal(createResponse.body.ok, true)
    assert.equal(createResponse.body.data.name, 'Primary Provider')
    assert.deepEqual(createResponse.body.data.enabledModels, ['gpt-4o'])
    assert.deepEqual(createResponse.body.data.disabledModels, ['old-model'])
    assert.match(createResponse.body.data.createdAt, /^\d{4}-\d{2}-\d{2}T/)
    assert.match(createResponse.body.data.updatedAt, /^\d{4}-\d{2}-\d{2}T/)

    const providerId = createResponse.body.data.id as string
    const getResponse = await requestJson(port, `/llm-providers/${providerId}`)
    assert.equal(getResponse.status, 200)
    assert.equal(getResponse.body.data.id, providerId)

    const updateResponse = await requestJson(port, `/llm-providers/${providerId}`, {
      method: 'PUT',
      body: {
        name: 'Updated Provider',
        format: 'google',
        baseUrl: 'https://google.example',
        apiKey: 'updated-secret',
        enabled: false,
        builtin: false,
        enabledModels: ['gemini-2.5-pro', 'gemini-2.5-flash'],
        disabledModels: ['gemini-1.5-pro'],
        region: 'asia-east1',
      },
    })

    assert.equal(updateResponse.status, 200)
    assert.equal(updateResponse.body.data.name, 'Updated Provider')
    assert.equal(updateResponse.body.data.format, 'google')
    assert.equal(updateResponse.body.data.enabled, false)
    assert.deepEqual(updateResponse.body.data.enabledModels, ['gemini-2.5-pro', 'gemini-2.5-flash'])
    assert.deepEqual(updateResponse.body.data.disabledModels, ['gemini-1.5-pro'])
    assert.equal(updateResponse.body.data.region, 'asia-east1')

    const listAfter = await requestJson(port, '/llm-providers')
    assert.equal(listAfter.status, 200)
    assert.equal(listAfter.body.data.length, 1)
    assert.equal(listAfter.body.data[0].id, providerId)

    const deleteResponse = await requestJson(port, `/llm-providers/${providerId}`, { method: 'DELETE' })
    assert.equal(deleteResponse.status, 200)
    assert.equal(deleteResponse.body.data.id, providerId)

    const getAfterDelete = await requestJson(port, `/llm-providers/${providerId}`)
    assert.equal(getAfterDelete.status, 404)
    assert.deepEqual(getAfterDelete.body, { ok: false, error: 'LLM provider not found' })
  }
  finally {
    delete process.env.CORE_API_PORT
    await server.stop()
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('llm provider routes allow creating an empty provider shell for later configuration', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-llm-provider-empty-create-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client
  const server = new ApiServer(
    db,
    createBotManagerStub(),
    {} as any,
    {
      getStatus: () => [],
    } as any,
    {} as any,
  )

  try {
    runMigrations(db)

    process.env.CORE_API_PORT = '0'
    await server.start()

    const port = getListeningPort(server)
    const createResponse = await requestJson(port, '/llm-providers', {
      method: 'POST',
      body: {
        name: 'Configured Later',
        format: 'openai',
        baseUrl: '',
        apiKey: '',
        enabled: false,
        enabledModels: [],
        disabledModels: [],
        region: '',
        builtin: false,
      },
    })

    assert.equal(createResponse.status, 201)
    assert.equal(createResponse.body.data.name, 'Configured Later')
    assert.equal(createResponse.body.data.baseUrl, '')
    assert.equal(createResponse.body.data.apiKey, '')
    assert.equal(createResponse.body.data.enabled, false)
  }
  finally {
    delete process.env.CORE_API_PORT
    await server.stop()
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('llm provider routes do not allow clients to create builtin providers', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-llm-provider-create-builtin-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client
  const server = new ApiServer(
    db,
    createBotManagerStub(),
    {} as any,
    {
      getStatus: () => [],
    } as any,
    {} as any,
  )

  try {
    runMigrations(db)

    process.env.CORE_API_PORT = '0'
    await server.start()

    const port = getListeningPort(server)
    const createResponse = await requestJson(port, '/llm-providers', {
      method: 'POST',
      body: {
        name: 'Client Pretend Builtin',
        format: 'openai',
        baseUrl: 'https://provider.example',
        apiKey: 'secret',
        enabled: true,
        builtin: true,
        enabledModels: ['gpt-4o'],
        disabledModels: [],
        region: '',
      },
    })

    assert.equal(createResponse.status, 201)
    assert.equal(createResponse.body.data.builtin, false)
    assert.equal(getLlmProvider(db, createResponse.body.data.id as string)?.builtin, false)
  }
  finally {
    delete process.env.CORE_API_PORT
    await server.stop()
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('llm provider fetch-models persists unseen models and builtin providers cannot be deleted', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-llm-provider-fetch-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client
  const server = new ApiServer(
    db,
    createBotManagerStub(),
    {} as any,
    {
      getStatus: () => [],
    } as any,
    {} as any,
  )
  const modelServer = http.createServer((req, res) => {
    if (req.url !== '/v1/models') {
      res.writeHead(404)
      res.end()
      return
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      data: [
        { id: 'archived-model' },
        { id: 'gpt-4o' },
        { id: 'gpt-4.1' },
      ],
    }))
  })

  try {
    runMigrations(db)

    const providerPort = await listen(modelServer)
    const provider = createLlmProvider(db, {
      name: 'Fetchable Provider',
      format: 'openai',
      baseUrl: `http://127.0.0.1:${providerPort}`,
      apiKey: 'secret',
      enabledModels: JSON.stringify(['gpt-4o']),
      disabledModels: JSON.stringify(['archived-model']),
      region: '',
      enabled: true,
      builtin: false,
    })
    const builtin = createLlmProvider(db, {
      name: 'Built In',
      format: 'openai',
      baseUrl: 'https://builtin.example',
      apiKey: 'secret',
      enabledModels: '[]',
      disabledModels: '[]',
      region: '',
      enabled: true,
      builtin: true,
    })

    process.env.CORE_API_PORT = '0'
    await server.start()

    const port = getListeningPort(server)
    const fetchResponse = await requestJson(port, `/llm-providers/${provider.id}/fetch-models`, {
      method: 'POST',
      body: {},
    })

    assert.equal(fetchResponse.status, 200)
    assert.deepEqual(fetchResponse.body.data.models, ['archived-model', 'gpt-4.1', 'gpt-4o'])
    assert.deepEqual(fetchResponse.body.data.provider.enabledModels, ['gpt-4.1', 'gpt-4o'])
    assert.deepEqual(fetchResponse.body.data.provider.disabledModels, ['archived-model'])

    const updatedProvider = getLlmProvider(db, provider.id)
    assert.deepEqual(JSON.parse(updatedProvider!.enabledModels), ['gpt-4.1', 'gpt-4o'])
    assert.deepEqual(JSON.parse(updatedProvider!.disabledModels), ['archived-model'])

    const deleteBuiltin = await requestJson(port, `/llm-providers/${builtin.id}`, { method: 'DELETE' })
    assert.equal(deleteBuiltin.status, 409)
    assert.deepEqual(deleteBuiltin.body, {
      ok: false,
      error: 'Built-in LLM providers cannot be deleted',
    })
  }
  finally {
    delete process.env.CORE_API_PORT
    await server.stop()
    await closeServer(modelServer)
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('llm provider routes preserve the builtin flag on update', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-llm-provider-builtin-update-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client
  const server = new ApiServer(
    db,
    createBotManagerStub(),
    {} as any,
    {
      getStatus: () => [],
    } as any,
    {} as any,
  )

  try {
    runMigrations(db)

    const builtin = createLlmProvider(db, {
      name: 'Built In',
      format: 'openai',
      baseUrl: 'https://builtin.example',
      apiKey: 'secret',
      enabledModels: JSON.stringify(['gpt-4o']),
      disabledModels: '[]',
      region: '',
      enabled: true,
      builtin: true,
    })

    process.env.CORE_API_PORT = '0'
    await server.start()

    const port = getListeningPort(server)
    const updateResponse = await requestJson(port, `/llm-providers/${builtin.id}`, {
      method: 'PUT',
      body: {
        name: 'Built In Updated',
        format: 'openai',
        baseUrl: 'https://builtin.example/v2',
        apiKey: 'secret-2',
        enabled: true,
        enabledModels: ['gpt-4o', 'gpt-4.1'],
        disabledModels: [],
        region: '',
      },
    })

    assert.equal(updateResponse.status, 200)
    assert.equal(updateResponse.body.data.builtin, true)
    assert.equal(getLlmProvider(db, builtin.id)?.builtin, true)

    const deleteResponse = await requestJson(port, `/llm-providers/${builtin.id}`, { method: 'DELETE' })
    assert.equal(deleteResponse.status, 409)
    assert.deepEqual(deleteResponse.body, {
      ok: false,
      error: 'Built-in LLM providers cannot be deleted',
    })
  }
  finally {
    delete process.env.CORE_API_PORT
    await server.stop()
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('llm provider routes reject deleting a provider that is still referenced by a bot', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-llm-provider-delete-in-use-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client
  const server = new ApiServer(
    db,
    createBotManagerStub(),
    {} as any,
    {
      getStatus: () => [],
    } as any,
    {} as any,
  )

  try {
    runMigrations(db)

    const provider = createLlmProvider(db, {
      name: 'In Use Provider',
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
      llmPlatformName: 'In Use Provider',
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

    process.env.CORE_API_PORT = '0'
    await server.start()

    const port = getListeningPort(server)
    const deleteResponse = await requestJson(port, `/llm-providers/${provider.id}`, { method: 'DELETE' })

    assert.equal(deleteResponse.status, 409)
    assert.deepEqual(deleteResponse.body, {
      ok: false,
      error: 'LLM provider is still used by one or more bots',
    })
    assert.ok(getLlmProvider(db, provider.id))
  }
  finally {
    delete process.env.CORE_API_PORT
    await server.stop()
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('llm provider fetch-models preserves prefixed base URLs for openai-compatible providers', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-llm-provider-fetch-prefix-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client
  const server = new ApiServer(
    db,
    createBotManagerStub(),
    {} as any,
    {
      getStatus: () => [],
    } as any,
    {} as any,
  )
  const modelServer = http.createServer((req, res) => {
    if (req.url !== '/openrouter/api/v1/models') {
      res.writeHead(404)
      res.end()
      return
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      data: [
        { id: 'openrouter/auto' },
      ],
    }))
  })

  try {
    runMigrations(db)

    const providerPort = await listen(modelServer)
    const provider = createLlmProvider(db, {
      name: 'Prefixed Provider',
      format: 'openai',
      baseUrl: `http://127.0.0.1:${providerPort}/openrouter/api/v1`,
      apiKey: 'secret',
      enabledModels: '[]',
      disabledModels: '[]',
      region: '',
      enabled: true,
      builtin: false,
    })

    process.env.CORE_API_PORT = '0'
    await server.start()

    const port = getListeningPort(server)
    const fetchResponse = await requestJson(port, `/llm-providers/${provider.id}/fetch-models`, {
      method: 'POST',
      body: {},
    })

    assert.equal(fetchResponse.status, 200)
    assert.deepEqual(fetchResponse.body.data.models, ['openrouter/auto'])
  }
  finally {
    delete process.env.CORE_API_PORT
    await server.stop()
    await closeServer(modelServer)
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('llm provider routes reject disabling an in-use bridge provider', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-llm-provider-update-in-use-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client
  const server = new ApiServer(
    db,
    createBotManagerStub(),
    {} as any,
    {
      getStatus: () => [],
    } as any,
    {} as any,
  )

  try {
    runMigrations(db)

    const provider = createLlmProvider(db, {
      name: 'In Use Provider',
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
      llmPlatformName: 'In Use Provider',
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

    process.env.CORE_API_PORT = '0'
    await server.start()

    const port = getListeningPort(server)
    const updateResponse = await requestJson(port, `/llm-providers/${provider.id}`, {
      method: 'PUT',
      body: {
        name: 'In Use Provider',
        format: 'openai',
        baseUrl: 'https://provider.example',
        apiKey: 'secret',
        enabled: false,
        builtin: false,
        enabledModels: ['gpt-4o'],
        disabledModels: [],
        region: '',
      },
    })

    assert.equal(updateResponse.status, 409)
    assert.deepEqual(updateResponse.body, {
      ok: false,
      error: 'LLM provider is still used by one or more bots and cannot be disabled',
    })
    assert.equal(getLlmProvider(db, provider.id)?.enabled, true)
  }
  finally {
    delete process.env.CORE_API_PORT
    await server.stop()
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('llm provider routes reject in-use updates that remove a bot model from enabled models', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-llm-provider-update-model-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client
  const server = new ApiServer(
    db,
    createBotManagerStub(),
    {} as any,
    {
      getStatus: () => [],
    } as any,
    {} as any,
  )

  try {
    runMigrations(db)

    const provider = createLlmProvider(db, {
      name: 'In Use Provider',
      format: 'openai',
      baseUrl: 'https://provider.example',
      apiKey: 'secret',
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
      llmPlatformName: 'In Use Provider',
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

    process.env.CORE_API_PORT = '0'
    await server.start()

    const port = getListeningPort(server)
    const updateResponse = await requestJson(port, `/llm-providers/${provider.id}`, {
      method: 'PUT',
      body: {
        name: 'In Use Provider',
        format: 'openai',
        baseUrl: 'https://provider.example',
        apiKey: 'secret',
        enabled: true,
        builtin: false,
        enabledModels: ['gpt-4.1'],
        disabledModels: ['gpt-4o'],
        region: '',
      },
    })

    assert.equal(updateResponse.status, 409)
    assert.deepEqual(updateResponse.body, {
      ok: false,
      error: 'LLM provider is still used by one or more bots and cannot remove models they use',
    })
    assert.deepEqual(JSON.parse(getLlmProvider(db, provider.id)!.enabledModels), ['gpt-4o', 'gpt-4.1'])
  }
  finally {
    delete process.env.CORE_API_PORT
    await server.stop()
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('llm provider routes reject openai-labeled vertex service-account credentials when provider is in use', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-llm-provider-update-vertex-creds-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client
  const server = new ApiServer(
    db,
    createBotManagerStub(),
    {} as any,
    {
      getStatus: () => [],
    } as any,
    {} as any,
  )

  try {
    runMigrations(db)

    const provider = createLlmProvider(db, {
      name: 'In Use Provider',
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
      llmPlatformName: 'In Use Provider',
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

    process.env.CORE_API_PORT = '0'
    await server.start()

    const port = getListeningPort(server)
    const updateResponse = await requestJson(port, `/llm-providers/${provider.id}`, {
      method: 'PUT',
      body: {
        name: 'In Use Provider',
        format: 'openai',
        baseUrl: 'https://provider.example',
        apiKey: JSON.stringify({
          type: 'service_account',
          project_id: 'test-project',
          private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
          client_email: 'bot@test-project.iam.gserviceaccount.com',
        }),
        enabled: true,
        builtin: false,
        enabledModels: ['gpt-4o'],
        disabledModels: [],
        region: '',
      },
    })

    assert.equal(updateResponse.status, 409)
    assert.deepEqual(updateResponse.body, {
      ok: false,
      error: 'LLM provider is still used by one or more bots and cannot lose required bridge credentials',
    })
    assert.equal(getLlmProvider(db, provider.id)?.apiKey, 'secret')
  }
  finally {
    delete process.env.CORE_API_PORT
    await server.stop()
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('llm provider routes refresh bridge fields for bots that already use the provider', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-llm-provider-update-bridge-sync-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client
  const syncCalls: string[] = []
  const server = new ApiServer(
    db,
    createBotManagerStub(syncCalls),
    {} as any,
    {
      getStatus: () => [],
    } as any,
    {} as any,
  )

  try {
    runMigrations(db)

    const provider = createLlmProvider(db, {
      name: 'Provider Before Update',
      format: 'openai',
      baseUrl: 'https://provider-before.example',
      apiKey: 'secret-before',
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
      llmPlatformName: 'Provider Before Update',
      llmModel: 'gpt-4o',
      llmApiKey: 'secret-before',
      llmBaseUrl: 'https://provider-before.example',
      discordUserId: '',
      discordChannelId: '',
      discordGuildId: 'guild-1',
      enabled: true,
      requireMention: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    process.env.CORE_API_PORT = '0'
    await server.start()

    const port = getListeningPort(server)
    const updateResponse = await requestJson(port, `/llm-providers/${provider.id}`, {
      method: 'PUT',
      body: {
        name: 'Provider After Update',
        format: 'openai',
        baseUrl: 'https://provider-after.example',
        apiKey: 'secret-after',
        enabled: true,
        builtin: false,
        enabledModels: ['gpt-4o'],
        disabledModels: [],
        region: '',
      },
    })

    assert.equal(updateResponse.status, 200)
    const updatedBot = getBot(db, 'bot-1')
    assert.equal(updatedBot?.llmPlatformName, 'Provider After Update')
    assert.equal(updatedBot?.llmApiKey, 'secret-after')
    assert.equal(updatedBot?.llmBaseUrl, 'https://provider-after.example')
    assert.deepEqual(syncCalls, ['bot-1'])
  }
  finally {
    delete process.env.CORE_API_PORT
    await server.stop()
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('llm provider routes surface a server error when hot-syncing a referenced bot fails', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-llm-provider-update-sync-failure-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client
  const server = new ApiServer(
    db,
    {
      syncInstance: async () => {
        throw new Error('sync failed')
      },
    } as any,
    {} as any,
    {
      getStatus: () => [],
    } as any,
    {} as any,
  )

  try {
    runMigrations(db)

    const provider = createLlmProvider(db, {
      name: 'Provider Before Update',
      format: 'openai',
      baseUrl: 'https://provider-before.example',
      apiKey: 'secret-before',
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
      llmPlatformName: 'Provider Before Update',
      llmModel: 'gpt-4o',
      llmApiKey: 'secret-before',
      llmBaseUrl: 'https://provider-before.example',
      discordUserId: '',
      discordChannelId: '',
      discordGuildId: 'guild-1',
      enabled: true,
      requireMention: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    process.env.CORE_API_PORT = '0'
    await server.start()

    const port = getListeningPort(server)
    const updateResponse = await requestJson(port, `/llm-providers/${provider.id}`, {
      method: 'PUT',
      body: {
        name: 'Provider After Update',
        format: 'openai',
        baseUrl: 'https://provider-after.example',
        apiKey: 'secret-after',
        enabled: true,
        builtin: false,
        enabledModels: ['gpt-4o'],
        disabledModels: [],
        region: '',
      },
    })

    assert.equal(updateResponse.status, 500)
    assert.deepEqual(updateResponse.body, {
      ok: false,
      error: 'Updated provider but failed to sync one or more bots: bot-1',
    })
  }
  finally {
    delete process.env.CORE_API_PORT
    await server.stop()
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('deleteLlmProvider rejects deleting a provider that is still referenced by a bot at the query layer', () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-llm-provider-delete-query-in-use-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)

    const provider = createLlmProvider(db, {
      name: 'In Use Provider',
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
      llmPlatformName: 'In Use Provider',
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

    assert.throws(
      () => deleteLlmProvider(db, provider.id),
      /still used by one or more bots/,
    )
    assert.ok(getLlmProvider(db, provider.id))
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('updateLlmProvider rejects disabling a provider that is still referenced by a bot at the query layer', () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-llm-provider-update-query-in-use-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)

    const provider = createLlmProvider(db, {
      name: 'In Use Provider',
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
      llmPlatformName: 'In Use Provider',
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

    assert.throws(
      () => updateLlmProvider(db, provider.id, { enabled: false }),
      /still used by one or more bots and cannot be disabled/,
    )
    assert.equal(getLlmProvider(db, provider.id)?.enabled, true)
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('updateLlmProvider rejects removing a model used by a referenced bot at the query layer', () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-llm-provider-update-query-model-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)

    const provider = createLlmProvider(db, {
      name: 'In Use Provider',
      format: 'openai',
      baseUrl: 'https://provider.example',
      apiKey: 'secret',
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
      llmPlatformName: 'In Use Provider',
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

    assert.throws(
      () => updateLlmProvider(db, provider.id, { enabledModels: JSON.stringify(['gpt-4.1']) }),
      /still used by one or more bots and cannot remove models they use/,
    )
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('updateLlmProvider rejects stripping bridge credentials from a referenced provider at the query layer', () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-llm-provider-update-query-creds-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)

    const provider = createLlmProvider(db, {
      name: 'In Use Provider',
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
      llmPlatformName: 'In Use Provider',
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

    assert.throws(
      () => updateLlmProvider(db, provider.id, { apiKey: '' }),
      /still used by one or more bots and cannot lose required bridge credentials/,
    )
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

function getListeningPort(server: ApiServer): number {
  const address = (server as any).server.address()
  assert.ok(address && typeof address === 'object' && 'port' in address)
  return address.port
}

async function requestJson(port: number, path: string, options: { method?: string, body?: unknown } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: options.method,
    headers: options.body === undefined ? undefined : {
      'Content-Type': 'application/json',
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  return {
    status: response.status,
    body: await response.json() as any,
  }
}

async function listen(server: http.Server) {
  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', (error?: Error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object' && 'port' in address)
  return address.port
}

async function closeServer(server: http.Server) {
  if (!server.listening) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

function createBotManagerStub(syncCalls: string[] = []) {
  return {
    syncInstance: async (botId: string) => {
      syncCalls.push(botId)
    },
  } as any
}
