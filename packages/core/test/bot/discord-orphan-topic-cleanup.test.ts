import assert from 'node:assert/strict'
import test from 'node:test'
import { runDiscordOrphanTopicCleanup, runDiscordOrphanTopicCleanupSafely } from '../../src/bot/discord-orphan-topic-cleanup.js'

test('runDiscordOrphanTopicCleanup deletes topics whose discord thread is gone', async () => {
  const deleted: string[] = []

  await runDiscordOrphanTopicCleanup({
    listDiscordThreadTopics: () => [
      { id: 'topic-1', metadata: '{"threadId":"thread-1"}', sourceId: 'thread-1' },
    ],
    isThreadMissing: async () => true,
    deleteTopic: async (topicId: string) => {
      deleted.push(topicId)
    },
  })

  assert.deepEqual(deleted, ['topic-1'])
})

test('runDiscordOrphanTopicCleanup keeps topics whose discord thread still exists', async () => {
  const deleted: string[] = []

  await runDiscordOrphanTopicCleanup({
    listDiscordThreadTopics: () => [
      { id: 'topic-1', metadata: '{"threadId":"thread-1"}', sourceId: 'thread-1' },
    ],
    isThreadMissing: async () => false,
    deleteTopic: async (topicId: string) => {
      deleted.push(topicId)
    },
  })

  assert.deepEqual(deleted, [])
})

test('runDiscordOrphanTopicCleanup logs one topic failure and continues', async () => {
  const deleted: string[] = []
  const errors: string[] = []

  await runDiscordOrphanTopicCleanup({
    listDiscordThreadTopics: () => [
      { id: 'topic-1', metadata: '{"threadId":"thread-1"}', sourceId: 'thread-1' },
      { id: 'topic-2', metadata: '{"threadId":"thread-2"}', sourceId: 'thread-2' },
    ],
    isThreadMissing: async (threadId: string) => {
      if (threadId === 'thread-1') {
        throw new Error('fetch failed')
      }
      return true
    },
    deleteTopic: async (topicId: string) => {
      deleted.push(topicId)
    },
    onTopicError: (topicId, error) => {
      errors.push(`${topicId}: ${error instanceof Error ? error.message : String(error)}`)
    },
  })

  assert.deepEqual(errors, ['topic-1: fetch failed'])
  assert.deepEqual(deleted, ['topic-2'])
})

test('runDiscordOrphanTopicCleanupSafely logs background cleanup failures', async () => {
  const errors: string[] = []

  await runDiscordOrphanTopicCleanupSafely(
    async () => {
      throw new Error('cleanup boom')
    },
    (message, error) => {
      errors.push(`${message}: ${error instanceof Error ? error.message : String(error)}`)
    },
  )

  assert.deepEqual(errors, ['[Discord] Orphan topic cleanup failed: cleanup boom'])
})
