import type { BotEditorInput, BotProfile } from '@zakobot/shared'

export default defineEventHandler(async (event) => {
  const body = await readBody<BotEditorInput>(event)

  try {
    const bot = await corePost<BotProfile>('/bots', body)
    return { ok: true, data: bot }
  }
  catch (error) {
    throw toPanelApiError(error, 'Failed to create bot')
  }
})
