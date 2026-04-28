import type { LlmProviderEditorInput, LlmProviderProfile } from '@zakobot/shared'

export default defineEventHandler(async (event) => {
  const body = await readBody<LlmProviderEditorInput>(event)

  try {
    const provider = await corePost<LlmProviderProfile>('/llm-providers', body)
    return { ok: true, data: provider }
  }
  catch (error) {
    throw toPanelApiError(error, 'Failed to create LLM provider')
  }
})
