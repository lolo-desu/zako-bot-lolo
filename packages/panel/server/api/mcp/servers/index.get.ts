import type { McpServerProfile } from '@zakobot/shared'

export default defineEventHandler(async () => {
  try {
    const servers = await coreGet<McpServerProfile[]>('/mcp/servers')
    return { ok: true, data: servers }
  }
  catch (error) {
    throw toPanelApiError(error, 'Core is unreachable')
  }
})
