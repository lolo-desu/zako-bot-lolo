import assert from 'node:assert/strict'
import test from 'node:test'
import { DiscordModelCommand } from '../../src/bot/model-command.js'

function createCommand() {
  return new DiscordModelCommand({
    getCurrentModel: () => 'gpt-4o',
    getCurrentProviderName: () => 'Provider One',
    listAvailableModels: async () => ['gpt-4o', 'gpt-4.1'],
    setModel: async (modelId: string) => modelId,
  })
}

test('DiscordModelCommand buildListReply shows the current provider when available', async () => {
  const command = createCommand()

  const lines = await command.buildListReply()

  assert.deepEqual(lines, [
    '当前模型：`gpt-4o`\n当前提供商：`Provider One`\n可用模型列表：\n1. `gpt-4o` (当前)\n2. `gpt-4.1`\n使用 `/model <编号>` 切换默认模型。',
  ])
})

test('DiscordModelCommand switchByIndexReply keeps provider-scoped confirmation clear', async () => {
  const command = createCommand()

  const reply = await command.switchByIndexReply(2)

  assert.equal(reply, '已将提供商 `Provider One` 的默认模型永久切换为第 2 个：`gpt-4.1`。后续请求会使用该模型。')
})

test('DiscordModelCommand keeps the legacy /model reply format when no provider name is bound', async () => {
  const command = new DiscordModelCommand({
    getCurrentModel: () => 'gpt-4o-mini',
    listAvailableModels: async () => ['gpt-4o-mini', 'gpt-4.1-mini'],
    setModel: async (modelId: string) => modelId,
  })

  const lines = await command.buildListReply()
  const switchReply = await command.switchByIndexReply(2)

  assert.deepEqual(lines, [
    '当前模型：`gpt-4o-mini`\n可用模型列表：\n1. `gpt-4o-mini` (当前)\n2. `gpt-4.1-mini`\n使用 `/model <编号>` 切换默认模型。',
  ])
  assert.equal(switchReply, '已将默认模型永久切换为第 2 个：`gpt-4.1-mini`。后续请求会使用该模型。')
})
