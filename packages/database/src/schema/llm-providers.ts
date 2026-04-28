import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const llmProviders = sqliteTable('llm_providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  format: text('format', { enum: ['openai', 'google', 'vertex'] }).notNull(),
  baseUrl: text('base_url').notNull().default(''),
  apiKey: text('api_key').notNull().default(''),
  enabledModels: text('enabled_models').notNull().default('[]'),
  disabledModels: text('disabled_models').notNull().default('[]'),
  region: text('region').notNull().default(''),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  builtin: integer('builtin', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export type LlmProviderRow = typeof llmProviders.$inferSelect
export type NewLlmProviderRow = typeof llmProviders.$inferInsert
