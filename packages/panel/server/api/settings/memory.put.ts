import type { LocalMemorySettings } from '@zakobot/shared'

export default defineEventHandler(async (event) => {
  const body = await readBody<LocalMemorySettings>(event)

  try {
    const settings = await corePut<LocalMemorySettings>('/settings/memory', body)
    return { ok: true, data: settings }
  }
  catch (error) {
    throw createError({
      statusCode: 400,
      message: error instanceof Error ? error.message : 'Failed to update memory settings',
    })
  }
})
