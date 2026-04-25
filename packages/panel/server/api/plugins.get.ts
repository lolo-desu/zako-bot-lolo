import type { PluginInfo } from '@zakobot/shared'

export default defineEventHandler(async () => {
  try {
    const plugins = await coreGet<PluginInfo[]>('/plugins')
    return { ok: true, data: plugins }
  }
  catch (error) {
    throw toPanelApiError(error, 'Core is unreachable')
  }
})
