import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const skills = sqliteTable('skills', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull().default(''),
  version: text('version').notNull().default('1.0.0'),
  sourceType: text('source_type', { enum: ['md', 'zip', 'manual', 'agent_authored'] }).notNull(),
  ownerBotInstanceId: text('owner_bot_instance_id'),
  entryFile: text('entry_file').notNull().default('SKILL.md'),
  packageDir: text('package_dir').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  requiredTools: text('required_tools').notNull().default('[]'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export type SkillRow = typeof skills.$inferSelect
export type NewSkillRow = typeof skills.$inferInsert
