import type { LocalMemorySettings } from '@zakobot/shared'

export default defineEventHandler(async () => {
  try {
    const settings = await coreGet<LocalMemorySettings>('/settings/memory')
    return { ok: true, data: settings }
  }
  catch (error) {
    throw toPanelApiError(error, 'Core is unreachable')
  }
})
