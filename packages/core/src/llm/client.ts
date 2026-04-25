import OpenAI from 'openai'
import { GoogleGenAI } from '@google/genai'
import type { AgentEvent, LLMConfig, ChatMessage, LLMTool } from '@zakobot/shared'
import type { LLMChatOptions, LLMRequestOptions, LLMStreamOptions, RateLimitRetryHandler } from './provider-types.js'
import { chatOpenAI, chatStreamOpenAI } from './providers/openai.js'
import { chatVertex, chatStreamVertex } from './providers/vertex.js'

const MAX_TOOL_CALL_ROUNDS = 8
const RATE_LIMIT_MESSAGE = 'LLM 服务当前过于繁忙，请稍等片刻后重试。'
const REQUEST_STOPPED_MESSAGE = '请求已停止。'
const RATE_LIMIT_RETRY_DELAYS_MS = [5000, 10000] as const
const TOOL_LIMIT_FINAL_INSTRUCTION = '你已经完成了足够的工具调用。不要再调用任何工具，直接基于现有上下文和工具结果给出最终回答。你的回答必须先简要总结你已经做了什么、当前页面/任务处于什么状态、接下来准备做什么；如果存在阻塞或信息仍不足，也必须明确说出阻塞点或缺失信息。'

interface ServiceAccountCreds {
  type: string
  project_id: string
  private_key: string
  client_email: string
  token_uri: string
}

function parseServiceAccount(apiKey: string): ServiceAccountCreds | null {
  try {
    const parsed = JSON.parse(apiKey) as ServiceAccountCreds
    if (parsed.type === 'service_account' && parsed.private_key && parsed.client_email)
      return parsed
    return null
  }
  catch { return null }
}

function extractVertexLocation(baseUrl: string): string {
  // Parse from URL path: /locations/{location}/
  const pathMatch = baseUrl.match(/\/locations\/([^/]+)\//)
  if (pathMatch) return pathMatch[1]!
  // Fallback: regional subdomain https://{location}-aiplatform.googleapis.com
  const hostMatch = baseUrl.match(/^https?:\/\/([a-z0-9-]+)-aiplatform\.googleapis\.com/)
  if (hostMatch) return hostMatch[1]!
  return 'us-central1'
}

export class LLMClient {
  private openai?: OpenAI
  private genai?: GoogleGenAI
  private vertexCreds: ServiceAccountCreds | null

  constructor(private config: LLMConfig) {
    this.vertexCreds = parseServiceAccount(config.apiKey)

    if (this.vertexCreds) {
      const location = extractVertexLocation(config.baseUrl ?? '')
      this.genai = new GoogleGenAI({
        vertexai: true,
        project: this.vertexCreds.project_id,
        location,
        googleAuthOptions: {
          credentials: this.vertexCreds as unknown as Record<string, string>,
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        },
      })
    }
    else {
      this.openai = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      })
    }
  }

  async chat(
    messages: ChatMessage[],
    tools: LLMTool[] = [],
    maxToolCallRounds = MAX_TOOL_CALL_ROUNDS,
    options: LLMChatOptions = {},
  ): Promise<string> {
    if (this.genai) {
      return chatVertex(this.getVertexProviderDeps(), messages, tools, maxToolCallRounds, options)
    }

    return chatOpenAI(this.getOpenAIProviderDeps(), messages, tools, maxToolCallRounds, options, TOOL_LIMIT_FINAL_INSTRUCTION)
  }

  async *chatStream(
    messages: ChatMessage[],
    tools: LLMTool[] = [],
    options: LLMStreamOptions = {},
  ): AsyncGenerator<AgentEvent> {
    if (this.genai) {
      yield* chatStreamVertex(this.getVertexProviderDeps(), messages, tools, {
        ...options,
        maxToolCallRounds: options.maxToolCallRounds ?? MAX_TOOL_CALL_ROUNDS,
      })
      return
    }

    yield* chatStreamOpenAI(this.getOpenAIProviderDeps(), messages, tools, {
      ...options,
      maxToolCallRounds: options.maxToolCallRounds ?? MAX_TOOL_CALL_ROUNDS,
    }, TOOL_LIMIT_FINAL_INSTRUCTION)
  }

  private getOpenAIProviderDeps() {
    return {
      client: this.openai!,
      model: this.config.model,
      requestWithRetry: <T>(operation: () => Promise<T>, options: LLMRequestOptions = {}) => this.requestWithRetry(operation, options),
      throwIfAborted: (signal?: AbortSignal) => this.throwIfAborted(signal),
    }
  }

  private getVertexProviderDeps() {
    return {
      client: this.genai!,
      model: this.config.model,
      requestWithRetry: <T>(operation: () => Promise<T>, options: LLMRequestOptions = {}) => this.requestWithRetry(operation, options),
      throwIfAborted: (signal?: AbortSignal) => this.throwIfAborted(signal),
    }
  }

  private async requestWithRetry<T>(operation: () => Promise<T>, options: LLMRequestOptions = {}): Promise<T> {
    const { abortSignal, onRateLimitRetry } = options

    for (let attempt = 0; attempt <= RATE_LIMIT_RETRY_DELAYS_MS.length; attempt += 1) {
      this.throwIfAborted(abortSignal)

      try {
        return await operation()
      }
      catch (error) {
        if (!this.isRateLimitError(error)) {
          throw this.normalizeProviderError(error)
        }

        const delayMs = RATE_LIMIT_RETRY_DELAYS_MS[attempt]
        if (delayMs == null) {
          throw this.normalizeProviderError(error)
        }

        await onRateLimitRetry?.(attempt + 1, delayMs)
        await this.sleepWithAbort(delayMs, abortSignal)
      }
    }

    throw new Error(RATE_LIMIT_MESSAGE)
  }

  private normalizeProviderError(error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error)

    if (this.isRateLimitError(error)) {
      return new Error(RATE_LIMIT_MESSAGE)
    }

    return error instanceof Error ? error : new Error(message)
  }

  private isRateLimitError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    const status = this.readNumericField(error, 'status')
      ?? this.readNumericField(this.readRecordField(error, 'response'), 'status')
    const code = this.readStringField(error, 'code')
      ?? this.readStringField(this.readRecordField(error, 'error'), 'code')

    return status === 429
      || code === 'rate_limit_exceeded'
      || /too many concurrent requests|rate[_ -]?limit|rate limit exceeded/i.test(message)
  }

  private throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) {
      throw new Error(REQUEST_STOPPED_MESSAGE)
    }
  }

  private async sleepWithAbort(delayMs: number, signal?: AbortSignal) {
    this.throwIfAborted(signal)

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

  private readRecordField(value: unknown, key: string): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const field = (value as Record<string, unknown>)[key]
    return field && typeof field === 'object' && !Array.isArray(field)
      ? field as Record<string, unknown>
      : undefined
  }

  private readNumericField(value: unknown, key: string): number | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const field = (value as Record<string, unknown>)[key]
    return typeof field === 'number' ? field : undefined
  }

  private readStringField(value: unknown, key: string): string | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const field = (value as Record<string, unknown>)[key]
    return typeof field === 'string' ? field : undefined
  }
}
