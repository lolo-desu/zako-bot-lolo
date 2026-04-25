import { GoogleGenAI } from '@google/genai'
import type { Content, Part, Tool as GenAITool } from '@google/genai'
import type { AgentEvent, ChatMessage, LLMTool, ToolExecutionArtifact } from '@zakobot/shared'
import type { LLMChatOptions, LLMRequestOptions, LLMStreamOptions } from '../provider-types.js'
import { escapeLogMessage, formatDeniedToolResult, formatLogValue, splitSegments } from '../provider-utils.js'
import { normalizeToolExecutionResult } from '../../tools/tool-result.js'

let callCounter = 0

export type VertexProviderDeps = {
  client: GoogleGenAI
  model: string
  requestWithRetry: <T>(operation: () => Promise<T>, options?: LLMRequestOptions) => Promise<T>
  throwIfAborted: (signal?: AbortSignal) => void
}

export async function chatVertex(
  deps: VertexProviderDeps,
  messages: ChatMessage[],
  tools: LLMTool[],
  maxRounds: number,
  options: LLMChatOptions,
): Promise<string> {
  const { systemInstruction, contents } = await toGenAIContents(messages)
  const genAITools = buildGenAITools(tools)

  for (let round = 0; round < maxRounds; round += 1) {
    deps.throwIfAborted(options.abortSignal)
    const response = await deps.requestWithRetry(() => deps.client.models.generateContent({
      model: deps.model,
      contents,
      config: {
        ...(systemInstruction ? { systemInstruction } : {}),
        ...(genAITools.length ? { tools: genAITools } : {}),
      },
    }), options)

    const parts: Part[] = response.candidates?.[0]?.content?.parts ?? []
    const funcCalls = parts.filter(part => part.functionCall)
    const text = parts.filter(part => part.text).map(part => part.text).join('')

    if (!funcCalls.length) {
      return text
    }

    contents.push({ role: 'model', parts })

    const responseParts: Part[] = []
    for (const part of funcCalls) {
      const functionCall = part.functionCall!
      const tool = tools.find(item => item.name === functionCall.name)
      let result: string

      try {
        if (!tool) {
          throw new Error(`Tool "${functionCall.name}" is not available`)
        }

        const args = (functionCall.args ?? {}) as Record<string, unknown>

        if (options.requestApproval) {
          const decision = await options.requestApproval(genCallId(), functionCall.name!, args)
          if (!decision.approved) {
            result = formatDeniedToolResult(decision)
            responseParts.push({ functionResponse: { name: functionCall.name!, response: { result } } })
            continue
          }
        }

        console.log(`[ToolCall] ${functionCall.name} ${formatLogValue(args)}`)
        result = normalizeToolExecutionResult(await tool.execute(args)).content
        console.log(`[ToolResult] ${functionCall.name} ok length=${result.length}`)
      }
      catch (error) {
        result = `Error: ${error instanceof Error ? error.message : String(error)}`
        console.warn(`[ToolResult] ${functionCall.name} error="${escapeLogMessage(result)}"`)
      }

      responseParts.push({ functionResponse: { name: functionCall.name!, response: { result } } })
    }

    contents.push({ role: 'user', parts: responseParts })
  }

  console.warn(`[LLM] Reached tool-call limit (${maxRounds}); requesting final answer without tools.`)
  const final = await deps.requestWithRetry(() => deps.client.models.generateContent({
    model: deps.model,
    contents,
    config: systemInstruction ? { systemInstruction } : {},
  }), options)

  return final.candidates?.[0]?.content?.parts?.filter(part => part.text).map(part => part.text).join('') ?? ''
}

export async function* chatStreamVertex(
  deps: VertexProviderDeps,
  messages: ChatMessage[],
  tools: LLMTool[],
  options: LLMStreamOptions,
): AsyncGenerator<AgentEvent> {
  const {
    requestApproval,
    abortSignal,
    onRateLimitRetry,
  } = options
  const maxToolCallRounds = options.maxToolCallRounds ?? 8
  const { systemInstruction, contents } = await toGenAIContents(messages)
  const genAITools = buildGenAITools(tools)

  for (let round = 0; round < maxToolCallRounds; round += 1) {
    deps.throwIfAborted(abortSignal)
    const response = await deps.requestWithRetry(() => deps.client.models.generateContent({
      model: deps.model,
      contents,
      config: {
        ...(systemInstruction ? { systemInstruction } : {}),
        ...(genAITools.length ? { tools: genAITools } : {}),
      },
    }), { abortSignal, onRateLimitRetry })

    const parts: Part[] = response.candidates?.[0]?.content?.parts ?? []
    const funcCalls = parts.filter(part => part.functionCall)
    const text = parts.filter(part => part.text).map(part => part.text).join('')

    if (text) {
      for (const segment of splitSegments(text)) {
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
      const functionCall = part.functionCall!
      const callId = genCallId()
      const tool = tools.find(item => item.name === functionCall.name)
      const args = (functionCall.args ?? {}) as Record<string, unknown>

      yield { type: 'tool_call', callId, name: functionCall.name!, input: args }

      let result: string
      let artifacts: ToolExecutionArtifact[] = []
      let ok = true

      try {
        if (!tool) {
          throw new Error(`Tool "${functionCall.name}" is not available`)
        }

        if (requestApproval) {
          const decision = await requestApproval(callId, functionCall.name!, args)
          if (!decision.approved) {
            result = formatDeniedToolResult(decision)
            ok = false
            yield { type: 'tool_result', callId, name: functionCall.name!, result, ok }
            responseParts.push({ functionResponse: { name: functionCall.name!, response: { result } } })
            continue
          }
        }

        console.log(`[ToolCall] ${functionCall.name} ${formatLogValue(args)}`)
        const execution = normalizeToolExecutionResult(await tool.execute(args))
        result = execution.content
        artifacts = execution.artifacts
        console.log(`[ToolResult] ${functionCall.name} ok length=${result.length} artifacts=${artifacts.length}`)
      }
      catch (error) {
        result = `Error: ${error instanceof Error ? error.message : String(error)}`
        ok = false
        console.warn(`[ToolResult] ${functionCall.name} error="${escapeLogMessage(result)}"`)
      }

      yield { type: 'tool_result', callId, name: functionCall.name!, result, ok, artifacts }
      responseParts.push({ functionResponse: { name: functionCall.name!, response: { result } } })
    }

    contents.push({ role: 'user', parts: responseParts })
  }

  console.warn(`[LLM] Reached tool-call limit (${maxToolCallRounds}); requesting final answer without tools.`)
  yield { type: 'tool_limit_reached', limit: maxToolCallRounds }
  const final = await deps.requestWithRetry(() => deps.client.models.generateContent({
    model: deps.model,
    contents,
    config: systemInstruction ? { systemInstruction } : {},
  }), { abortSignal, onRateLimitRetry })
  const finalText = final.candidates?.[0]?.content?.parts?.filter(part => part.text).map(part => part.text).join('') ?? ''

  if (finalText) {
    for (const segment of splitSegments(finalText)) {
      yield { type: 'text_chunk', content: segment }
    }
  }

  yield { type: 'done', content: finalText }
}

async function toGenAIContents(messages: ChatMessage[]): Promise<{ systemInstruction: string, contents: Content[] }> {
  const systemParts: string[] = []
  const contents: Content[] = []

  for (const message of messages) {
    if (message.role === 'system') {
      const text = typeof message.content === 'string' ? message.content : message.content.map(part => part.type === 'text' ? part.text : '').join('')
      systemParts.push(text)
      continue
    }

    let parts: Part[]
    if (typeof message.content === 'string') {
      parts = [{ text: message.content }]
    }
    else {
      parts = await Promise.all(message.content.map(async (part): Promise<Part> => {
        if (part.type === 'text') {
          return { text: part.text }
        }

        const { data, mimeType } = await fetchImageAsInlineData(part.image_url.url)
        return { inlineData: { data, mimeType } }
      }))
    }

    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts,
    })
  }

  return { systemInstruction: systemParts.join('\n\n'), contents }
}

async function fetchImageAsInlineData(url: string): Promise<{ data: string, mimeType: string }> {
  const response = await fetch(url)
  const buffer = await response.arrayBuffer()
  const data = Buffer.from(buffer).toString('base64')
  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? 'image/jpeg'
  return { data, mimeType }
}

function buildGenAITools(tools: LLMTool[]): GenAITool[] {
  if (!tools.length) {
    return []
  }

  return [{
    functionDeclarations: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
    })),
  }]
}

function genCallId(): string {
  callCounter += 1
  return `call_${callCounter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}
