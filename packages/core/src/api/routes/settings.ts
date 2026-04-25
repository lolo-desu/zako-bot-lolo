import type http from 'http'
import type { ApiResponse } from '@zakobot/shared'
import type { DB } from '@zakobot/database'
import { getApiErrorMessage, getApiErrorStatus, readJsonBody } from '../http.js'
import {
  parseBrowseSettingsInput,
  parseGeneralSettingsInput,
  parseLocalMemorySettingsInput,
  parseSearchSettingsInput,
} from '../validators.js'
import { getBrowseSettings, saveBrowseSettings } from '../../settings/browse-settings.js'
import { getGeneralSettings, saveGeneralSettings } from '../../settings/general-settings.js'
import { getLocalMemorySettings, saveLocalMemorySettings } from '../../settings/local-memory-settings.js'
import { getSearchSettings, saveSearchSettings } from '../../settings/search-settings.js'

type RouteResult = {
  status?: number
  body: ApiResponse<unknown>
}

export async function getSettingsRoute(
  req: http.IncomingMessage,
  pathname: string,
  db: DB,
): Promise<RouteResult | undefined> {
  if (pathname === '/settings/search' && req.method === 'GET') {
    return { body: { ok: true, data: getSearchSettings(db) } }
  }

  if (pathname === '/settings/search' && req.method === 'PUT') {
    try {
      const payload = parseSearchSettingsInput(await readJsonBody(req))
      return { body: { ok: true, data: saveSearchSettings(db, payload) } }
    }
    catch (error) {
      return errorResult(error, 'Invalid request body')
    }
  }

  if (pathname === '/settings/browse' && req.method === 'GET') {
    return { body: { ok: true, data: getBrowseSettings(db) } }
  }

  if (pathname === '/settings/browse' && req.method === 'PUT') {
    try {
      const payload = parseBrowseSettingsInput(await readJsonBody(req))
      return { body: { ok: true, data: saveBrowseSettings(db, payload) } }
    }
    catch (error) {
      return errorResult(error, 'Invalid request body')
    }
  }

  if (pathname === '/settings/general' && req.method === 'GET') {
    return { body: { ok: true, data: getGeneralSettings(db) } }
  }

  if (pathname === '/settings/general' && req.method === 'PUT') {
    try {
      const payload = parseGeneralSettingsInput(await readJsonBody(req))
      return { body: { ok: true, data: saveGeneralSettings(db, payload) } }
    }
    catch (error) {
      return errorResult(error, 'Invalid request body')
    }
  }

  if (pathname === '/settings/memory' && req.method === 'GET') {
    return { body: { ok: true, data: getLocalMemorySettings(db) } }
  }

  if (pathname === '/settings/memory' && req.method === 'PUT') {
    try {
      const payload = parseLocalMemorySettingsInput(await readJsonBody(req))
      return { body: { ok: true, data: saveLocalMemorySettings(db, payload) } }
    }
    catch (error) {
      return errorResult(error, 'Invalid request body')
    }
  }

  return undefined
}

function errorResult(error: unknown, fallback: string): RouteResult {
  return {
    status: getApiErrorStatus(error),
    body: { ok: false, error: getApiErrorMessage(error, fallback) },
  }
}
