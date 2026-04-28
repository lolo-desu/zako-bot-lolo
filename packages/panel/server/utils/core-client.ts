import type { ApiResponse } from '@zakobot/shared'
import { createError } from 'h3'
import { resolveCoreApiUrl } from './core-client-path'

class CoreApiError extends Error {
  statusCode: number
  path: string
  method: string

  constructor(message: string, statusCode: number, path: string, method: string, options?: { cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'CoreApiError'
    this.statusCode = statusCode
    this.path = path
    this.method = method
  }
}

async function coreRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const config = useRuntimeConfig()
  const method = init?.method ?? 'GET'
  const url = resolveCoreApiUrl(path, config.coreApiUrl)
  let res: Response

  try {
    res = await fetch(url, init)
  }
  catch (error) {
    throw new CoreApiError('Core is unreachable', 503, path, method, { cause: error })
  }

  const raw = await res.text()
  let json: ApiResponse<T>

  try {
    json = raw ? JSON.parse(raw) as ApiResponse<T> : { ok: false, error: 'Core API returned an empty response' }
  }
  catch (error) {
    throw new CoreApiError(`Core API returned non-JSON response (${res.status})`, res.ok ? 502 : res.status, path, method, { cause: error })
  }

  if (!res.ok || !json.ok) {
    throw new CoreApiError('error' in json && json.error ? json.error : `Core API error: ${res.status}`, res.status, path, method)
  }

  if (!('data' in json) || typeof json.data === 'undefined') {
    throw new CoreApiError('Core API returned no data', 502, path, method)
  }

  return json.data
}

function toPanelApiError(error: unknown, fallbackMessage: string) {
  if (error instanceof CoreApiError) {
    return createError({
      statusCode: error.statusCode,
      message: error.message,
    })
  }

  return createError({
    statusCode: 400,
    message: error instanceof Error ? error.message : fallbackMessage,
  })
}

async function coreGet<T>(path: string): Promise<T> {
  return coreRequest<T>(path)
}

async function corePost<T>(path: string, body: unknown): Promise<T> {
  return coreRequest<T>(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

async function corePut<T>(path: string, body: unknown): Promise<T> {
  return coreRequest<T>(path, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

async function coreDelete<T>(path: string): Promise<T> {
  return coreRequest<T>(path, {
    method: 'DELETE',
  })
}

export { coreDelete, coreGet, corePost, corePut, CoreApiError, toPanelApiError }
