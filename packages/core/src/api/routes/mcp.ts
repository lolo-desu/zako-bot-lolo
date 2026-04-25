import type http from 'http'
import {
  createMcpServer,
  deleteMcpServer,
  getMcpServer,
  listMcpServers,
  updateMcpServer,
} from '@zakobot/database'
import type { DB } from '@zakobot/database'
import type { ApiResponse, McpServerStatus } from '@zakobot/shared'
import type { McpManager } from '../../mcp/index.js'
import { getApiErrorMessage, getApiErrorStatus, readJsonBody } from '../http.js'
import { toMcpServerProfile } from '../serializers.js'
import { parseMcpServerInput } from '../validators.js'

type RouteResult = {
  status?: number
  body: ApiResponse<unknown>
}

type RouteDeps = {
  db: DB
  listStatus: () => McpServerStatus[]
  mcpManager: McpManager
}

export async function getMcpRoute(
  req: http.IncomingMessage,
  pathname: string,
  { db, listStatus, mcpManager }: RouteDeps,
): Promise<RouteResult | undefined> {
  if (pathname === '/mcp/status' && req.method === 'GET') {
    return { body: { ok: true, data: listStatus() } }
  }

  if (pathname === '/mcp/servers' && req.method === 'GET') {
    return {
      body: {
        ok: true,
        data: listMcpServers(db).map(row => toMcpServerProfile(row)),
      },
    }
  }

  if (pathname === '/mcp/servers' && req.method === 'POST') {
    try {
      const payload = parseMcpServerInput(await readJsonBody(req))
      const created = createMcpServer(db, payload)

      if (created.enabled) {
        mcpManager.connect(created).catch((error) => {
          console.error(`[ApiServer] Failed to connect MCP server "${created.name}":`, error)
        })
      }

      return { status: 201, body: { ok: true, data: toMcpServerProfile(created) } }
    }
    catch (error) {
      return errorResult(error, 'Invalid request body')
    }
  }

  const reconnectMatch = pathname.match(/^\/mcp\/servers\/([^/]+)\/reconnect$/)
  if (reconnectMatch && req.method === 'POST') {
    const server = getMcpServer(db, reconnectMatch[1])

    if (!server) {
      return { status: 404, body: { ok: false, error: 'MCP server not found' } }
    }

    try {
      await mcpManager.reconnect(server)
      return { body: { ok: true, data: toMcpServerProfile(server) } }
    }
    catch (error) {
      return errorResult(error, 'Failed to reconnect MCP server')
    }
  }

  const mcpServerMatch = pathname.match(/^\/mcp\/servers\/([^/]+)$/)
  if (mcpServerMatch && req.method === 'GET') {
    const server = getMcpServer(db, mcpServerMatch[1])

    if (!server) {
      return { status: 404, body: { ok: false, error: 'MCP server not found' } }
    }

    return { body: { ok: true, data: toMcpServerProfile(server) } }
  }

  if (mcpServerMatch && req.method === 'PUT') {
    const existing = getMcpServer(db, mcpServerMatch[1])

    if (!existing) {
      return { status: 404, body: { ok: false, error: 'MCP server not found' } }
    }

    try {
      const payload = parseMcpServerInput(await readJsonBody(req))
      const updated = updateMcpServer(db, mcpServerMatch[1], payload)

      if (!updated) {
        throw new Error('Failed to update MCP server')
      }

      if (updated.enabled) {
        mcpManager.reconnect(updated).catch((error) => {
          console.error(`[ApiServer] Failed to reconnect MCP server "${updated.name}":`, error)
        })
      }
      else {
        await mcpManager.disconnect(updated.id)
      }

      return { body: { ok: true, data: toMcpServerProfile(updated) } }
    }
    catch (error) {
      return errorResult(error, 'Invalid request body')
    }
  }

  if (mcpServerMatch && req.method === 'DELETE') {
    const existing = getMcpServer(db, mcpServerMatch[1])

    if (!existing) {
      return { status: 404, body: { ok: false, error: 'MCP server not found' } }
    }

    try {
      await mcpManager.disconnect(existing.id)
      deleteMcpServer(db, existing.id)
      return { body: { ok: true, data: toMcpServerProfile(existing) } }
    }
    catch (error) {
      return errorResult(error, 'Failed to delete MCP server')
    }
  }

  return undefined
}

function errorResult(error: unknown, fallback: string, status = 400): RouteResult {
  return {
    status: getApiErrorStatus(error, status),
    body: { ok: false, error: getApiErrorMessage(error, fallback) },
  }
}
