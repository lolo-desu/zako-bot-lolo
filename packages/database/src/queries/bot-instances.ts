import { asc, eq } from 'drizzle-orm'
import type { DB } from '../client.js'
import { botInstances, roles } from '../schema/index.js'
import type { NewBotInstanceRow } from '../schema/bot-instances.js'

export function listBotsWithRoles(db: DB) {
  return db
    .select({ instance: botInstances, role: roles })
    .from(botInstances)
    .innerJoin(roles, eq(botInstances.roleId, roles.id))
    .orderBy(asc(botInstances.createdAt))
    .all()
}

export function getEnabledBots(db: DB) {
  return db
    .select({ instance: botInstances, role: roles })
    .from(botInstances)
    .innerJoin(roles, eq(botInstances.roleId, roles.id))
    .where(eq(botInstances.enabled, true))
    .all()
}

export function getBot(db: DB, instanceId: string) {
  return db
    .select()
    .from(botInstances)
    .where(eq(botInstances.id, instanceId))
    .get()
}

export function getBotByLlmProviderId(db: DB, llmProviderId: string) {
  return db
    .select()
    .from(botInstances)
    .where(eq(botInstances.llmProviderId, llmProviderId))
    .get()
}

export function listBotsByLlmProviderId(db: DB, llmProviderId: string) {
  return db
    .select()
    .from(botInstances)
    .where(eq(botInstances.llmProviderId, llmProviderId))
    .all()
}

export function getBotWithRole(db: DB, instanceId: string) {
  return db
    .select({ instance: botInstances, role: roles })
    .from(botInstances)
    .innerJoin(roles, eq(botInstances.roleId, roles.id))
    .where(eq(botInstances.id, instanceId))
    .get()
}

export function createBot(db: DB, values: NewBotInstanceRow) {
  db.insert(botInstances).values(values).run()
  return getBotWithRole(db, values.id)
}

export function updateBot(db: DB, id: string, values: Partial<NewBotInstanceRow>) {
  db
    .update(botInstances)
    .set(values)
    .where(eq(botInstances.id, id))
    .run()

  return getBotWithRole(db, id)
}

export function updateBotsByLlmProviderId(db: DB, llmProviderId: string, values: Partial<NewBotInstanceRow>) {
  return db
    .update(botInstances)
    .set(values)
    .where(eq(botInstances.llmProviderId, llmProviderId))
    .run()
}

export function deleteBot(db: DB, id: string) {
  return db
    .delete(botInstances)
    .where(eq(botInstances.id, id))
    .run()
}
