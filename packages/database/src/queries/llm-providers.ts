import { asc, eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import type { DB } from '../client.js'
import { getBotByLlmProviderId, listBotsByLlmProviderId } from './bot-instances.js'
import { llmProviders } from '../schema/llm-providers.js'
import type { LlmProviderRow, NewLlmProviderRow } from '../schema/llm-providers.js'

export function listLlmProviders(db: DB): LlmProviderRow[] {
  return db
    .select()
    .from(llmProviders)
    .orderBy(asc(llmProviders.createdAt))
    .all()
}

export function getLlmProvider(db: DB, id: string): LlmProviderRow | undefined {
  return db
    .select()
    .from(llmProviders)
    .where(eq(llmProviders.id, id))
    .get()
}

export function createLlmProvider(
  db: DB,
  input: Omit<NewLlmProviderRow, 'id' | 'createdAt' | 'updatedAt'>,
): LlmProviderRow {
  const now = new Date()
  const row = {
    ...input,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  }

  db.insert(llmProviders).values(row).run()
  return getLlmProvider(db, row.id)!
}

export function updateLlmProvider(
  db: DB,
  id: string,
  input: Partial<Omit<NewLlmProviderRow, 'id' | 'createdAt'>>,
): LlmProviderRow | undefined {
  const existing = getLlmProvider(db, id)
  if (!existing) {
    return undefined
  }

  assertUpdateSafeForReferencedBots(db, existing, input)

  db
    .update(llmProviders)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(llmProviders.id, id))
    .run()

  return getLlmProvider(db, id)
}

export function deleteLlmProvider(db: DB, id: string): void {
  if (getBotByLlmProviderId(db, id)) {
    throw new Error('LLM provider is still used by one or more bots')
  }

  db
    .delete(llmProviders)
    .where(eq(llmProviders.id, id))
    .run()
}

function assertUpdateSafeForReferencedBots(
  db: DB,
  existing: LlmProviderRow,
  input: Partial<Omit<NewLlmProviderRow, 'id' | 'createdAt'>>,
) {
  const referencedBots = listBotsByLlmProviderId(db, existing.id)
  if (referencedBots.length === 0) {
    return
  }

  const nextProvider = {
    ...existing,
    ...input,
  }

  if (!nextProvider.enabled) {
    throw new Error('LLM provider is still used by one or more bots and cannot be disabled')
  }

  if (nextProvider.format !== 'openai' || !hasBridgeRuntimeConfig(nextProvider.baseUrl, nextProvider.apiKey)) {
    throw new Error('LLM provider is still used by one or more bots and cannot lose required bridge credentials')
  }

  const enabledModels = new Set(parseStringArray(nextProvider.enabledModels))
  if (referencedBots.some(bot => !enabledModels.has(bot.llmModel))) {
    throw new Error('LLM provider is still used by one or more bots and cannot remove models they use')
  }
}

function hasBridgeRuntimeConfig(baseUrl: string, apiKey: string) {
  return baseUrl.trim().length > 0
    && apiKey.trim().length > 0
    && !isVertexServiceAccountApiKey(apiKey)
}

function isVertexServiceAccountApiKey(apiKey: string) {
  try {
    const parsed = JSON.parse(apiKey) as Record<string, unknown>
    return parsed.type === 'service_account'
      && typeof parsed.private_key === 'string'
      && parsed.private_key.length > 0
      && typeof parsed.client_email === 'string'
      && parsed.client_email.length > 0
  }
  catch {
    return false
  }
}

function parseStringArray(value: string): string[] {
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
