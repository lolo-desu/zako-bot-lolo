import type { LlmProviderProfile } from '@zakobot/shared'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'LLM provider id is required',
    })
  }

  try {
    const provider = await coreDelete<LlmProviderProfile>(`/llm-providers/${id}`)
    return { ok: true, data: provider }
  }
  catch (error) {
    throw toPanelApiError(error, 'Failed to delete LLM provider')
  }
})
