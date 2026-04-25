import type { GeneralSettings } from '@zakobot/shared'

export default defineEventHandler(async () => {
  try {
    const settings = await coreGet<GeneralSettings>('/settings/general')
    return { ok: true, data: settings }
  }
  catch (error) {
    throw toPanelApiError(error, 'Core is unreachable')
  }
})
