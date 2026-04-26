import assert from 'node:assert/strict'
import test from 'node:test'
import { BotManager } from '../../src/bot/bot-manager.js'
import { DiscordAdapter } from '../../src/bot/discord-adapter.js'
import { runPostReplyHooks } from '../../src/bot/post-reply-hooks.js'

function createDeferred() {
  let resolve!: () => void
  const promise = new Promise<void>((res) => {
    resolve = res
  })

  return { promise, resolve }
}

function waitForScheduledHooks() {
  return new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
}

function waitForMicrotask() {
  return Promise.resolve()
}

async function captureUnhandledRejections(run: () => Promise<void> | void) {
  const rejections: unknown[] = []
  const onUnhandledRejection = (error: unknown) => {
    rejections.push(error)
  }

  process.on('unhandledRejection', onUnhandledRejection)

  try {
    await run()
    await waitForScheduledHooks()
    await waitForMicrotask()
    await waitForMicrotask()
    return rejections
  }
  finally {
    process.off('unhandledRejection', onUnhandledRejection)
  }
}

test('runPostReplyHooks starts review only after remember resolves', async () => {
  const rememberDeferred = createDeferred()
  const reviewDeferred = createDeferred()
  const calls: string[] = []

  runPostReplyHooks({
    rememberTopicTurn: () => {
      calls.push('remember:start')
      return rememberDeferred.promise.then(() => {
        calls.push('remember:end')
      })
    },
    reviewTopicMemories: () => {
      calls.push('review:start')
      return reviewDeferred.promise
    },
  } as any, 'topic-1')

  assert.deepEqual(calls, [])

  await waitForScheduledHooks()

  assert.deepEqual(calls, ['remember:start'])

  rememberDeferred.resolve()
  await waitForScheduledHooks()

  assert.equal(calls.slice(0, 2).join(','), 'remember:start,remember:end')
  assert.equal(calls.at(-1), 'review:start')

  reviewDeferred.resolve()
})

test('runPostReplyHooks swallows rememberTopicTurn rejections', async () => {
  const rejections = await captureUnhandledRejections(() => {
    runPostReplyHooks({
      rememberTopicTurn: async () => {
        throw new Error('remember failed')
      },
      reviewTopicMemories: async () => {},
    } as any, 'topic-1')
  })

  assert.deepEqual(rejections, [])
})

test('runPostReplyHooks swallows reviewTopicMemories rejections', async () => {
  const rejections = await captureUnhandledRejections(() => {
    runPostReplyHooks({
      rememberTopicTurn: async () => {},
      reviewTopicMemories: async () => {
        throw new Error('review failed')
      },
    } as any, 'topic-1')
  })

  assert.deepEqual(rejections, [])
})

test('processTopicMessage schedules both post-reply hooks off-path', async () => {
  const rememberDeferred = createDeferred()
  const reviewDeferred = createDeferred()
  const calls: string[] = []
  const appendCalls: Array<Record<string, unknown>> = []

  const adapter = new DiscordAdapter(
    {
      id: 'bot-1',
      name: 'tester',
      llmModel: 'gpt-test',
      platform: 'discord',
    } as any,
    {} as any,
    {
      rememberTopicTurn: (topicId: string) => {
        calls.push(`remember:${topicId}`)
        return rememberDeferred.promise
      },
      reviewTopicMemories: (topicId: string) => {
        calls.push(`review:${topicId}`)
        return reviewDeferred.promise
      },
    } as any,
    {
      appendMessage: (...args: unknown[]) => {
        appendCalls.push(args[3] as Record<string, unknown>)
        return {}
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
      toolApprovalMode: 'none',
      toolProcessMode: 'none',
    }),
    async () => [],
    async () => 'ok',
  ) as any

  adapter.client.user = {
    id: 'assistant-1',
    username: 'assistant',
  }
  adapter.withTypingIndicator = async (_sendTyping: unknown, run: () => Promise<string>) => run()
  adapter.enqueueTopicReply = async () => 'reply text'

  const result = await Promise.race([
    adapter.processTopicMessage(
      'topic-1',
      { scopeKey: 'discord:topic-1' },
      { role: 'user', content: 'hello' },
      async () => ({ id: 'message-1' }),
      async () => {},
    ).then(() => 'resolved'),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 20)),
  ])

  assert.equal(result, 'resolved')
  assert.deepEqual(calls, [])
  assert.equal(appendCalls.length, 2)

  await waitForScheduledHooks()

  assert.deepEqual(calls, ['remember:topic-1'])

  rememberDeferred.resolve()
  await waitForMicrotask()
  await waitForMicrotask()

  assert.equal(calls.join(','), 'remember:topic-1,review:topic-1')

  reviewDeferred.resolve()
})

test('sendPanelMessage schedules both post-reply hooks off-path', async () => {
  const rememberDeferred = createDeferred()
  const reviewDeferred = createDeferred()
  const calls: string[] = []

  const manager = new BotManager(
    {} as any,
    {
      list: () => [],
    } as any,
    {
      listAvailableForBot: () => [],
    } as any,
    () => ({
      systemPrompt: '',
      maxToolCallRounds: 4,
      requireMention: false,
      threadMode: true,
      maxThreadsPerChannel: 3,
      sendTime: false,
      timezone: 'UTC',
      toolApprovalMode: 'none',
      toolProcessMode: 'none',
    }),
    () => ({
      enabled: true,
      writebackEnabled: true,
      maxMemoriesPerUser: 20,
      retrievalLimit: 5,
      rememberTurns: 12,
      cleanupSchedule: '0 4 * * *',
      cleanupRetentionDays: 180,
      provider: 'openai',
      model: 'gpt-test',
      apiKey: 'test-key',
      baseUrl: '',
    }),
  ) as any

  const topic = {
    id: 'topic-1',
    botInstanceId: 'bot-1',
    scopeKey: 'panel:topic-1',
    sourceType: 'panel',
    sourceId: 'panel',
    metadata: '{}',
  }
  const appendedMessages: Array<Record<string, unknown>> = []

  manager.requireBotRow = () => ({
    instance: {
      id: 'bot-1',
      name: 'tester',
      platform: 'discord',
      llmModel: 'gpt-test',
      llmApiKey: 'test-key',
      llmBaseUrl: 'https://example.com',
    },
    role: {},
  })
  manager.createAgent = () => ({
    respond: async () => 'panel reply',
    rememberTopicTurn: (topicId: string) => {
      calls.push(`remember:${topicId}`)
      return rememberDeferred.promise
    },
    reviewTopicMemories: (topicId: string) => {
      calls.push(`review:${topicId}`)
      return reviewDeferred.promise
    },
  })
  manager.conversations = {
    getTopic: () => topic,
    appendMessage: (_instance: unknown, _topicId: string, _scope: unknown, input: Record<string, unknown>) => {
      appendedMessages.push(input)
      return input
    },
  }

  const result = await Promise.race([
    manager.sendPanelMessage('bot-1', 'hello', 'topic-1').then(() => 'resolved'),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 20)),
  ])

  assert.equal(result, 'resolved')
  assert.deepEqual(calls, [])
  assert.equal(appendedMessages.length, 2)

  await waitForScheduledHooks()

  assert.deepEqual(calls, ['remember:topic-1'])

  rememberDeferred.resolve()
  await waitForMicrotask()
  await waitForMicrotask()

  assert.equal(calls.join(','), 'remember:topic-1,review:topic-1')

  reviewDeferred.resolve()
})
