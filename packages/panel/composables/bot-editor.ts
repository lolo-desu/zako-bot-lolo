import { createDefaultBotEditorInput, normalizeBotEditorInput } from '@zakobot/shared'
import type { BotEditorInput, BotProfile, RoleProfile } from '@zakobot/shared'

export type BotSelectOption = {
  label: string
  value: string
}

export function createEmptyBotEditorInput(): BotEditorInput {
  return createDefaultBotEditorInput()
}

export function buildBotEditorInput(bot: BotProfile | null | undefined): BotEditorInput {
  if (!bot) {
    return normalizeBotEditorInput({}, { enabledDefault: true })
  }

  return normalizeBotEditorInput({
    name: bot.name,
    platform: bot.platform,
    token: bot.token,
    roleId: bot.roleId,
    llmProvider: bot.llmProvider,
    llmProviderId: bot.llmProviderId,
    llmPlatformName: bot.llmPlatformName,
    llmModel: bot.llmModel,
    llmApiKey: bot.llmApiKey,
    llmBaseUrl: bot.llmBaseUrl,
    discordUserId: bot.discordUserId,
    discordChannelId: bot.discordChannelId,
    discordGuildId: bot.discordGuildId,
    enabled: bot.enabled,
  }, { enabledDefault: true })
}

export function buildBotRoleOptions(roles: RoleProfile[]): BotSelectOption[] {
  return roles.map(role => ({
    label: role.name,
    value: role.id,
  }))
}
