import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'fs'
import test from 'node:test'
import { tmpdir } from 'os'
import { join } from 'path'
import type Database from 'better-sqlite3'
import { createDb, createLlmProvider, listLlmProviders, runMigrations } from '@zakobot/database'
import { seed } from '../../src/seed.js'

test('seed persists builtin llm providers for fresh installs', () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-provider-seed-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    seed(db)

    const providers = listLlmProviders(db)

    assert.deepEqual(
      providers
        .map(provider => ({
        name: provider.name,
        format: provider.format,
        builtin: provider.builtin,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
      [
        { name: 'DeepSeek', format: 'openai', builtin: true },
        { name: 'Google AI Studio', format: 'google', builtin: true },
        { name: 'Google Vertex AI', format: 'vertex', builtin: true },
        { name: 'OpenAI', format: 'openai', builtin: true },
      ],
    )
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('seed adds missing builtin template without converting matching custom provider', () => {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-provider-seed-custom-'))
  const db = createDb(join(root, 'data.db'))
  const sqlite = (db as unknown as { $client: Database }).$client

  try {
    runMigrations(db)

    const customProvider = createLlmProvider(db, {
      name: 'OpenAI',
      format: 'openai',
      baseUrl: 'https://example.com/custom-openai',
      apiKey: '',
      enabledModels: '[]',
      disabledModels: '[]',
      region: '',
      enabled: false,
      builtin: false,
    })

    seed(db)

    const providers = listLlmProviders(db)
    const customAfterSeed = providers.find(provider => provider.id === customProvider.id)
    const builtinOpenAiProviders = providers.filter(provider => provider.name === 'OpenAI' && provider.format === 'openai' && provider.builtin)

    assert.equal(customAfterSeed?.builtin, false)
    assert.equal(customAfterSeed?.baseUrl, 'https://example.com/custom-openai')
    assert.equal(builtinOpenAiProviders.length, 1)
    assert.equal(builtinOpenAiProviders[0].id === customProvider.id, false)
    assert.equal(builtinOpenAiProviders[0].baseUrl, 'https://api.openai.com')
  }
  finally {
    sqlite.close()
    rmSync(root, { recursive: true, force: true })
  }
})
