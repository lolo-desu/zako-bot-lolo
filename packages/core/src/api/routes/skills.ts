import type http from 'http'
import type { ApiResponse } from '@zakobot/shared'
import type { SkillManager } from '../../skills/index.js'
import { getApiErrorMessage, getApiErrorStatus, readJsonBody } from '../http.js'
import { parseSkillImportInput, parseSkillInput } from '../validators.js'

type RouteResult = {
  status?: number
  body: ApiResponse<unknown>
}

export async function getSkillsRoute(
  req: http.IncomingMessage,
  pathname: string,
  skillManager: SkillManager,
): Promise<RouteResult | undefined> {
  if (pathname === '/skills' && req.method === 'GET') {
    return { body: { ok: true, data: skillManager.list() } }
  }

  if (pathname === '/skills' && req.method === 'POST') {
    try {
      const payload = parseSkillInput(await readJsonBody(req))
      return { status: 201, body: { ok: true, data: skillManager.create(payload) } }
    }
    catch (error) {
      return errorResult(error, 'Invalid request body')
    }
  }

  if (pathname === '/skills/import' && req.method === 'POST') {
    try {
      const payload = parseSkillImportInput(await readJsonBody(req))
      return { status: 201, body: { ok: true, data: skillManager.import(payload) } }
    }
    catch (error) {
      return errorResult(error, 'Invalid request body')
    }
  }

  const contentMatch = pathname.match(/^\/skills\/([^/]+)\/content$/)
  if (contentMatch && req.method === 'GET') {
    try {
      return { body: { ok: true, data: skillManager.getContent(contentMatch[1]) } }
    }
    catch (error) {
      return errorResult(error, 'Skill not found', 404)
    }
  }

  const skillMatch = pathname.match(/^\/skills\/([^/]+)$/)
  if (skillMatch && req.method === 'GET') {
    const skill = skillManager.get(skillMatch[1])

    if (!skill) {
      return { status: 404, body: { ok: false, error: 'Skill not found' } }
    }

    return { body: { ok: true, data: skill } }
  }

  if (skillMatch && req.method === 'PUT') {
    if (!skillManager.get(skillMatch[1])) {
      return { status: 404, body: { ok: false, error: 'Skill not found' } }
    }

    try {
      const payload = parseSkillInput(await readJsonBody(req))
      return { body: { ok: true, data: skillManager.update(skillMatch[1], payload) } }
    }
    catch (error) {
      return errorResult(error, 'Invalid request body')
    }
  }

  if (skillMatch && req.method === 'DELETE') {
    if (!skillManager.get(skillMatch[1])) {
      return { status: 404, body: { ok: false, error: 'Skill not found' } }
    }

    try {
      return { body: { ok: true, data: skillManager.remove(skillMatch[1]) } }
    }
    catch (error) {
      return errorResult(error, 'Failed to delete skill')
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
