import type { LlmProviderProfile } from '@zakobot/shared'

export default defineEventHandler(async () => {
  try {
    const providers = await coreGet<LlmProviderProfile[]>('/llm-providers')
    return { ok: true, data: providers }
  }
  catch (error) {
    throw toPanelApiError(error, 'Failed to load LLM providers')
  }
})
