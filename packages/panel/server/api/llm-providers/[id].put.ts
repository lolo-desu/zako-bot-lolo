import type { LlmProviderEditorInput, LlmProviderProfile } from '@zakobot/shared'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'LLM provider id is required',
    })
  }

  const body = await readBody<LlmProviderEditorInput>(event)

  try {
    const provider = await corePut<LlmProviderProfile>(`/llm-providers/${id}`, body)
    return { ok: true, data: provider }
  }
  catch (error) {
    throw toPanelApiError(error, 'Failed to update LLM provider')
  }
})
