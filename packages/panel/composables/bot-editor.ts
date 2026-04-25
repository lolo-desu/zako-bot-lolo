import type { BotEditorInput, BotProfile, RoleProfile } from '@zakobot/shared'

export type BotSelectOption = {
  label: string
  value: string
}

export function createEmptyBotEditorInput(): BotEditorInput {
  return {
    name: '',
    platform: 'discord',
    token: '',
    roleId: '',
    llmProvider: 'openai',
    llmPlatformName: '',
    llmModel: '',
    llmApiKey: '',
    llmBaseUrl: '',
    discordUserId: '',
    discordChannelId: '',
    discordGuildId: '',
    enabled: true,
  }
}

export function buildBotEditorInput(bot: BotProfile | null | undefined): BotEditorInput {
  return {
    ...createEmptyBotEditorInput(),
    name: bot?.name ?? '',
    platform: bot?.platform ?? 'discord',
    token: bot?.token ?? '',
    roleId: bot?.roleId ?? '',
    llmProvider: bot?.llmProvider ?? 'openai',
    llmPlatformName: bot?.llmPlatformName ?? '',
    llmModel: bot?.llmModel ?? '',
    llmApiKey: bot?.llmApiKey ?? '',
    llmBaseUrl: bot?.llmBaseUrl ?? '',
    discordUserId: bot?.discordUserId ?? '',
    discordChannelId: bot?.discordChannelId ?? '',
    discordGuildId: bot?.discordGuildId ?? '',
    enabled: bot?.enabled ?? true,
  }
}

export function buildBotRoleOptions(roles: RoleProfile[]): BotSelectOption[] {
  return roles.map(role => ({
    label: role.name,
    value: role.id,
  }))
}
