const DISCORD_THREAD_SOURCE_TYPE = 'discord_thread'

type DiscordThreadTopic = {
  id: string
  metadata: string
  sourceId: string
}

type CleanupDeps = {
  listDiscordThreadTopics: () => DiscordThreadTopic[]
  isThreadMissing: (threadId: string) => Promise<boolean>
  deleteTopic: (topicId: string) => Promise<void>
  onTopicError?: (topicId: string, error: unknown) => void
}

export const DISCORD_ORPHAN_TOPIC_CLEANUP_INTERVAL_MS = 48 * 60 * 60 * 1000
export { DISCORD_THREAD_SOURCE_TYPE }

export async function runDiscordOrphanTopicCleanupSafely(
  runCleanup: () => Promise<void>,
  logError: (message: string, error: unknown) => void,
) {
  try {
    await runCleanup()
  }
  catch (error) {
    logError('[Discord] Orphan topic cleanup failed', error)
  }
}

export async function runDiscordOrphanTopicCleanup(deps: CleanupDeps) {
  for (const topic of deps.listDiscordThreadTopics()) {
    try {
      const threadId = topic.sourceId.trim()
      if (!threadId) {
        continue
      }

      if (!await deps.isThreadMissing(threadId)) {
        continue
      }

      await deps.deleteTopic(topic.id)
    }
    catch (error) {
      deps.onTopicError?.(topic.id, error)
    }
  }
}
