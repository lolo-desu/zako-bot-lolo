import { and, desc, eq, inArray } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import type { DB } from '../client.js'
import { localMemories, type NewLocalMemoryRow } from '../schema/index.js'

type LocalMemoryScope = {
  botInstanceId: string
  platform: string
  userId: string
}

export function listLocalMemories(db: DB, scope: LocalMemoryScope, limit = 100) {
  return db
    .select()
    .from(localMemories)
    .where(and(
      eq(localMemories.botInstanceId, scope.botInstanceId),
      eq(localMemories.platform, scope.platform),
      eq(localMemories.userId, scope.userId),
    ))
    .orderBy(desc(localMemories.lastUsedAt), desc(localMemories.updatedAt), desc(localMemories.createdAt))
    .limit(limit)
    .all()
}

export function upsertLocalMemory(
  db: DB,
  input: Omit<NewLocalMemoryRow, 'id' | 'createdAt' | 'updatedAt' | 'lastUsedAt'> & { now?: Date },
) {
  const now = input.now ?? new Date()

  db
    .insert(localMemories)
    .values({
      id: randomUUID(),
      botInstanceId: input.botInstanceId,
      platform: input.platform,
      userId: input.userId,
      memory: input.memory,
      kind: input.kind,
      sourceTopicId: input.sourceTopicId,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        localMemories.botInstanceId,
        localMemories.platform,
        localMemories.userId,
        localMemories.memory,
      ],
      set: {
        kind: input.kind,
        sourceTopicId: input.sourceTopicId,
        updatedAt: now,
        lastUsedAt: now,
      },
    })
    .run()
}

export function touchLocalMemories(db: DB, ids: string[], now = new Date()) {
  if (ids.length === 0) {
    return
  }

  db
    .update(localMemories)
    .set({ lastUsedAt: now })
    .where(inArray(localMemories.id, ids))
    .run()
}

export function deleteLocalMemory(db: DB, scope: LocalMemoryScope, id: string) {
  return db
    .delete(localMemories)
    .where(and(
      eq(localMemories.id, id),
      eq(localMemories.botInstanceId, scope.botInstanceId),
      eq(localMemories.platform, scope.platform),
      eq(localMemories.userId, scope.userId),
    ))
    .run()
}
