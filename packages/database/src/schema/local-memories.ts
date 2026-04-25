import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { botInstances } from './bot-instances.js'

export const localMemories = sqliteTable('local_memories', {
  id: text('id').primaryKey(),
  botInstanceId: text('bot_instance_id')
    .notNull()
    .references(() => botInstances.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),
  userId: text('user_id').notNull(),
  memory: text('memory').notNull(),
  kind: text('kind').notNull().default('fact'),
  sourceTopicId: text('source_topic_id').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }).notNull(),
}, table => ({
  scopeUpdatedIdx: index('local_memories_scope_updated_idx').on(
    table.botInstanceId,
    table.platform,
    table.userId,
    table.updatedAt,
  ),
  scopeLastUsedIdx: index('local_memories_scope_last_used_idx').on(
    table.botInstanceId,
    table.platform,
    table.userId,
    table.lastUsedAt,
  ),
  scopeMemoryUniqueIdx: uniqueIndex('local_memories_scope_memory_unique').on(
    table.botInstanceId,
    table.platform,
    table.userId,
    table.memory,
  ),
}))

export type LocalMemoryRow = typeof localMemories.$inferSelect
export type NewLocalMemoryRow = typeof localMemories.$inferInsert
