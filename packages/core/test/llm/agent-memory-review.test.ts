import assert from 'node:assert/strict'
import test from 'node:test'
import { Agent } from '../../src/llm/agent.js'

test('reviewTopicMemories reviews recent topic messages and saves parsed memories', async () => {
  const originalInfo = console.info
  console.info = () => {}
  const saveCalls: Array<Record<string, unknown>> = []
  const listMemoryTextsCalls: Array<Record<string, unknown>> = []
  const role = {
    id: 'role-1',
    avatar: '',
    name: 'Tester',
    systemPrompt: 'You are a tester.',
    llmProvider: 'openai',
    llmModel: 'gpt-test',
    llmApiKey: 'test-key',
    llmBaseUrl: null,
    enabledTools: '[]',
    enabledSkills: '[]',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const agent = new Agent(
    'bot-1',
    () => role,
    { provider: 'openai', model: 'gpt-test', apiKey: 'test-key' },
    {
      listTopicHistory: () => [],
      listTopicMessages: () => [
        { role: 'user', content: '我更喜欢 TypeScript。', platform: 'discord', senderId: 'user-1' },
        { role: 'assistant', content: '记住了。', platform: 'discord', senderId: '' },
        { role: 'user', content: '最近主要在维护 zako-bot。', platform: 'discord', senderId: 'user-1' },
      ],
    } as any,
    {
      listEnabled: () => [],
      list: () => [],
    } as any,
    {
      listAvailableForBot: () => [],
    } as any,
    {
      isEnabled: () => true,
      shouldWriteback: () => true,
      buildPromptBlock: () => '',
      listMemoryTexts: (input: Record<string, unknown>) => {
        listMemoryTextsCalls.push(input)
        return ['用户偏好 JavaScript']
      },
      saveMemories: (input: Record<string, unknown>) => {
        saveCalls.push(input)
        return 1
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
  )

  ;(agent as any).client = {
    chat: async () => '[{"memory":"用户偏好 TypeScript","kind":"preference"}]',
  }

  try {
    await (agent as any).reviewTopicMemories('topic-1')

    assert.deepEqual(listMemoryTextsCalls, [{ botInstanceId: 'bot-1', platform: 'discord', userId: 'user-1' }])
    assert.deepEqual(saveCalls, [{
      botInstanceId: 'bot-1',
      platform: 'discord',
      userId: 'user-1',
      topicId: 'topic-1',
      items: [{ memory: '用户偏好 TypeScript', kind: 'preference' }],
    }])
  }
  finally {
    console.info = originalInfo
  }
})

test('reviewTopicMemories swallows reviewer failures', async () => {
  const originalWarn = console.warn
  console.warn = () => {}
  const role = {
    id: 'role-1',
    avatar: '',
    name: 'Tester',
    systemPrompt: 'You are a tester.',
    llmProvider: 'openai',
    llmModel: 'gpt-test',
    llmApiKey: 'test-key',
    llmBaseUrl: null,
    enabledTools: '[]',
    enabledSkills: '[]',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const agent = new Agent(
    'bot-1',
    () => role,
    { provider: 'openai', model: 'gpt-test', apiKey: 'test-key' },
    {
      listTopicHistory: () => [],
      listTopicMessages: () => [
        { role: 'user', content: '我更喜欢 TypeScript。', platform: 'discord', senderId: 'user-1' },
        { role: 'assistant', content: '记住了。', platform: 'discord', senderId: '' },
      ],
    } as any,
    {
      listEnabled: () => [],
      list: () => [],
    } as any,
    {
      listAvailableForBot: () => [],
    } as any,
    {
      isEnabled: () => true,
      shouldWriteback: () => true,
      buildPromptBlock: () => '',
      listMemoryTexts: () => [],
      saveMemories: () => 0,
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
  )

  ;(agent as any).client = {
    chat: async () => {
      throw new Error('review failed')
    },
  }

  try {
    await assert.doesNotReject(() => (agent as any).reviewTopicMemories('topic-1'))
  }
  finally {
    console.warn = originalWarn
  }
})

test('reviewTopicMemories warns and skips when reviewer output is malformed', async () => {
  const originalWarn = console.warn
  const originalInfo = console.info
  const warnCalls: unknown[][] = []
  const infoCalls: unknown[][] = []
  console.warn = (...args) => {
    warnCalls.push(args)
  }
  console.info = (...args) => {
    infoCalls.push(args)
  }
  const saveCalls: Array<Record<string, unknown>> = []
  const role = {
    id: 'role-1',
    avatar: '',
    name: 'Tester',
    systemPrompt: 'You are a tester.',
    llmProvider: 'openai',
    llmModel: 'gpt-test',
    llmApiKey: 'test-key',
    llmBaseUrl: null,
    enabledTools: '[]',
    enabledSkills: '[]',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const agent = new Agent(
    'bot-1',
    () => role,
    { provider: 'openai', model: 'gpt-test', apiKey: 'test-key' },
    {
      listTopicHistory: () => [],
      listTopicMessages: () => [
        { role: 'user', content: '我更喜欢 TypeScript。', platform: 'discord', senderId: 'user-1' },
        { role: 'assistant', content: '记住了。', platform: 'discord', senderId: '' },
      ],
    } as any,
    {
      listEnabled: () => [],
      list: () => [],
    } as any,
    {
      listAvailableForBot: () => [],
    } as any,
    {
      isEnabled: () => true,
      shouldWriteback: () => true,
      buildPromptBlock: () => '',
      listMemoryTexts: () => [],
      saveMemories: (input: Record<string, unknown>) => {
        saveCalls.push(input)
        return 0
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
  )

  ;(agent as any).client = {
    chat: async () => 'not json at all',
  }

  try {
    await (agent as any).reviewTopicMemories('topic-1')

    assert.equal(saveCalls.length, 0)
    assert.equal(warnCalls.length, 1)
    assert.match(String(warnCalls[0]?.[0] ?? ''), /Review returned malformed output/)
    assert.equal(infoCalls.some(call => String(call[0] ?? '').includes('Review produced no durable memories')), false)
  }
  finally {
    console.warn = originalWarn
    console.info = originalInfo
  }
})

test('reviewTopicMemories swallows reviewer setup failures', async () => {
  const originalWarn = console.warn
  console.warn = () => {}
  const role = {
    id: 'role-1',
    avatar: '',
    name: 'Tester',
    systemPrompt: 'You are a tester.',
    llmProvider: 'openai',
    llmModel: 'gpt-test',
    llmApiKey: 'test-key',
    llmBaseUrl: null,
    enabledTools: '[]',
    enabledSkills: '[]',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const agent = new Agent(
    'bot-1',
    () => role,
    { provider: 'openai', model: 'gpt-test', apiKey: 'test-key' },
    {
      listTopicHistory: () => [],
      listTopicMessages: () => [
        { role: 'user', content: '我更喜欢 TypeScript。', platform: 'discord', senderId: 'user-1' },
        { role: 'assistant', content: '记住了。', platform: 'discord', senderId: '' },
      ],
    } as any,
    {
      listEnabled: () => [],
      list: () => [],
    } as any,
    {
      listAvailableForBot: () => [],
    } as any,
    {
      isEnabled: () => true,
      shouldWriteback: () => true,
      buildPromptBlock: () => '',
      listMemoryTexts: () => {
        throw new Error('setup failed')
      },
      saveMemories: () => 0,
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
  )

  try {
    await assert.doesNotReject(() => (agent as any).reviewTopicMemories('topic-1'))
  }
  finally {
    console.warn = originalWarn
  }
})

test('reviewTopicMemories only reviews the target user messages plus assistant replies in that user chain', async () => {
  const originalInfo = console.info
  console.info = () => {}
  const role = {
    id: 'role-1',
    avatar: '',
    name: 'Tester',
    systemPrompt: 'You are a tester.',
    llmProvider: 'openai',
    llmModel: 'gpt-test',
    llmApiKey: 'test-key',
    llmBaseUrl: null,
    enabledTools: '[]',
    enabledSkills: '[]',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  const chatCalls: Array<Array<{ role: string, content: unknown }>> = []
  const listMemoryTextsCalls: Array<Record<string, unknown>> = []

  const agent = new Agent(
    'bot-1',
    () => role,
    { provider: 'openai', model: 'gpt-test', apiKey: 'test-key' },
    {
      listTopicHistory: () => [],
      listTopicMessages: () => [
        { role: 'user', content: 'user-1 says hello', platform: 'discord', senderId: 'user-1' },
        { role: 'assistant', content: 'assistant replies to user-1', platform: 'discord', senderId: '' },
        { role: 'user', content: 'user-2 private detail', platform: 'discord', senderId: 'user-2' },
        { role: 'assistant', content: 'assistant replies to user-2', platform: 'discord', senderId: '' },
        { role: 'user', content: 'user-1 asks final question', platform: 'discord', senderId: 'user-1' },
        { role: 'assistant', content: 'assistant replies to user-1 again', platform: 'discord', senderId: '' },
      ],
    } as any,
    {
      listEnabled: () => [],
      list: () => [],
    } as any,
    {
      listAvailableForBot: () => [],
    } as any,
    {
      isEnabled: () => true,
      shouldWriteback: () => true,
      buildPromptBlock: () => '',
      listMemoryTexts: (input: Record<string, unknown>) => {
        listMemoryTextsCalls.push(input)
        return []
      },
      saveMemories: () => 0,
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
  )

  ;(agent as any).client = {
    chat: async (messages: Array<{ role: string, content: unknown }>) => {
      chatCalls.push(messages)
      return '[]'
    },
  }

  try {
    await (agent as any).reviewTopicMemories('topic-1')

    assert.equal(chatCalls.length, 1)
    assert.deepEqual(listMemoryTextsCalls, [{ botInstanceId: 'bot-1', platform: 'discord', userId: 'user-1' }])
    const reviewInput = String(chatCalls[0]?.[1]?.content ?? '')
    assert.match(reviewInput, /用户：user-1 says hello/)
    assert.match(reviewInput, /助手：assistant replies to user-1/)
    assert.match(reviewInput, /用户：user-1 asks final question/)
    assert.match(reviewInput, /助手：assistant replies to user-1 again/)
    assert.doesNotMatch(reviewInput, /user-2 private detail/)
    assert.doesNotMatch(reviewInput, /assistant replies to user-2/)
  }
  finally {
    console.info = originalInfo
  }
})

test('reviewTopicMemories attributes review scope to the user tied to the latest assistant reply', async () => {
  const originalInfo = console.info
  console.info = () => {}
  const role = {
    id: 'role-1',
    avatar: '',
    name: 'Tester',
    systemPrompt: 'You are a tester.',
    llmProvider: 'openai',
    llmModel: 'gpt-test',
    llmApiKey: 'test-key',
    llmBaseUrl: null,
    enabledTools: '[]',
    enabledSkills: '[]',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  const chatCalls: Array<Array<{ role: string, content: unknown }>> = []
  const listMemoryTextsCalls: Array<Record<string, unknown>> = []

  const agent = new Agent(
    'bot-1',
    () => role,
    { provider: 'openai', model: 'gpt-test', apiKey: 'test-key' },
    {
      listTopicHistory: () => [],
      listTopicMessages: () => [
        { role: 'user', content: 'user-1 preference', platform: 'discord', senderId: 'user-1' },
        { role: 'assistant', content: 'assistant reply to user-1', platform: 'discord', senderId: '' },
        { role: 'user', content: 'user-2 arrives later', platform: 'discord', senderId: 'user-2' },
      ],
    } as any,
    {
      listEnabled: () => [],
      list: () => [],
    } as any,
    {
      listAvailableForBot: () => [],
    } as any,
    {
      isEnabled: () => true,
      shouldWriteback: () => true,
      buildPromptBlock: () => '',
      listMemoryTexts: (input: Record<string, unknown>) => {
        listMemoryTextsCalls.push(input)
        return []
      },
      saveMemories: () => 0,
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
  )

  ;(agent as any).client = {
    chat: async (messages: Array<{ role: string, content: unknown }>) => {
      chatCalls.push(messages)
      return '[]'
    },
  }

  try {
    await (agent as any).reviewTopicMemories('topic-1')

    assert.equal(chatCalls.length, 1)
    assert.deepEqual(listMemoryTextsCalls, [{ botInstanceId: 'bot-1', platform: 'discord', userId: 'user-1' }])
    const reviewInput = String(chatCalls[0]?.[1]?.content ?? '')
    assert.match(reviewInput, /用户：user-1 preference/)
    assert.match(reviewInput, /助手：assistant reply to user-1/)
    assert.doesNotMatch(reviewInput, /user-2 arrives later/)
  }
  finally {
    console.info = originalInfo
  }
})
