import type { BotEditorInput, BotProfile } from '@zakobot/shared'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Bot id is required',
    })
  }

  const body = await readBody<BotEditorInput>(event)

  try {
    const bot = await corePut<BotProfile>(`/bots/${id}`, body)
    return { ok: true, data: bot }
  }
  catch (error) {
    throw toPanelApiError(error, 'Failed to update bot')
  }
})
