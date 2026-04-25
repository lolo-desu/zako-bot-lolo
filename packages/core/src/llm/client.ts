import OpenAI from 'openai'
import { GoogleGenAI } from '@google/genai'
import type { Content, Part, Tool as GenAITool } from '@google/genai'
import type { AgentEvent, LLMConfig, ChatMessage, LLMTool } from '@zakobot/shared'
import type { LLMChatOptions, LLMRequestOptions, LLMStreamOptions, RateLimitRetryHandler } from './provider-types.js'
import { chatOpenAI, chatStreamOpenAI } from './providers/openai.js'

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

let _callCounter = 0
function genCallId(): string {
  return `call_${(++_callCounter).toString(36)}_${Math.random().toString(36).slice(2, 6)}`
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
      return this.chatVertex(messages, tools, maxToolCallRounds, options)
    }

    return chatOpenAI(this.getOpenAIProviderDeps(), messages, tools, maxToolCallRounds, options, TOOL_LIMIT_FINAL_INSTRUCTION)
  }

  async *chatStream(
    messages: ChatMessage[],
    tools: LLMTool[] = [],
    options: LLMStreamOptions = {},
  ): AsyncGenerator<AgentEvent> {
    if (this.genai) {
      yield* this.chatStreamVertex(messages, tools, options)
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
      escapeLogMessage: (value: string) => this.escapeLogMessage(value),
      formatDeniedToolResult: (decision: { reason?: string, guidance?: string }) => this.formatDeniedToolResult(decision),
      formatLogValue: (value: unknown) => this.formatLogValue(value),
      requestWithRetry: <T>(operation: () => Promise<T>, options: LLMRequestOptions = {}) => this.requestWithRetry(operation, options),
      splitSegments: (text: string, maxLength = 1800) => this.splitSegments(text, maxLength),
      throwIfAborted: (signal?: AbortSignal) => this.throwIfAborted(signal),
    }
  }

  // ── Vertex AI (Google GenAI SDK) ──────────────────────────────────────────

  private async chatVertex(messages: ChatMessage[], tools: LLMTool[], maxRounds: number, options: LLMChatOptions): Promise<string> {
    const { systemInstruction, contents } = await this.toGenAIContents(messages)
    const genAITools = this.buildGenAITools(tools)

    for (let round = 0; round < maxRounds; round++) {
      this.throwIfAborted(options.abortSignal)
      const response = await this.requestWithRetry(() => this.genai!.models.generateContent({
        model: this.config.model,
        contents,
        config: {
          ...(systemInstruction ? { systemInstruction } : {}),
          ...(genAITools.length ? { tools: genAITools } : {}),
        },
      }), options)

      const parts: Part[] = response.candidates?.[0]?.content?.parts ?? []
      const funcCalls = parts.filter(p => p.functionCall)
      const text = parts.filter(p => p.text).map(p => p.text).join('')

      if (!funcCalls.length) return text

      contents.push({ role: 'model', parts })

      const responseParts: Part[] = []
      for (const part of funcCalls) {
        const fc = part.functionCall!
        const tool = tools.find(t => t.name === fc.name)
        let result: string
        try {
          if (!tool) throw new Error(`Tool "${fc.name}" is not available`)
          const args = (fc.args ?? {}) as Record<string, unknown>

          if (options.requestApproval) {
            const decision = await options.requestApproval(genCallId(), fc.name!, args)
            if (!decision.approved) {
              result = this.formatDeniedToolResult(decision)
              responseParts.push({ functionResponse: { name: fc.name!, response: { result } } })
              continue
            }
          }

          console.log(`[ToolCall] ${fc.name} ${this.formatLogValue(args)}`)
          result = await tool.execute(args)
          console.log(`[ToolResult] ${fc.name} ok length=${result.length}`)
        }
        catch (err) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`
          console.warn(`[ToolResult] ${fc.name} error="${this.escapeLogMessage(result)}"`)
        }
        responseParts.push({ functionResponse: { name: fc.name!, response: { result } } })
      }
      contents.push({ role: 'user', parts: responseParts })
    }

    console.warn(`[LLM] Reached tool-call limit (${maxRounds}); requesting final answer without tools.`)
    const final = await this.requestWithRetry(() => this.genai!.models.generateContent({
      model: this.config.model,
      contents,
      config: systemInstruction ? { systemInstruction } : {},
    }), options)
    return final.candidates?.[0]?.content?.parts?.filter(p => p.text).map(p => p.text).join('') ?? ''
  }

  private async *chatStreamVertex(
    messages: ChatMessage[],
    tools: LLMTool[],
    options: LLMStreamOptions,
  ): AsyncGenerator<AgentEvent> {
    const {
      maxToolCallRounds = MAX_TOOL_CALL_ROUNDS,
      requestApproval,
      abortSignal,
      onRateLimitRetry,
    } = options
    const { systemInstruction, contents } = await this.toGenAIContents(messages)
    const genAITools = this.buildGenAITools(tools)

    for (let round = 0; round < maxToolCallRounds; round++) {
      this.throwIfAborted(abortSignal)
      const response = await this.requestWithRetry(() => this.genai!.models.generateContent({
        model: this.config.model,
        contents,
        config: {
          ...(systemInstruction ? { systemInstruction } : {}),
          ...(genAITools.length ? { tools: genAITools } : {}),
        },
      }), { abortSignal, onRateLimitRetry })

      const parts: Part[] = response.candidates?.[0]?.content?.parts ?? []
      const funcCalls = parts.filter(p => p.functionCall)
      const text = parts.filter(p => p.text).map(p => p.text).join('')

      if (text) {
        for (const segment of this.splitSegments(text)) {
          yield { type: 'text_chunk', content: segment }
        }
      }

      if (!funcCalls.length) {
        yield { type: 'done', content: text }
        return
      }

      contents.push({ role: 'model', parts })

      const responseParts: Part[] = []
      for (const part of funcCalls) {
        const fc = part.functionCall!
        const callId = genCallId()
        const tool = tools.find(t => t.name === fc.name)
        const args = (fc.args ?? {}) as Record<string, unknown>

        yield { type: 'tool_call', callId, name: fc.name!, input: args }

        let result: string
        let ok = true

        try {
          if (!tool) throw new Error(`Tool "${fc.name}" is not available`)

          if (requestApproval) {
            const decision = await requestApproval(callId, fc.name!, args)
            if (!decision.approved) {
              result = decision.guidance?.trim()
                ? `User denied this tool call. Guidance: ${decision.guidance.trim()}`
                : decision.reason?.trim()
                    ? `User denied this tool call. Reason: ${decision.reason.trim()}`
                    : 'User denied this tool call.'
              ok = false
              yield { type: 'tool_result', callId, name: fc.name!, result, ok }
              responseParts.push({ functionResponse: { name: fc.name!, response: { result } } })
              continue
            }
          }

          console.log(`[ToolCall] ${fc.name} ${this.formatLogValue(args)}`)
          result = await tool.execute(args)
          console.log(`[ToolResult] ${fc.name} ok length=${result.length}`)
        }
        catch (err) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`
          ok = false
          console.warn(`[ToolResult] ${fc.name} error="${this.escapeLogMessage(result)}"`)
        }

        yield { type: 'tool_result', callId, name: fc.name!, result, ok }
        responseParts.push({ functionResponse: { name: fc.name!, response: { result } } })
      }

      contents.push({ role: 'user', parts: responseParts })
    }

    console.warn(`[LLM] Reached tool-call limit (${maxToolCallRounds}); requesting final answer without tools.`)
    yield { type: 'tool_limit_reached', limit: maxToolCallRounds }
    const final = await this.requestWithRetry(() => this.genai!.models.generateContent({
      model: this.config.model,
      contents,
      config: systemInstruction ? { systemInstruction } : {},
    }), { abortSignal, onRateLimitRetry })
    const finalText = final.candidates?.[0]?.content?.parts?.filter(p => p.text).map(p => p.text).join('') ?? ''

    if (finalText) {
      for (const segment of this.splitSegments(finalText)) {
        yield { type: 'text_chunk', content: segment }
      }
    }
    yield { type: 'done', content: finalText }
  }

  private async toGenAIContents(messages: ChatMessage[]): Promise<{ systemInstruction: string; contents: Content[] }> {
    const systemParts: string[] = []
    const contents: Content[] = []

    for (const msg of messages) {
      if (msg.role === 'system') {
        const text = typeof msg.content === 'string' ? msg.content : msg.content.map(p => p.type === 'text' ? p.text : '').join('')
        systemParts.push(text)
      }
      else {
        let parts: Part[]
        if (typeof msg.content === 'string') {
          parts = [{ text: msg.content }]
        }
        else {
          parts = await Promise.all(msg.content.map(async (p): Promise<Part> => {
            if (p.type === 'text') return { text: p.text }
            const { data, mimeType } = await this.fetchImageAsInlineData(p.image_url.url)
            return { inlineData: { data, mimeType } }
          }))
        }
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts,
        })
      }
    }

    return { systemInstruction: systemParts.join('\n\n'), contents }
  }

  private async fetchImageAsInlineData(url: string): Promise<{ data: string; mimeType: string }> {
    const response = await fetch(url)
    const buffer = await response.arrayBuffer()
    const data = Buffer.from(buffer).toString('base64')
    const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? 'image/jpeg'
    return { data, mimeType }
  }

  private buildGenAITools(tools: LLMTool[]): GenAITool[] {
    if (!tools.length) return []
    return [{
      functionDeclarations: tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters as Record<string, unknown>,
      })),
    }]
  }

  // ── OpenAI helpers ────────────────────────────────────────────────────────

  private splitSegments(text: string, maxLength = 1800): string[] {
    const paragraphs = text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean)
    const result: string[] = []
    for (const para of paragraphs) {
      if (para.length <= maxLength) {
        result.push(para)
      }
      else {
        for (let i = 0; i < para.length; i += maxLength) {
          result.push(para.slice(i, i + maxLength))
        }
      }
    }
    return result
  }

  private formatDeniedToolResult(decision: { reason?: string; guidance?: string }) {
    return decision.guidance?.trim()
      ? `User denied this tool call. Guidance: ${decision.guidance.trim()}`
      : decision.reason?.trim()
          ? `User denied this tool call. Reason: ${decision.reason.trim()}`
          : 'User denied this tool call.'
  }

  private formatLogValue(value: unknown) {
    try {
      return this.truncateLogMessage(JSON.stringify(value))
    }
    catch {
      return '[unserializable]'
    }
  }

  private escapeLogMessage(value: string) {
    return this.truncateLogMessage(value).replaceAll('"', '\\"')
  }

  private truncateLogMessage(value: string) {
    const normalized = value.replace(/\s+/g, ' ').trim()
    return normalized.length > 500 ? `${normalized.slice(0, 500)}...` : normalized
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
