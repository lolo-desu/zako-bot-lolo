import type { ToolApprovalCallback } from '@zakobot/shared'

export type RateLimitRetryHandler = (attempt: number, delayMs: number) => void | Promise<void>

export type LLMRequestOptions = {
  abortSignal?: AbortSignal
  onRateLimitRetry?: RateLimitRetryHandler
}

export type LLMChatOptions = LLMRequestOptions & {
  requestApproval?: ToolApprovalCallback
}

export type LLMStreamOptions = LLMRequestOptions & {
  maxToolCallRounds?: number
  requestApproval?: ToolApprovalCallback
}
