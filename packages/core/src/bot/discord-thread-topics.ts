import type { Message, TextBasedChannel, Client } from 'discord.js'
import type { ConversationScope } from '../llm/conversation-service.js'

type SendPayload = { content: string }

export type SendableChannel = TextBasedChannel & {
  id: string
  send: (payload: SendPayload) => Promise<Message>
}

type StartNewTopic<TTopic> = (scope: ConversationScope) => TTopic

type CreateThreadTopicDeps<TTopic> = {
  platform: ConversationScope['platform']
  pruneThreadsIfNeeded: (channel: Message['channel'] | SendableChannel) => Promise<void>
  startNewTopic: StartNewTopic<TTopic>
}

type CreateDetachedThreadTopicDeps<TTopic> = CreateThreadTopicDeps<TTopic> & {
  client: Client
}

export async function createThreadTopicFromMessage<TTopic>(
  deps: CreateThreadTopicDeps<TTopic>,
  msg: Message,
  userText: string,
): Promise<{ thread: Awaited<ReturnType<Message['startThread']>>, topic: TTopic, scope: ConversationScope }> {
  const thread = await msg.startThread({ name: buildThreadName(userText) })
  await deps.pruneThreadsIfNeeded(msg.channel)
  const scope = buildThreadScope(deps.platform, thread.id, msg.channelId, msg.guildId, msg.id)
  const topic = deps.startNewTopic(scope)
  return { thread, topic, scope }
}

export async function createDetachedThreadTopic<TTopic>(
  deps: CreateDetachedThreadTopicDeps<TTopic>,
  channelId: string,
  guildId: string | null,
  requesterName: string,
): Promise<{ thread: Awaited<ReturnType<Message['startThread']>>, topic: TTopic, scope: ConversationScope }> {
  const parentChannel = await resolveParentChannel(deps.client, channelId)
  const starter = await parentChannel.send({
    content: `为 ${requesterName} 开启了一个新话题。`,
  })
  const thread = await starter.startThread({ name: buildThreadName(requesterName) })
  await deps.pruneThreadsIfNeeded(parentChannel)
  const scope = buildThreadScope(deps.platform, thread.id, parentChannel.id, guildId, starter.id)
  const topic = deps.startNewTopic(scope)
  return { thread, topic, scope }
}

export function buildThreadScope(
  platform: ConversationScope['platform'],
  threadId: string,
  parentChannelId: string,
  guildId: string | null,
  starterMessageId: string,
): ConversationScope {
  return {
    platform,
    scopeKey: `discord:${threadId}`,
    sourceType: 'discord_thread',
    sourceId: threadId,
    metadata: {
      threadId,
      parentChannelId,
      guildId: guildId ?? '',
      starterMessageId,
    },
  }
}

export function buildChannelScope(
  platform: ConversationScope['platform'],
  channelId: string,
  guildId: string | null,
): ConversationScope {
  return {
    platform,
    scopeKey: `discord:${channelId}`,
    sourceType: 'discord_channel',
    sourceId: channelId,
    metadata: {
      channelId,
      guildId: guildId ?? '',
    },
  }
}

export async function resolveParentChannel(client: Client, channelId: string): Promise<SendableChannel> {
  const channel = await client.channels.fetch(channelId)
  if (!channel?.isTextBased() || !('send' in channel)) {
    throw new Error(`Channel ${channelId} is not a sendable text channel`)
  }

  const parent = channel.isThread() ? channel.parent : channel
  if (!parent?.isTextBased() || !('send' in parent)) {
    throw new Error(`Channel ${channelId} has no sendable parent channel`)
  }

  return parent as SendableChannel
}

export async function pruneThreadsIfNeeded(
  channel: Message['channel'] | SendableChannel,
  maxThreadsPerChannel: number,
  pruneOldThreads: (channel: Message['channel'], maxCount: number) => Promise<void>,
): Promise<void> {
  if (maxThreadsPerChannel > 0) {
    await pruneOldThreads(channel as Message['channel'], maxThreadsPerChannel)
  }
}

export function buildThreadName(seed: string): string {
  const normalized = (seed.replace(/<a?:\w+:\d+>/g, '').trim() || seed).slice(0, 100)
  if (normalized) {
    return normalized
  }

  return `新话题-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`
}

export function isUnknownDiscordThreadError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && Number(error.code) === 10003
}
