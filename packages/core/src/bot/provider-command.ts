import { ApplicationCommandOptionType } from 'discord.js'

const MAX_DISCORD_MESSAGE_CHARS = 1900

type ProviderListItem = {
  id: string
  name: string
  current: boolean
}

type ProviderSwitchResult = {
  name: string
  changed: boolean
}

export const PROVIDER_COMMAND = {
  name: 'provider',
  description: '查看或切换当前提供商',
  options: [
    {
      name: 'index',
      description: '提供商编号；留空则列出可切换提供商',
      type: ApplicationCommandOptionType.Integer,
      required: false,
    },
  ],
} as const

type ProviderCommandDeps = {
  getCurrentProviderName: () => string
  listAvailableProviders: () => Promise<ProviderListItem[]>
  switchProviderByIndex: (index: number) => Promise<ProviderSwitchResult>
}

export class DiscordProviderCommand {
  constructor(private deps: ProviderCommandDeps) {}

  async buildListReply() {
    const current = this.deps.getCurrentProviderName()
    const providers = await this.deps.listAvailableProviders()

    const lines = providers.length > 0
      ? providers.map((provider, index) => `${index + 1}. \`${provider.name}\`${provider.current ? ' (当前)' : ''}`)
      : ['- 未找到可切换的提供商']

    return this.chunkReplyLines([
      `当前提供商：\`${current}\``,
      '可切换提供商列表：',
      ...lines,
      '使用 `/provider <编号>` 切换默认提供商。',
    ])
  }

  async switchByIndexReply(index: number) {
    const next = await this.deps.switchProviderByIndex(index)
    if (!next.changed) {
      return `当前默认提供商仍为第 ${index} 个：\`${next.name}\`。当前模型保持不变。`
    }

    return `已将默认提供商永久切换为第 ${index} 个：\`${next.name}\`。后续请求会使用该提供商的默认模型。`
  }

  private chunkReplyLines(lines: string[]) {
    const chunks: string[] = []
    let current = ''

    for (const line of lines) {
      const next = current ? `${current}\n${line}` : line
      if (next.length > MAX_DISCORD_MESSAGE_CHARS && current) {
        chunks.push(current)
        current = line
        continue
      }
      current = next.slice(0, MAX_DISCORD_MESSAGE_CHARS)
    }

    if (current) {
      chunks.push(current)
    }

    return chunks.length > 0 ? chunks : ['（空）']
  }
}
