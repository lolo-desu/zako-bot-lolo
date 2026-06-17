import type { LlmProviderRow, McpServerRow, RoleRow, getBotWithRole } from '@zakobot/database'
import type {
  BotListItem,
  BotProfile,
  ConversationMessage,
  ConversationTopic,
  LlmProviderProfile,
  McpServerProfile,
  McpTransport,
  RoleProfile,
} from '@zakobot/shared'
import type { BotManager } from '../bot/bot-manager.js'

type BotWithRole = NonNullable<ReturnType<typeof getBotWithRole>>
type ConversationTopicRow = ReturnType<BotManager['listConversationTopics']>[number]
type ConversationMessageRow = ReturnType<BotManager['listConversationMessages']>[number]

export function toRoleProfile(row: RoleRow): RoleProfile {
  return {
    id: row.id,
    avatar: row.avatar,
    name: row.name,
    systemPrompt: row.systemPrompt,
    enabledTools: parseEnabledTools(row.enabledTools),
    enabledSkills: parseEnabledSkills(row.enabledSkills),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toBotProfile(row: BotWithRole): BotProfile {
  return {
    id: row.instance.id,
    name: row.instance.name,
    platform: row.instance.platform,
    token: row.instance.token,
    roleId: row.instance.roleId,
    roleName: row.role.name,
    roleAvatar: row.role.avatar,
    llmProvider: row.instance.llmProvider as BotProfile['llmProvider'],
    llmProviderId: row.instance.llmProviderId ?? '',
    llmPlatformName: row.instance.llmPlatformName,
    llmModel: row.instance.llmModel,
    llmApiKey: row.instance.llmApiKey,
    llmBaseUrl: row.instance.llmBaseUrl,
    discordUserId: row.instance.discordUserId,
    discordChannelId: row.instance.discordChannelId,
    discordGuildId: row.instance.discordGuildId,
    enabled: row.instance.enabled,
    createdAt: row.instance.createdAt.toISOString(),
    updatedAt: row.instance.updatedAt.toISOString(),
  }
}

export function toBotListItem(row: BotWithRole): BotListItem {
  return {
    id: row.instance.id,
    name: row.instance.name,
    platform: row.instance.platform,
    roleId: row.instance.roleId,
    roleName: row.role.name,
    roleAvatar: row.role.avatar,
    llmPlatformName: row.instance.llmPlatformName,
    llmModel: row.instance.llmModel,
    discordUserId: row.instance.discordUserId,
    discordChannelId: row.instance.discordChannelId,
    discordGuildId: row.instance.discordGuildId,
    enabled: row.instance.enabled,
    createdAt: row.instance.createdAt.toISOString(),
    updatedAt: row.instance.updatedAt.toISOString(),
  }
}

export function toConversationTopic(row: ConversationTopicRow): ConversationTopic {
  return {
    id: row.id,
    botInstanceId: row.botInstanceId,
    platform: row.platform,
    scopeKey: row.scopeKey,
    name: row.name,
    status: row.status,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    metadata: parseJsonRecord(row.metadata),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toConversationMessage(row: ConversationMessageRow): ConversationMessage {
  return {
    id: row.id,
    topicId: row.topicId,
    botInstanceId: row.botInstanceId,
    platform: row.platform,
    role: row.role as 'user' | 'assistant',
    content: row.content,
    messageType: row.messageType,
    platformMessageId: row.platformMessageId,
    senderId: row.senderId,
    senderName: row.senderName,
    metadata: parseJsonRecord(row.metadata),
    createdAt: row.createdAt.toISOString(),
  }
}

export function toMcpServerProfile(row: McpServerRow): McpServerProfile {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    transport: row.transport as McpTransport,
    command: row.command,
    args: parseJsonStringArray(row.args),
    env: parseJsonStringRecord(row.env),
    url: row.url,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toLlmProviderProfile(row: LlmProviderRow): LlmProviderProfile {
  return {
    id: row.id,
    name: row.name,
    format: row.format,
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
    enabledModels: parseJsonStringArray(row.enabledModels),
    disabledModels: parseJsonStringArray(row.disabledModels),
    region: row.region,
    enabled: row.enabled,
    builtin: row.builtin,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function parseJsonRecord(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : {}
  }
  catch {
    return {}
  }
}

function parseJsonStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  }
  catch {
    return []
  }
}

function parseJsonStringRecord(value: string): Record<string, string> {
  try {
    return normalizeStringRecord(JSON.parse(value) as unknown)
  }
  catch {
    return {}
  }
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

function parseEnabledTools(value: string): string[] {
  try {
    return normalizeEnabledTools(JSON.parse(value) as unknown)
  }
  catch {
    return []
  }
}

function normalizeEnabledTools(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const builtinTools = new Set<string>(['web_search', 'web_browse', 'shell_exec', 'file_read', 'file_write', 'file_edit', 'file_list', 'render_markdown_table_image', 'netdisk_upload'])
  const result: string[] = []
  const seen = new Set<string>()

  for (const tool of value) {
    if (typeof tool !== 'string' || seen.has(tool)) {
      continue
    }

    seen.add(tool)

    if (builtinTools.has(tool) || /^mcp__[a-zA-Z0-9_-]+__.+$/.test(tool)) {
      result.push(tool)
    }
  }

  return result
}

function parseEnabledSkills(value: string): string[] {
  try {
    return normalizeEnabledSkills(JSON.parse(value) as unknown)
  }
  catch {
    return []
  }
}

function normalizeEnabledSkills(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const result: string[] = []
  const seen = new Set<string>()

  for (const skillId of value) {
    if (typeof skillId !== 'string') {
      continue
    }

    const normalized = skillId.trim()
    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    result.push(normalized)
  }

  return result
}
