import OpenAI from 'openai'
import type { AgentEvent, ChatMessage, LLMTool } from '@zakobot/shared'
import type { LLMChatOptions, LLMRequestOptions, LLMStreamOptions } from '../provider-types.js'
import { escapeLogMessage, formatDeniedToolResult, formatLogValue, splitSegments } from '../provider-utils.js'

export type OpenAIProviderDeps = {
  client: OpenAI
  model: string
  requestWithRetry: <T>(operation: () => Promise<T>, options?: LLMRequestOptions) => Promise<T>
  throwIfAborted: (signal?: AbortSignal) => void
}

export async function chatOpenAI(
  deps: OpenAIProviderDeps,
  messages: ChatMessage[],
  tools: LLMTool[] = [],
  maxToolCallRounds: number,
  options: LLMChatOptions,
  finalInstruction: string,
): Promise<string> {
  const requestMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map(toOpenAIMessage)
  const toolDefinitions = buildToolDefinitions(tools)

  for (let i = 0; i < maxToolCallRounds; i += 1) {
    deps.throwIfAborted(options.abortSignal)
    const response = await deps.requestWithRetry(() => deps.client.chat.completions.create({
      model: deps.model,
      messages: requestMessages,
      ...(toolDefinitions.length > 0
        ? {
            tools: toolDefinitions,
            tool_choice: 'auto' as const,
          }
        : {}),
    }), options)

    const message = response.choices[0]?.message

    if (!message) {
      throw new Error('LLM returned empty response')
    }

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content ?? ''
    }

    requestMessages.push(toAssistantToolCallMessage(message))
    requestMessages.push(...await executeToolCalls(deps, message, tools, options))
  }

  console.warn(`[LLM] Reached tool-call limit (${maxToolCallRounds}); requesting final answer without tools.`)

  const finalResponse = await deps.requestWithRetry(() => deps.client.chat.completions.create({
    model: deps.model,
    messages: [
      ...requestMessages,
      {
        role: 'system',
        content: finalInstruction,
      },
    ],
  }), options)

  const finalMessage = finalResponse.choices[0]?.message
  if (!finalMessage) {
    throw new Error('LLM returned empty response after tool-call limit')
  }

  return finalMessage.content ?? ''
}

export async function* chatStreamOpenAI(
  deps: OpenAIProviderDeps,
  messages: ChatMessage[],
  tools: LLMTool[] = [],
  options: LLMStreamOptions = {},
  finalInstruction: string,
): AsyncGenerator<AgentEvent> {
  const {
    requestApproval,
    abortSignal,
    onRateLimitRetry,
  } = options
  const maxToolCallRounds = options.maxToolCallRounds ?? 8
  const requestMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map(toOpenAIMessage)
  const toolDefinitions = buildToolDefinitions(tools)

  for (let round = 0; round < maxToolCallRounds; round += 1) {
    deps.throwIfAborted(abortSignal)
    const response = await deps.requestWithRetry(() => deps.client.chat.completions.create({
      model: deps.model,
      messages: requestMessages,
      ...(toolDefinitions.length > 0
        ? { tools: toolDefinitions, tool_choice: 'auto' as const }
        : {}),
    }), { abortSignal, onRateLimitRetry })

    const message = response.choices[0]?.message
    if (!message) {
      throw new Error('LLM returned empty response')
    }

    const toolCalls = message.tool_calls ?? []
    const hasToolCalls = toolCalls.length > 0

    // Some providers leak internal tool markup into assistant content while also
    // returning structured tool_calls. Keep that content out of the user-facing
    // stream and wait for the final post-tool answer instead.
    if (message.content && !hasToolCalls) {
      for (const segment of splitSegments(message.content)) {
        yield { type: 'text_chunk', content: segment }
      }
    }

    if (!hasToolCalls) {
      yield { type: 'done', content: message.content ?? '' }
      return
    }

    requestMessages.push(toAssistantToolCallMessage(message))

    const toolResultMessages: OpenAI.Chat.ChatCompletionMessageParam[] = []
    for (const toolCall of toolCalls) {
      if (toolCall.type !== 'function') {
        continue
      }

      const tool = tools.find(t => t.name === toolCall.function.name)
      const args = parseToolArgs(toolCall.function.arguments)

      yield { type: 'tool_call', callId: toolCall.id, name: toolCall.function.name, input: args }

      let result: string
      let ok = true

      try {
        if (!tool) {
          throw new Error(`Tool "${toolCall.function.name}" is not available`)
        }

        if (requestApproval) {
          const decision = await requestApproval(toolCall.id, toolCall.function.name, args)
          if (!decision.approved) {
            result = formatDeniedToolResult(decision)
            ok = false
            yield { type: 'tool_result', callId: toolCall.id, name: toolCall.function.name, result, ok }
            toolResultMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: result })
            continue
          }
        }

        console.log(`[ToolCall] ${toolCall.function.name} ${formatLogValue(args)}`)
        result = await tool.execute(args)
        console.log(`[ToolResult] ${toolCall.function.name} ok length=${result.length}`)
      }
      catch (error) {
        result = `Error: ${error instanceof Error ? error.message : String(error)}`
        ok = false
        console.warn(`[ToolResult] ${toolCall.function.name} error="${escapeLogMessage(result)}"`)
      }

      yield { type: 'tool_result', callId: toolCall.id, name: toolCall.function.name, result, ok }
      toolResultMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: result })
    }

    requestMessages.push(...toolResultMessages)
  }

  console.warn(`[LLM] Reached tool-call limit (${maxToolCallRounds}); requesting final answer without tools.`)
  yield { type: 'tool_limit_reached', limit: maxToolCallRounds }
  const finalResponse = await deps.requestWithRetry(() => deps.client.chat.completions.create({
    model: deps.model,
    messages: [
      ...requestMessages,
      {
        role: 'system',
        content: finalInstruction,
      },
    ],
  }), { abortSignal, onRateLimitRetry })

  const finalMessage = finalResponse.choices[0]?.message
  if (!finalMessage) {
    throw new Error('LLM returned empty response after tool-call limit')
  }

  if (finalMessage.content) {
    for (const segment of splitSegments(finalMessage.content)) {
      yield { type: 'text_chunk', content: segment }
    }
  }

  yield { type: 'done', content: finalMessage.content ?? '' }
}

function toOpenAIMessage(msg: ChatMessage): OpenAI.Chat.ChatCompletionMessageParam {
  if (msg.role === 'system') {
    const text = typeof msg.content === 'string' ? msg.content : msg.content.map(p => p.type === 'text' ? p.text : '').join('')
    return { role: 'system', content: text }
  }

  if (msg.role === 'assistant') {
    const text = typeof msg.content === 'string' ? msg.content : msg.content.map(p => p.type === 'text' ? p.text : '').join('')
    return { role: 'assistant', content: text }
  }

  if (typeof msg.content === 'string') {
    return { role: 'user', content: msg.content }
  }

  return {
    role: 'user',
    content: msg.content.map(p =>
      p.type === 'text'
        ? { type: 'text' as const, text: p.text }
        : { type: 'image_url' as const, image_url: { url: p.image_url.url } },
    ),
  }
}

function buildToolDefinitions(tools: LLMTool[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

async function executeToolCalls(
  deps: OpenAIProviderDeps,
  assistantMessage: OpenAI.Chat.ChatCompletionMessage,
  tools: LLMTool[],
  options: LLMChatOptions,
): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
  const toolCallMessages: OpenAI.Chat.ChatCompletionMessageParam[] = []

  for (const toolCall of assistantMessage.tool_calls ?? []) {
    if (toolCall.type !== 'function') {
      continue
    }

    const tool = tools.find(t => t.name === toolCall.function.name)

    let result: string
    try {
      if (!tool) {
        throw new Error(`Tool "${toolCall.function.name}" is not available`)
      }

      const args = parseToolArgs(toolCall.function.arguments)

      if (options.requestApproval) {
        const decision = await options.requestApproval(toolCall.id, tool.name, args)
        if (!decision.approved) {
          result = formatDeniedToolResult(decision)
          toolCallMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          })
          continue
        }
      }

      console.log(`[ToolCall] ${tool.name} ${formatLogValue(args)}`)
      result = await tool.execute(args)
      console.log(`[ToolResult] ${tool.name} ok length=${result.length}`)
    }
    catch (error) {
      result = `Error: ${error instanceof Error ? error.message : String(error)}`
      console.warn(`[ToolResult] ${toolCall.function.name} error="${escapeLogMessage(result)}"`)
    }

    toolCallMessages.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: result,
    })
  }

  return toolCallMessages
}

function toAssistantToolCallMessage(
  message: OpenAI.Chat.ChatCompletionMessage,
): OpenAI.Chat.ChatCompletionAssistantMessageParam {
  const functionToolCalls = (message.tool_calls ?? [])
    .filter((toolCall): toolCall is OpenAI.Chat.ChatCompletionMessageFunctionToolCall =>
      toolCall.type === 'function',
    )

  return {
    role: 'assistant',
    content: message.content ?? '',
    ...(functionToolCalls.length
      ? {
          tool_calls: functionToolCalls.map(toolCall => ({
            id: toolCall.id,
            type: 'function',
            function: {
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            },
          })),
        }
      : {}),
  }
}

function parseToolArgs(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>
  }
  catch {
    return {}
  }
}
