import type { BrowseSettings } from '@zakobot/shared'

export default defineEventHandler(async (event) => {
  const body = await readBody<BrowseSettings>(event)

  try {
    const settings = await corePut<BrowseSettings>('/settings/browse', body)
    return { ok: true, data: settings }
  }
  catch (error) {
    throw toPanelApiError(error, 'Failed to update browse settings')
  }
})
