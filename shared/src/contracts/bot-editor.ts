import type { BotEditorInput } from '../types/bot-instance.js'

export function createDefaultBotEditorInput(): BotEditorInput {
  return {
    name: '',
    platform: 'discord',
    token: '',
    roleId: '',
    llmProvider: 'openai',
    llmProviderId: '',
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

export function normalizeBotEditorInput(body: Partial<BotEditorInput>, options: { enabledDefault?: boolean } = {}): BotEditorInput {
  return {
    ...createDefaultBotEditorInput(),
    name: body.name?.trim() ?? '',
    platform: 'discord',
    token: body.token?.trim() ?? '',
    roleId: body.roleId?.trim() ?? '',
    llmProvider: 'openai',
    llmProviderId: body.llmProviderId?.trim() ?? '',
    llmPlatformName: body.llmPlatformName?.trim() ?? '',
    llmModel: body.llmModel?.trim() ?? '',
    llmApiKey: body.llmApiKey?.trim() ?? '',
    llmBaseUrl: body.llmBaseUrl?.trim() ?? '',
    discordUserId: body.discordUserId?.trim() ?? '',
    discordChannelId: body.discordChannelId?.trim() ?? '',
    discordGuildId: body.discordGuildId?.trim() ?? '',
    enabled: typeof body.enabled === 'boolean' ? body.enabled : options.enabledDefault ?? true,
  }
}

export function getBotEditorInputError(input: BotEditorInput, options: { allowLegacyLlmConfig?: boolean } = {}): string | null {
  if (!input.name) return 'Bot name is required'
  if (!input.platform) return 'Bot platform is required'
  if (input.platform !== 'discord') return 'Only Discord bots are currently supported'
  if (!input.token) return 'Bot token is required'
  if (!input.roleId) return 'Role is required'

  if (!input.llmProviderId && !hasLegacyLlmConfig(input, options)) {
    return 'LLM provider is required'
  }

  if (!input.llmModel) return 'Model is required'

  if (!input.discordGuildId) return 'Discord guild ID is required'
  return null
}

function hasLegacyLlmConfig(input: BotEditorInput, options: { allowLegacyLlmConfig?: boolean }) {
  return options.allowLegacyLlmConfig === true
    && Boolean(input.llmPlatformName && input.llmApiKey && input.llmBaseUrl)
}
