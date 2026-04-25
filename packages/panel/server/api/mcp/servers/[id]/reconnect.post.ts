import type { McpServerProfile } from '@zakobot/shared'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: 'MCP server id is required' })
  }

  try {
    const server = await corePost<McpServerProfile>(`/mcp/servers/${id}/reconnect`, {})
    return { ok: true, data: server }
  }
  catch (error) {
    throw toPanelApiError(error, 'Failed to reconnect MCP server')
  }
})
