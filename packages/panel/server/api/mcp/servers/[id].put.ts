import type { McpServerEditorInput, McpServerProfile } from '@zakobot/shared'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: 'MCP server id is required' })
  }

  const body = await readBody<McpServerEditorInput>(event)

  try {
    const server = await corePut<McpServerProfile>(`/mcp/servers/${id}`, body)
    return { ok: true, data: server }
  }
  catch (error) {
    throw toPanelApiError(error, 'Failed to update MCP server')
  }
})
