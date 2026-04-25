// Provider is a display label only — actual API calls always use OpenAI-compatible format
export type LLMProvider = 'openai' | 'anthropic' | 'openrouter' | 'custom'

export interface LLMConfig {
  provider: LLMProvider
  model: string
  apiKey: string
  /** Custom base URL for OpenAI-compatible endpoints. Defaults to OpenAI if omitted. */
  baseUrl?: string
}

export interface ToolExecutionArtifact {
  kind: 'image'
  filePath: string
  fileName: string
  mimeType: 'image/png'
  alt?: string
}

export interface ToolExecutionResult {
  content: string
  artifacts?: ToolExecutionArtifact[]
}

export type LLMToolExecuteResult = string | ToolExecutionResult

export interface LLMTool {
  name: string
  description: string
  /** Prompt instructions injected when this tool is enabled for a role. */
  instructions?: string
  /** Whether this tool requires explicit user approval in sensitive mode. */
  sensitive?: boolean
  parameters: Record<string, unknown>
  execute: (args: Record<string, unknown>) => Promise<LLMToolExecuteResult>
}

export interface ChatMessageTextPart {
  type: 'text'
  text: string
}

export interface ChatMessageImagePart {
  type: 'image_url'
  image_url: { url: string }
}

export type ChatMessageContentPart = ChatMessageTextPart | ChatMessageImagePart

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ChatMessageContentPart[]
}
