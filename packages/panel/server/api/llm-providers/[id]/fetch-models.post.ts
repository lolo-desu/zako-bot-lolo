import type { LlmProviderProfile } from '@zakobot/shared'

type FetchModelsResponse = {
  models: string[]
  provider: LlmProviderProfile
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'LLM provider id is required',
    })
  }

  try {
    const result = await corePost<FetchModelsResponse>(`/llm-providers/${id}/fetch-models`, {})
    return { ok: true, data: result }
  }
  catch (error) {
    throw toPanelApiError(error, 'Failed to fetch LLM provider models')
  }
})
