import type { MemorySettings } from '@zakobot/shared'

export default defineEventHandler(async () => {
  try {
    const settings = await coreGet<MemorySettings>('/settings/memory')
    return { ok: true, data: settings }
  }
  catch (error) {
    throw createError({
      statusCode: 503,
      message: error instanceof Error ? error.message : 'Core is unreachable',
    })
  }
})
