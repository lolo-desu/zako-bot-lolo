import type { BotProfile } from '@zakobot/shared'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Bot id is required',
    })
  }

  try {
    const bot = await coreDelete<BotProfile>(`/bots/${id}`)
    return { ok: true, data: bot }
  }
  catch (error) {
    throw toPanelApiError(error, 'Failed to delete bot')
  }
})
