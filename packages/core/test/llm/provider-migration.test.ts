import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'fs'
import test from 'node:test'
import { tmpdir } from 'os'
import { join } from 'path'
import type Database from 'better-sqlite3'
import {
  createBot,
  createDb,
  createLlmProvider,
  createRole,
  getBot,
  listLlmProviders,
  runMigrations,
} from '@zakobot/database'
import { migrateLegacyBotProviders } from '../../src/llm/provider-migration.js'
import { toLlmProviderProfile } from '../../src/api/serializers.js'

test('legacy migration reuses matching providers, enables them, and adds the bot model', () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-legacy-provider-reuse-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)
    createTestRole(db)

    const existingProvider = createLlmProvider(db, {
      name: 'Shared Provider',
      format: 'openai',
      baseUrl: 'https://provider.example',
      apiKey: 'secret',
      enabledModels: JSON.stringify(['existing-model']),
      disabledModels: JSON.stringify(['disabled-model']),
      region: '',
      enabled: false,
      builtin: false,
    })

    createBot(db, {
      id: 'bot-1',
      name: 'Legacy Bot',
      platform: 'discord',
      token: 'token',
      roleId: 'role-1',
      llmProvider: 'openai',
      llmProviderId: null,
      llmPlatformName: 'Shared Provider',
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

    const migrated = migrateLegacyBotProviders(db)
    const bot = getBot(db, 'bot-1')
    const provider = listLlmProviders(db).find(row => row.id === existingProvider.id)

    assert.equal(migrated.length, 1)
    assert.equal(migrated[0]?.botId, 'bot-1')
    assert.equal(migrated[0]?.providerId, existingProvider.id)
    assert.equal(bot?.llmProviderId, existingProvider.id)
    assert.equal(provider?.enabled, true)
    assert.deepEqual(JSON.parse(provider!.enabledModels), ['existing-model', 'gpt-4o'])
    assert.deepEqual(JSON.parse(provider!.disabledModels), ['disabled-model'])
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('legacy migration creates one provider per legacy identity and leaves unrelated bots alone', () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-legacy-provider-create-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)
    createTestRole(db)
    const existingProvider = createLlmProvider(db, {
      name: 'Existing Provider',
      format: 'openai',
      baseUrl: 'https://existing.example',
      apiKey: 'secret',
      enabledModels: '[]',
      disabledModels: '[]',
      region: '',
      enabled: true,
      builtin: false,
    })

    createBot(db, {
      id: 'bot-1',
      name: 'Legacy One',
      platform: 'discord',
      token: 'token-1',
      roleId: 'role-1',
      llmProvider: 'openai',
      llmProviderId: null,
      llmPlatformName: 'Migrated Provider',
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
    createBot(db, {
      id: 'bot-2',
      name: 'Legacy Two',
      platform: 'discord',
      token: 'token-2',
      roleId: 'role-1',
      llmProvider: 'openai',
      llmProviderId: null,
      llmPlatformName: 'Migrated Provider',
      llmModel: 'gpt-4.1',
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
    createBot(db, {
      id: 'bot-3',
      name: 'Already Migrated',
      platform: 'discord',
      token: 'token-3',
      roleId: 'role-1',
      llmProvider: 'openai',
      llmProviderId: existingProvider.id,
      llmPlatformName: 'Ignored Provider',
      llmModel: 'ignored-model',
      llmApiKey: 'ignored-secret',
      llmBaseUrl: 'https://ignored.example',
      discordUserId: '',
      discordChannelId: '',
      discordGuildId: 'guild-1',
      enabled: true,
      requireMention: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    createBot(db, {
      id: 'bot-4',
      name: 'No Legacy Config',
      platform: 'discord',
      token: 'token-4',
      roleId: 'role-1',
      llmProvider: 'openai',
      llmProviderId: null,
      llmPlatformName: '',
      llmModel: 'gpt-4o-mini',
      llmApiKey: '',
      llmBaseUrl: '',
      discordUserId: '',
      discordChannelId: '',
      discordGuildId: 'guild-1',
      enabled: true,
      requireMention: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const migrated = migrateLegacyBotProviders(db)
    const providers = listLlmProviders(db)
    const createdProvider = providers.find(row => row.name === 'Migrated Provider')

    assert.equal(migrated.length, 2)
    assert.equal(providers.length, 2)
    assert.ok(createdProvider)
    assert.equal(createdProvider.name, 'Migrated Provider')
    assert.equal(createdProvider.enabled, true)
    assert.deepEqual(JSON.parse(createdProvider.enabledModels), ['gpt-4.1', 'gpt-4o'])
    assert.equal(getBot(db, 'bot-1')?.llmProviderId, createdProvider.id)
    assert.equal(getBot(db, 'bot-2')?.llmProviderId, createdProvider.id)
    assert.equal(getBot(db, 'bot-3')?.llmProviderId, existingProvider.id)
    assert.equal(getBot(db, 'bot-4')?.llmProviderId, null)
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('legacy migration leaves non-openai legacy bots on the fallback path', () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-legacy-provider-format-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)
    createTestRole(db)

    createBot(db, {
      id: 'bot-google',
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

    const migrated = migrateLegacyBotProviders(db)

    assert.deepEqual(migrated, [])
    assert.equal(getBot(db, 'bot-google')?.llmProviderId, null)
    assert.equal(listLlmProviders(db).length, 0)
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('provider query rows stay raw and serialize cleanly at the api boundary', () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-llm-provider-row-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)

    const row = createLlmProvider(db, {
      name: 'Provider',
      format: 'openai',
      baseUrl: 'https://example.test',
      apiKey: 'secret',
      enabledModels: JSON.stringify(['gpt-4o']),
      disabledModels: JSON.stringify(['old-model']),
      region: 'us-central1',
      enabled: true,
      builtin: false,
    })
    const profile = toLlmProviderProfile(row)

    assert.equal(typeof row.enabledModels, 'string')
    assert.equal(typeof row.disabledModels, 'string')
    assert.ok(row.createdAt instanceof Date)
    assert.deepEqual(profile.enabledModels, ['gpt-4o'])
    assert.deepEqual(profile.disabledModels, ['old-model'])
    assert.equal(profile.createdAt, row.createdAt.toISOString())
    assert.equal(profile.updatedAt, row.updatedAt.toISOString())
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

function createTestRole(db: ReturnType<typeof createDb>) {
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
}
