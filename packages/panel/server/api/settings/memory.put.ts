import type { MemorySettings } from '@zakobot/shared'

export default defineEventHandler(async (event) => {
  const body = await readBody<MemorySettings>(event)

  try {
    const settings = await corePut<MemorySettings>('/settings/memory', body)
    return { ok: true, data: settings }
  }
  catch (error) {
    throw createError({
      statusCode: 400,
      message: error instanceof Error ? error.message : 'Failed to update memory settings',
    })
  }
})
