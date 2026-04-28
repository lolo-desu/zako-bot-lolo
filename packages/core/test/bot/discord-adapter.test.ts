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
