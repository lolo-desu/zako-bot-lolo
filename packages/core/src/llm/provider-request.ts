import type { LLMRequestOptions } from './provider-types.js'

const RATE_LIMIT_MESSAGE = 'LLM 服务当前过于繁忙，请稍等片刻后重试。'
const REQUEST_STOPPED_MESSAGE = '请求已停止。'
const RATE_LIMIT_RETRY_DELAYS_MS = [5000, 10000] as const

export async function requestWithRetry<T>(
  operation: () => Promise<T>,
  options: LLMRequestOptions = {},
): Promise<T> {
  const { abortSignal, onRateLimitRetry } = options

  for (let attempt = 0; attempt <= RATE_LIMIT_RETRY_DELAYS_MS.length; attempt += 1) {
    throwIfAborted(abortSignal)

    try {
      return await operation()
    }
    catch (error) {
      if (!isRateLimitError(error)) {
        throw normalizeProviderError(error)
      }

      const delayMs = RATE_LIMIT_RETRY_DELAYS_MS[attempt]
      if (delayMs == null) {
        throw normalizeProviderError(error)
      }

      await onRateLimitRetry?.(attempt + 1, delayMs)
      await sleepWithAbort(delayMs, abortSignal)
    }
  }

  throw new Error(RATE_LIMIT_MESSAGE)
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error(REQUEST_STOPPED_MESSAGE)
  }
}

function normalizeProviderError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)

  if (isRateLimitError(error)) {
    return new Error(RATE_LIMIT_MESSAGE)
  }

  return error instanceof Error ? error : new Error(message)
}

function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const status = readNumericField(error, 'status')
    ?? readNumericField(readRecordField(error, 'response'), 'status')
  const code = readStringField(error, 'code')
    ?? readStringField(readRecordField(error, 'error'), 'code')

  return status === 429
    || code === 'rate_limit_exceeded'
    || /too many concurrent requests|rate[_ -]?limit|rate limit exceeded/i.test(message)
}

async function sleepWithAbort(delayMs: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal)

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)

    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(new Error(REQUEST_STOPPED_MESSAGE))
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function readRecordField(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const field = (value as Record<string, unknown>)[key]
  return field && typeof field === 'object' && !Array.isArray(field)
    ? field as Record<string, unknown>
    : undefined
}

function readNumericField(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'number' ? field : undefined
}

function readStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'string' ? field : undefined
}
