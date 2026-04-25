import type { BrowseSettings } from '@zakobot/shared'

export default defineEventHandler(async () => {
  try {
    const settings = await coreGet<BrowseSettings>('/settings/browse')
    return { ok: true, data: settings }
  }
  catch (error) {
    throw toPanelApiError(error, 'Core is unreachable')
  }
})
