import type { BotListItem } from '@zakobot/shared'

export default defineEventHandler(async () => {
  try {
    const bots = await coreGet<BotListItem[]>('/bots')
    return { ok: true, data: bots }
  }
  catch (error) {
    throw toPanelApiError(error, 'Core is unreachable')
  }
})
