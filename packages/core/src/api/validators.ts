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
import {
  getBotEditorInputError,
  getRoleEditorInputError,
  normalizeBotEditorInput,
  normalizeEnabledToolNames,
  normalizeRoleEditorInput,
} from '@zakobot/shared'
import { normalizeBrowseSettings } from '../settings/browse-settings.js'
import { normalizeGeneralSettings } from '../settings/general-settings.js'
import { normalizeLocalMemorySettings } from '../settings/local-memory-settings.js'
import { normalizeSearchSettings } from '../settings/search-settings.js'

export function parseRoleInput(body: Partial<RoleEditorInput>) {
  const normalized = normalizeRoleEditorInput(body)
  const error = getRoleEditorInputError(normalized)
  if (error) {
    throw new Error(error)
  }

  return normalized
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
    requiredTools: normalizeEnabledToolNames(body.requiredTools),
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
  const normalized = normalizeBotEditorInput(body, { enabledDefault: false })
  const error = getBotEditorInputError(normalized)
  if (error) {
    throw new Error(error)
  }

  return normalized
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
