import { MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction, Client } from 'discord.js'
import { DiscordModelCommand, MODEL_COMMAND } from './model-command.js'
import { DiscordProviderCommand, PROVIDER_COMMAND } from './provider-command.js'

const COMMAND_REGISTRATION_COOLDOWN_MS = 5 * 60 * 1000

const recentCommandRegistrations = new Map<string, number>()
const pendingCommandRegistrations = new Map<string, Promise<void>>()

export const NEW_TOPIC_COMMAND = {
  name: 'new',
  description: '开启新话题',
}

export const STOP_COMMAND = {
  name: 'stop',
  description: '停止当前请求',
}

export const MANUAL_BROWSER_COMMAND = {
  name: 'browser',
  description: '手动拉起浏览器和 VNC',
}

export const DELETE_TOPIC_COMMAND = {
  name: 'del',
  description: '删除当前会话和子区',
}

type RegisterDiscordCommandsOptions = {
  application: NonNullable<Client['application']>
  client: Client
  guildId: string | null
}

type DetachedThreadTopic = {
  thread: { id: string }
  topic: { name: string }
}

type HandleSlashCommandOptions = {
  createDetachedThreadTopic: (channelId: string, guildId: string | null, username: string) => Promise<DetachedThreadTopic>
  deleteCurrentThreadTopic: () => Promise<string>
  instanceName: string
  interaction: ChatInputCommandInteraction
  modelCommand: DiscordModelCommand
  providerCommand: DiscordProviderCommand
  startManualBrowser: () => Promise<string>
  stopCurrentScope: (channelId: string, guildId: string | null) => string
}

export async function registerDiscordCommands({ application, client, guildId }: RegisterDiscordCommandsOptions): Promise<void> {
  const scopeKey = guildId
    ? `guild:${application.id}:${guildId}`
    : `global:${application.id}`
  const now = Date.now()
  const lastRegisteredAt = recentCommandRegistrations.get(scopeKey) ?? 0
  if (now - lastRegisteredAt < COMMAND_REGISTRATION_COOLDOWN_MS) {
    return
  }

  const pending = pendingCommandRegistrations.get(scopeKey)
  if (pending) {
    await pending
    return
  }

  const registration = syncCommands({ application, client, guildId, scopeKey })
  pendingCommandRegistrations.set(scopeKey, registration)

  try {
    await registration
  }
  finally {
    if (pendingCommandRegistrations.get(scopeKey) === registration) {
      pendingCommandRegistrations.delete(scopeKey)
    }
  }
}

export async function handleDiscordSlashCommand({
  createDetachedThreadTopic,
  deleteCurrentThreadTopic,
  instanceName,
  interaction,
  modelCommand,
  providerCommand,
  startManualBrowser,
  stopCurrentScope,
}: HandleSlashCommandOptions): Promise<boolean> {
  try {
    if (interaction.commandName === STOP_COMMAND.name) {
      await interaction.reply({
        content: stopCurrentScope(interaction.channelId, interaction.guildId),
        flags: MessageFlags.Ephemeral,
      })
      return true
    }

    if (interaction.commandName === MANUAL_BROWSER_COMMAND.name) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      await interaction.editReply(await startManualBrowser())
      return true
    }

    if (interaction.commandName === MODEL_COMMAND.name) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const index = interaction.options.getInteger('index') ?? undefined
      const replies = typeof index === 'number'
        ? [await modelCommand.switchByIndexReply(index)]
        : await modelCommand.buildListReply()
      await interaction.editReply(replies[0] ?? '未获取到模型列表。')
      for (const reply of replies.slice(1)) {
        await interaction.followUp({ content: reply, flags: MessageFlags.Ephemeral })
      }
      return true
    }

    if (interaction.commandName === PROVIDER_COMMAND.name) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const index = interaction.options.getInteger('index') ?? undefined
      const replies = typeof index === 'number'
        ? [await providerCommand.switchByIndexReply(index)]
        : await providerCommand.buildListReply()
      await interaction.editReply(replies[0] ?? '未获取到提供商列表。')
      for (const reply of replies.slice(1)) {
        await interaction.followUp({ content: reply, flags: MessageFlags.Ephemeral })
      }
      return true
    }

    if (interaction.commandName === DELETE_TOPIC_COMMAND.name) {
      await interaction.reply({
        content: await deleteCurrentThreadTopic(),
        flags: MessageFlags.Ephemeral,
      })
      return true
    }

    if (interaction.commandName !== NEW_TOPIC_COMMAND.name) {
      return false
    }

    const { topic, thread } = await createDetachedThreadTopic(
      interaction.channelId,
      interaction.guildId,
      interaction.user.username,
    )

    await interaction.reply({
      content: `已开启新话题：${topic.name}\n子区：<#${thread.id}>`,
      flags: MessageFlags.Ephemeral,
    })
    return true
  }
  catch (error) {
    console.error(`[Discord] Command error in "${instanceName}":`, error)

    const errorMessage = interaction.commandName === MANUAL_BROWSER_COMMAND.name
      ? '拉起手动浏览器失败，请稍后重试。'
      : interaction.commandName === MODEL_COMMAND.name
          ? (error instanceof Error ? error.message : '获取或切换模型失败，请稍后重试。')
          : interaction.commandName === PROVIDER_COMMAND.name
              ? (error instanceof Error ? error.message : '获取或切换提供商失败，请稍后重试。')
              : interaction.commandName === DELETE_TOPIC_COMMAND.name
                  ? (error instanceof Error ? error.message : '删除当前会话失败，请稍后重试。')
          : '开启新话题失败，请稍后重试。'

    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply(errorMessage).catch(() => {})
      return true
    }

    if (interaction.replied) {
      await interaction.followUp({
        content: errorMessage,
        flags: MessageFlags.Ephemeral,
      }).catch(() => {})
      return true
    }

    await interaction.reply({
      content: errorMessage,
      flags: MessageFlags.Ephemeral,
    }).catch(() => {})
    return true
  }
}

async function syncCommands({
  application,
  client,
  guildId,
  scopeKey,
}: RegisterDiscordCommandsOptions & { scopeKey: string }): Promise<void> {
  const definitions = [NEW_TOPIC_COMMAND, STOP_COMMAND, MANUAL_BROWSER_COMMAND, MODEL_COMMAND, PROVIDER_COMMAND, DELETE_TOPIC_COMMAND]

  if (guildId) {
    const guild = await client.guilds.fetch(guildId)
    const existing = await guild.commands.fetch()

    for (const definition of definitions) {
      const command = existing.find(item => item.name === definition.name)
      if (command) {
        await command.edit(definition)
      }
      else {
        await guild.commands.create(definition)
      }
    }

    recentCommandRegistrations.set(scopeKey, Date.now())
    console.log(`[Discord] Registered /${NEW_TOPIC_COMMAND.name}, /${STOP_COMMAND.name}, /${MANUAL_BROWSER_COMMAND.name}, /${MODEL_COMMAND.name}, /${PROVIDER_COMMAND.name}, and /${DELETE_TOPIC_COMMAND.name} for guild ${guild.id}`)
    return
  }

  const existing = await application.commands.fetch()

  for (const definition of definitions) {
    const command = existing.find(item => item.name === definition.name)
    if (command) {
      await command.edit(definition)
    }
    else {
      await application.commands.create(definition)
    }
  }

  recentCommandRegistrations.set(scopeKey, Date.now())
  console.log(`[Discord] Registered global /${NEW_TOPIC_COMMAND.name}, /${STOP_COMMAND.name}, /${MANUAL_BROWSER_COMMAND.name}, /${MODEL_COMMAND.name}, /${PROVIDER_COMMAND.name}, and /${DELETE_TOPIC_COMMAND.name}`)
}
