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
  return normalizeBotEditorInput(bot ?? {}, { enabledDefault: true })
}

export function buildBotRoleOptions(roles: RoleProfile[]): BotSelectOption[] {
  return roles.map(role => ({
    label: role.name,
    value: role.id,
  }))
}
