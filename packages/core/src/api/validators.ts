import type { McpServerRow } from '@zakobot/database'
import type {
  BotEditorInput,
  BrowseSettings,
  CreateConversationTopicInput,
  GeneralSettings,
  LocalMemorySettings,
  McpServerEditorInput,
  RoleEditorInput,
  SearchSettings,
  SendConversationMessageInput,
  SkillEditorInput,
  SkillImportInput,
} from '@zakobot/shared'
import { normalizeBrowseSettings } from '../settings/browse-settings.js'
import { normalizeGeneralSettings } from '../settings/general-settings.js'
import { normalizeLocalMemorySettings } from '../settings/local-memory-settings.js'
import { normalizeSearchSettings } from '../settings/search-settings.js'

export function parseRoleInput(body: Partial<RoleEditorInput>) {
  const name = body.name?.trim()
  const systemPrompt = body.systemPrompt?.trim()

  if (!name) {
    throw new Error('Role name is required')
  }

  if (!systemPrompt) {
    throw new Error('Role systemPrompt is required')
  }

  return {
    avatar: body.avatar?.trim() ?? '',
    name,
    systemPrompt,
    enabledTools: normalizeEnabledTools(body.enabledTools),
    enabledSkills: normalizeEnabledSkills(body.enabledSkills),
  }
}

export function parseSkillInput(body: Partial<SkillEditorInput>): SkillEditorInput {
  const content = body.content?.trim()
  const name = body.name?.trim() ?? ''
  const description = body.description?.trim() ?? ''

  if (!content) {
    throw new Error('Skill content is required')
  }

  return {
    name,
    description,
    content,
    enabled: body.enabled === false ? false : true,
    requiredTools: normalizeEnabledTools(body.requiredTools),
  }
}

export function parseSkillImportInput(body: Partial<SkillImportInput>): SkillImportInput {
  const fileName = body.fileName?.trim()
  const contentBase64 = body.contentBase64?.trim()
  const sourceType = body.sourceType === 'md' || body.sourceType === 'zip' ? body.sourceType : undefined

  if (!fileName) {
    throw new Error('Skill file name is required')
  }

  if (!contentBase64) {
    throw new Error('Skill file content is required')
  }

  return { fileName, contentBase64, sourceType }
}

export function parseBotInput(body: Partial<BotEditorInput>) {
  const name = body.name?.trim()
  const token = body.token?.trim()
  const roleId = body.roleId?.trim()
  const llmPlatformName = body.llmPlatformName?.trim()
  const llmModel = body.llmModel?.trim()
  const llmApiKey = body.llmApiKey?.trim()
  const llmBaseUrl = body.llmBaseUrl?.trim()
  const discordUserId = body.discordUserId?.trim()
  const discordChannelId = body.discordChannelId?.trim()
  const discordGuildId = body.discordGuildId?.trim()
  const platform = body.platform?.trim()

  if (!name) throw new Error('Bot name is required')
  if (!platform) throw new Error('Bot platform is required')
  if (platform !== 'discord') throw new Error('Only Discord bots are currently supported')
  if (!token) throw new Error('Bot token is required')
  if (!roleId) throw new Error('Role is required')
  if (!llmPlatformName) throw new Error('Model platform is required')
  if (!llmModel) throw new Error('Model is required')
  if (!llmApiKey) throw new Error('Model API key is required')
  if (!llmBaseUrl) throw new Error('Model base URL is required')
  if (!discordGuildId) throw new Error('Discord guild ID is required')

  return {
    name,
    platform: 'discord' as const,
    token,
    roleId,
    llmProvider: 'openai' as const,
    llmPlatformName,
    llmModel,
    llmApiKey,
    llmBaseUrl,
    discordUserId,
    discordChannelId,
    discordGuildId,
    enabled: Boolean(body.enabled),
  }
}

export function parseCreateConversationTopicInput(body: Partial<CreateConversationTopicInput>) {
  const botInstanceId = body.botInstanceId?.trim()

  if (!botInstanceId) {
    throw new Error('Bot instance ID is required')
  }

  return { botInstanceId }
}

export function parseSendConversationMessageInput(body: Partial<SendConversationMessageInput>) {
  const botInstanceId = body.botInstanceId?.trim()
  const topicId = body.topicId?.trim()
  const content = body.content?.trim()

  if (!botInstanceId) {
    throw new Error('Bot instance ID is required')
  }

  if (!content) {
    throw new Error('Message content is required')
  }

  return {
    botInstanceId,
    topicId: topicId || undefined,
    content,
  }
}

export function parseMcpServerInput(body: Partial<McpServerEditorInput>): Omit<McpServerRow, 'id' | 'createdAt' | 'updatedAt'> {
  const name = body.name?.trim()
  const description = body.description?.trim() ?? ''
  const transport = body.transport
  const command = body.command?.trim() ?? ''
  const args = Array.isArray(body.args) ? body.args.filter((item): item is string => typeof item === 'string') : []
  const env = normalizeStringRecord(body.env)
  const url = body.url?.trim() ?? ''

  if (!name) {
    throw new Error('MCP server name is required')
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error('MCP server name can only contain letters, numbers, underscores and hyphens')
  }

  if (transport !== 'stdio' && transport !== 'sse') {
    throw new Error('MCP transport must be stdio or sse')
  }

  if (transport === 'stdio' && !command) {
    throw new Error('MCP stdio command is required')
  }

  if (transport === 'sse') {
    if (!url) {
      throw new Error('MCP SSE URL is required')
    }

    try {
      new URL(url)
    }
    catch {
      throw new Error('MCP SSE URL is invalid')
    }
  }

  return {
    name,
    description,
    transport,
    command,
    args: JSON.stringify(args),
    env: JSON.stringify(env),
    url,
    enabled: body.enabled === false ? false : true,
  }
}

export function parseGeneralSettingsInput(body: Partial<GeneralSettings>): GeneralSettings {
  return normalizeGeneralSettings(body as Record<string, unknown>)
}

export function parseSearchSettingsInput(body: Partial<SearchSettings>): SearchSettings {
  return normalizeSearchSettings(body as Partial<SearchSettings> & Record<string, unknown>)
}

export function parseBrowseSettingsInput(body: Partial<BrowseSettings>): BrowseSettings {
  return normalizeBrowseSettings(body as Record<string, unknown>)
}

export function parseLocalMemorySettingsInput(body: Partial<LocalMemorySettings>): LocalMemorySettings {
  return normalizeLocalMemorySettings(body as Record<string, unknown>)
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

function normalizeEnabledTools(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const builtinTools = new Set<string>(['web_search', 'web_browse', 'shell_exec', 'file_read', 'file_write', 'file_edit', 'file_list'])
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
