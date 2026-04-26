import { and, asc, eq, inArray } from 'drizzle-orm'
import type { DB } from '../client.js'
import { skills } from '../schema/index.js'

export function listSkills(db: DB) {
  return db
    .select()
    .from(skills)
    .orderBy(asc(skills.createdAt))
    .all()
}

export function listEnabledSkillsByIds(db: DB, ids: string[]) {
  if (!ids.length) {
    return []
  }

  const rows = db
    .select()
    .from(skills)
    .where(and(inArray(skills.id, ids), eq(skills.enabled, true)))
    .all()

  const byId = new Map(rows.map(row => [row.id, row]))
  return ids
    .map(id => byId.get(id))
      .filter((row): row is (typeof rows)[number] => Boolean(row))
}

export function listEnabledAgentSkillsByOwner(db: DB, botInstanceId: string) {
  return db
    .select()
    .from(skills)
    .where(
      and(
        eq(skills.enabled, true),
        eq(skills.sourceType, 'agent_authored'),
        eq(skills.ownerBotInstanceId, botInstanceId),
      ),
    )
    .orderBy(asc(skills.createdAt))
    .all()
}

export function getSkill(db: DB, id: string) {
  return db
    .select()
    .from(skills)
    .where(eq(skills.id, id))
    .get()
}

export function getSkillBySlug(db: DB, slug: string) {
  return db
    .select()
    .from(skills)
    .where(eq(skills.slug, slug))
    .get()
}

export function createSkill(db: DB, values: typeof skills.$inferInsert) {
  db.insert(skills).values(values).run()
  return getSkill(db, values.id)
}

export function updateSkill(db: DB, id: string, values: Partial<typeof skills.$inferInsert>) {
  db
    .update(skills)
    .set(values)
    .where(eq(skills.id, id))
    .run()

  return getSkill(db, id)
}

export function deleteSkill(db: DB, id: string) {
  return db
    .delete(skills)
    .where(eq(skills.id, id))
    .run()
}
