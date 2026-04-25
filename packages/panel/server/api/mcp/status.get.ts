import type { McpServerStatus } from '@zakobot/shared'

export default defineEventHandler(async () => {
  try {
    const status = await coreGet<McpServerStatus[]>('/mcp/status')
    return { ok: true, data: status }
  }
  catch (error) {
    throw toPanelApiError(error, 'Core is unreachable')
  }
})
