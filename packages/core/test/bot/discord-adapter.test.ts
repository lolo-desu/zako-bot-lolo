import assert from 'node:assert/strict'
import test from 'node:test'
import { DiscordAdapter } from '../../src/bot/discord-adapter.js'

interface DiscordAdapterTestView {
  shouldRequireApproval(name: string, input: unknown, mode: 'all' | 'sensitive' | 'none'): boolean
  shouldTrackToolProgress(name: string): boolean
}

function createAdapter() {
  return new DiscordAdapter(
    {
      name: 'tester',
      llmModel: 'gpt-test',
      platform: 'discord',
    } as any,
    {} as any,
    {
      isToolSensitive: () => false,
      explainToolIntent: async () => '',
    } as any,
    {} as any,
    () => ({
      systemPrompt: '',
      maxToolCallRounds: 4,
      requireMention: false,
      threadMode: true,
      maxThreadsPerChannel: 3,
      sendTime: false,
      timezone: 'UTC',
      toolApprovalMode: 'all',
      toolProcessMode: 'full',
    }),
    () => 'Provider One',
    async () => [],
    async () => 'ok',
  )
}

test('skill_load stays internal to the runtime', () => {
  const adapter = createAdapter() as unknown as DiscordAdapterTestView

  assert.equal(adapter.shouldRequireApproval('skill_load', { skill_id: 'skill-1' }, 'all'), false)
  assert.equal(adapter.shouldTrackToolProgress('skill_load'), false)
})

test('normal tools still use the existing approval and progress rules', () => {
  const adapter = createAdapter() as unknown as DiscordAdapterTestView

  assert.equal(adapter.shouldRequireApproval('web_search', { query: 'skills' }, 'all'), true)
  assert.equal(adapter.shouldTrackToolProgress('web_search'), true)
})

test('deleteCurrentInteractionThread rejects non-thread channels', async () => {
  const adapter = createAdapter() as any

  await assert.rejects(
    adapter.deleteCurrentInteractionThread({
      channelId: 'channel-1',
      channel: {
        isThread: () => false,
      },
    }),
    /`\/del` 只能在子区中使用。/,
  )
})

test('deleteCurrentInteractionThread deletes the matching topic', async () => {
  const deletedTopicIds: string[] = []
  const adapter = new DiscordAdapter(
    {
      id: 'bot-1',
      name: 'tester',
      llmModel: 'gpt-test',
      platform: 'discord',
    } as any,
    {} as any,
    {
      isToolSensitive: () => false,
      explainToolIntent: async () => '',
    } as any,
    {
      getTopicByScope: () => ({
        id: 'topic-1',
        metadata: '{"threadId":"thread-1"}',
        sourceId: 'thread-1',
      }),
      deleteTopic: (topicId: string) => {
        deletedTopicIds.push(topicId)
      },
    } as any,
    () => ({
      systemPrompt: '',
      maxToolCallRounds: 4,
      requireMention: false,
      threadMode: true,
      maxThreadsPerChannel: 3,
      sendTime: false,
      timezone: 'UTC',
      toolApprovalMode: 'all',
      toolProcessMode: 'full',
    }),
    () => 'Provider One',
    async () => ['Provider One'],
    async () => 'Provider One',
    async () => [],
    async () => 'ok',
  ) as any

  adapter.deleteConversationThread = async () => {}

  const reply = await adapter.deleteCurrentInteractionThread({
    channelId: 'thread-1',
    channel: {
      isThread: () => true,
    },
  })

  assert.equal(reply, '已删除当前会话和子区。')
  assert.deepEqual(deletedTopicIds, ['topic-1'])
})

test('runOrphanTopicCleanup logs unexpected fetch errors', async () => {
  const errors: unknown[][] = []
  const originalConsoleError = console.error

  try {
    console.error = (...args: unknown[]) => {
      errors.push(args)
    }

    const adapter = new DiscordAdapter(
      {
        id: 'bot-1',
        name: 'tester',
        llmModel: 'gpt-test',
        platform: 'discord',
      } as any,
      {} as any,
      {
        isToolSensitive: () => false,
        explainToolIntent: async () => '',
      } as any,
      {
        listTopicsBySourceType: () => [
          { id: 'topic-1', metadata: '{}', sourceId: 'thread-1' },
        ],
        deleteTopic: () => {},
      } as any,
      () => ({
        systemPrompt: '',
        maxToolCallRounds: 4,
        requireMention: false,
        threadMode: true,
        maxThreadsPerChannel: 3,
        sendTime: false,
        timezone: 'UTC',
        toolApprovalMode: 'all',
        toolProcessMode: 'full',
      }),
      () => 'Provider One',
      async () => [],
      async () => ({ name: 'Provider One', changed: true }),
      async () => [],
      async () => 'ok',
    ) as any

    adapter.client = {
      channels: {
        fetch: async () => {
          const error = new Error('Missing Access') as Error & { code?: number }
          error.code = 50001
          throw error
        },
      },
    }

    await adapter.runOrphanTopicCleanup()

    assert.equal(errors.length, 1)
    assert.equal(String(errors[0]?.[0]).includes('topic-1'), true)
    assert.equal(String(errors[0]?.[1]).includes('Missing Access'), true)
  }
  finally {
    console.error = originalConsoleError
  }
})
