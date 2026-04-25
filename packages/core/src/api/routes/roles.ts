import type http from 'http'
import { randomUUID } from 'crypto'
import {
  createRole,
  deleteRole,
  getRole,
  listRoles,
  updateRole,
} from '@zakobot/database'
import type { DB } from '@zakobot/database'
import type { ApiResponse } from '@zakobot/shared'
import { getApiErrorMessage, getApiErrorStatus, readJsonBody } from '../http.js'
import { toRoleProfile } from '../serializers.js'
import { parseRoleInput } from '../validators.js'

type RouteResult = {
  status?: number
  body: ApiResponse<unknown>
}

export async function getRolesRoute(
  req: http.IncomingMessage,
  pathname: string,
  db: DB,
): Promise<RouteResult | undefined> {
  if (pathname === '/roles' && req.method === 'GET') {
    return { body: { ok: true, data: listRoles(db).map(row => toRoleProfile(row)) } }
  }

  if (pathname === '/roles' && req.method === 'POST') {
    try {
      const payload = parseRoleInput(await readJsonBody(req))
      const now = new Date()
      const created = createRole(db, {
        id: randomUUID(),
        avatar: payload.avatar,
        name: payload.name,
        systemPrompt: payload.systemPrompt,
        llmProvider: 'openai',
        llmModel: '',
        llmApiKey: '',
        llmBaseUrl: null,
        enabledTools: JSON.stringify(payload.enabledTools),
        enabledSkills: JSON.stringify(payload.enabledSkills),
        createdAt: now,
        updatedAt: now,
      })

      return { status: 201, body: { ok: true, data: toRoleProfile(created!) } }
    }
    catch (error) {
      return errorResult(error, 'Invalid request body')
    }
  }

  const roleMatch = pathname.match(/^\/roles\/([^/]+)$/)
  if (roleMatch && req.method === 'GET') {
    const role = getRole(db, roleMatch[1])

    if (!role) {
      return { status: 404, body: { ok: false, error: 'Role not found' } }
    }

    return { body: { ok: true, data: toRoleProfile(role) } }
  }

  if (roleMatch && req.method === 'PUT') {
    const existing = getRole(db, roleMatch[1])

    if (!existing) {
      return { status: 404, body: { ok: false, error: 'Role not found' } }
    }

    try {
      const payload = parseRoleInput(await readJsonBody(req))
      const updated = updateRole(db, roleMatch[1], {
        avatar: payload.avatar,
        name: payload.name,
        systemPrompt: payload.systemPrompt,
        enabledTools: JSON.stringify(payload.enabledTools),
        enabledSkills: JSON.stringify(payload.enabledSkills),
        updatedAt: new Date(),
      })

      return { body: { ok: true, data: toRoleProfile(updated!) } }
    }
    catch (error) {
      return errorResult(error, 'Invalid request body')
    }
  }

  if (roleMatch && req.method === 'DELETE') {
    const existing = getRole(db, roleMatch[1])

    if (!existing) {
      return { status: 404, body: { ok: false, error: 'Role not found' } }
    }

    try {
      deleteRole(db, roleMatch[1])
      return { body: { ok: true, data: toRoleProfile(existing) } }
    }
    catch (error) {
      const message = getApiErrorMessage(error, 'Failed to delete role')
      const status = message.includes('FOREIGN KEY constraint failed') ? 409 : 400
      const userMessage = status === 409 ? 'Role is still used by existing bots' : message
      return {
        status: getApiErrorStatus(error, status),
        body: { ok: false, error: userMessage },
      }
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
