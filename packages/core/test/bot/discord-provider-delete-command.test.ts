import assert from 'node:assert/strict'
import test from 'node:test'
import { handleDiscordSlashCommand } from '../../src/bot/discord-commands.js'

function createCommandInteraction(commandName: string, payload: { index?: number } = {}) {
  const state = {
    deferred: false,
    replied: false,
    replyText: '',
    editReplyText: '',
    followUps: [] as string[],
  }

  return {
    commandName,
    deferred: false,
    replied: false,
    channelId: 'channel-1',
    guildId: 'guild-1',
    user: { username: 'tester' },
    options: {
      getInteger(name: string) {
        return name === 'index' ? (payload.index ?? null) : null
      },
    },
    async deferReply() {
      state.deferred = true
      ;(this as any).deferred = true
    },
    async editReply(content: string) {
      state.editReplyText = content
    },
    async followUp({ content }: { content: string }) {
      state.followUps.push(content)
    },
    async reply(input: string | { content: string }) {
      state.replied = true
      ;(this as any).replied = true
      state.replyText = typeof input === 'string' ? input : input.content
    },
    get replyText() {
      return state.replyText
    },
    get editReplyText() {
      return state.editReplyText
    },
    get followUps() {
      return state.followUps
    },
  }
}

test('handleDiscordSlashCommand routes /provider list and switch', async () => {
  const calls: string[] = []
  const interaction = createCommandInteraction('provider', { index: 2 })

  await handleDiscordSlashCommand({
    createDetachedThreadTopic: async () => { throw new Error('unused') },
    deleteCurrentThreadTopic: async () => '已删除当前会话和子区。',
    instanceName: 'tester',
    interaction: interaction as any,
    modelCommand: {} as any,
    providerCommand: {
      buildListReply: async () => ['provider list'],
      switchByIndexReply: async (index: number) => {
        calls.push(`switch:${index}`)
        return 'switched'
      },
    } as any,
    startManualBrowser: async () => 'browser',
    stopCurrentScope: () => 'stopped',
  })

  assert.deepEqual(calls, ['switch:2'])
  assert.equal(interaction.editReplyText, 'switched')
})

test('handleDiscordSlashCommand follows up extra /provider list chunks', async () => {
  const interaction = createCommandInteraction('provider')

  await handleDiscordSlashCommand({
    createDetachedThreadTopic: async () => { throw new Error('unused') },
    deleteCurrentThreadTopic: async () => '已删除当前会话和子区。',
    instanceName: 'tester',
    interaction: interaction as any,
    modelCommand: {} as any,
    providerCommand: {
      buildListReply: async () => ['provider list 1', 'provider list 2'],
      switchByIndexReply: async () => 'unused',
    } as any,
    startManualBrowser: async () => 'browser',
    stopCurrentScope: () => 'stopped',
  })

  assert.equal(interaction.editReplyText, 'provider list 1')
  assert.deepEqual(interaction.followUps, ['provider list 2'])
})

test('handleDiscordSlashCommand routes /del', async () => {
  const interaction = createCommandInteraction('del')

  await handleDiscordSlashCommand({
    createDetachedThreadTopic: async () => { throw new Error('unused') },
    deleteCurrentThreadTopic: async () => '已删除当前会话和子区。',
    instanceName: 'tester',
    interaction: interaction as any,
    modelCommand: {} as any,
    providerCommand: {} as any,
    startManualBrowser: async () => 'browser',
    stopCurrentScope: () => 'stopped',
  })

  assert.equal(interaction.replyText, '已删除当前会话和子区。')
})
