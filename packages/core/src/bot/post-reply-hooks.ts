import type { Agent } from '../llm/agent.js'

async function runHook(task: () => Promise<void>) {
  try {
    await task()
  }
  catch {
    // Post-reply hooks run in the background and must never surface as unhandled rejections.
  }
}

export function runPostReplyHooks(agent: Agent, topicId: string) {
  setImmediate(() => {
    void (async () => {
      await runHook(() => agent.rememberTopicTurn(topicId))
      await runHook(() => agent.reviewTopicMemories(topicId))
    })()
  })
}
