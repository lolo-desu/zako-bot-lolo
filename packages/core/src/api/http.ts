import http from 'http'
import type { ApiResponse } from '@zakobot/shared'

const DEFAULT_MAX_JSON_BODY_BYTES = 1024 * 1024

export class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export function writeJson<T>(res: http.ServerResponse, data: ApiResponse<T>, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

export async function readJsonBody<T>(req: http.IncomingMessage) {
  const chunks: Buffer[] = []
  let totalBytes = 0
  const maxBytes = maxJsonBodyBytes()

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buffer.byteLength

    if (totalBytes > maxBytes) {
      throw new HttpStatusError(413, 'Request body is too large')
    }

    chunks.push(buffer)
  }

  if (!chunks.length) {
    return {} as T
  }

  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) {
    return {} as T
  }

  try {
    return JSON.parse(raw) as T
  }
  catch {
    throw new HttpStatusError(400, 'Invalid JSON request body')
  }
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function getApiErrorStatus(error: unknown, fallback = 400) {
  return error instanceof HttpStatusError ? error.status : fallback
}

export function writeApiError(res: http.ServerResponse, error: unknown, fallback: string, status = 400) {
  return writeJson(res, { ok: false, error: getApiErrorMessage(error, fallback) }, getApiErrorStatus(error, status))
}

function maxJsonBodyBytes() {
  const configured = Number(process.env.CORE_API_MAX_BODY_BYTES)
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_JSON_BODY_BYTES
}
