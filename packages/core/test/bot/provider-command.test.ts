import assert from 'node:assert/strict'
import test from 'node:test'
import { DiscordProviderCommand } from '../../src/bot/provider-command.js'

test('DiscordProviderCommand lists current and available providers', async () => {
  const command = new DiscordProviderCommand({
    getCurrentProviderName: () => 'Provider One',
    listAvailableProviders: async () => [
      { id: 'provider-1', name: 'Provider One', current: true },
      { id: 'provider-2', name: 'Provider Two', current: false },
    ],
    switchProviderByIndex: async () => 'Provider Two',
  })

  assert.deepEqual(await command.buildListReply(), [
    '当前提供商：`Provider One`\n可切换提供商列表：\n1. `Provider One` (当前)\n2. `Provider Two`\n使用 `/provider <编号>` 切换默认提供商。',
  ])
})

test('DiscordProviderCommand switches by index', async () => {
  const command = new DiscordProviderCommand({
    getCurrentProviderName: () => 'Provider One',
    listAvailableProviders: async () => [
      { id: 'provider-1', name: 'Provider One', current: true },
      { id: 'provider-2', name: 'Provider Two', current: false },
    ],
    switchProviderByIndex: async (index) => ({
      name: index === 2 ? 'Provider Two' : 'Provider One',
      changed: index === 2,
    }),
  })

  assert.equal(
    await command.switchByIndexReply(2),
    '已将默认提供商永久切换为第 2 个：`Provider Two`。后续请求会使用该提供商的默认模型。',
  )
})

test('DiscordProviderCommand keeps same-provider confirmation accurate', async () => {
  const command = new DiscordProviderCommand({
    getCurrentProviderName: () => 'Provider One',
    listAvailableProviders: async () => [
      { id: 'provider-1', name: 'Provider One', current: true },
      { id: 'provider-2', name: 'Provider Two', current: false },
    ],
    switchProviderByIndex: async () => ({ name: 'Provider One', changed: false }),
  })

  assert.equal(
    await command.switchByIndexReply(1),
    '当前默认提供商仍为第 1 个：`Provider One`。当前模型保持不变。',
  )
})

test('DiscordProviderCommand chunks long provider lists', async () => {
  const command = new DiscordProviderCommand({
    getCurrentProviderName: () => 'Provider 1',
    listAvailableProviders: async () => Array.from({ length: 80 }, (_, index) => ({
      id: `provider-${index + 1}`,
      name: `Provider ${index + 1} ${'x'.repeat(30)}`,
      current: index === 0,
    })),
    switchProviderByIndex: async () => ({ name: 'Provider 2', changed: true }),
  })

  const replies = await command.buildListReply()

  assert.equal(replies.length > 1, true)
  assert.equal(replies.every(reply => reply.length <= 1900), true)
})

test('DiscordProviderCommand marks only the current duplicate-name provider', async () => {
  const command = new DiscordProviderCommand({
    getCurrentProviderName: () => 'Provider One',
    listAvailableProviders: async () => [
      { id: 'provider-1', name: 'Provider One', current: true },
      { id: 'provider-2', name: 'Provider One', current: false },
    ],
    switchProviderByIndex: async () => ({ name: 'Provider One', changed: true }),
  })

  assert.deepEqual(await command.buildListReply(), [
    '当前提供商：`Provider One`\n可切换提供商列表：\n1. `Provider One` (当前)\n2. `Provider One`\n使用 `/provider <编号>` 切换默认提供商。',
  ])
})
