import type { LlmProviderRow } from '@zakobot/database'
import type { LLMConfig } from '@zakobot/shared'

export function toProviderLlmConfig(provider: LlmProviderRow, model: string): LLMConfig {
  const selectedModel = model.trim()
  if (!selectedModel) {
    throw new Error('Model is required')
  }

  return {
    provider: 'openai',
    model: selectedModel,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl || undefined,
  }
}
