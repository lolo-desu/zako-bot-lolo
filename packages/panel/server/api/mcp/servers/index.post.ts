import type { McpServerEditorInput, McpServerProfile } from '@zakobot/shared'

export default defineEventHandler(async (event) => {
  const body = await readBody<McpServerEditorInput>(event)

  try {
    const server = await corePost<McpServerProfile>('/mcp/servers', body)
    return { ok: true, data: server }
  }
  catch (error) {
    throw toPanelApiError(error, 'Failed to create MCP server')
  }
})
