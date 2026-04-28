export type LlmProviderFormat = 'openai' | 'google' | 'vertex'

export interface BuiltinLlmProviderTemplate {
  name: string
  format: LlmProviderFormat
  defaultBaseUrl: string
}

export const BUILTIN_LLM_PROVIDER_TEMPLATES: BuiltinLlmProviderTemplate[] = [
  {
    name: 'OpenAI',
    format: 'openai',
    defaultBaseUrl: 'https://api.openai.com',
  },
  {
    name: 'DeepSeek',
    format: 'openai',
    defaultBaseUrl: 'https://api.deepseek.com',
  },
  {
    name: 'Google AI Studio',
    format: 'google',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
  },
  {
    name: 'Google Vertex AI',
    format: 'vertex',
    defaultBaseUrl: 'https://aiplatform.googleapis.com',
  },
]

export interface LlmProviderEditorInput {
  name: string
  format: LlmProviderFormat
  baseUrl: string
  apiKey: string
  enabled: boolean
  enabledModels: string[]
  disabledModels: string[]
  region: string
  builtin: boolean
}

export interface LlmProviderProfile extends LlmProviderEditorInput {
  id: string
  createdAt: string
  updatedAt: string
}

type Task4BridgeConfig = Pick<LlmProviderEditorInput, 'format' | 'apiKey' | 'baseUrl'>
type Task4BotSelectableProvider = Pick<LlmProviderEditorInput, 'enabled' | 'format' | 'apiKey' | 'baseUrl'>

interface VertexServiceAccountCredentials {
  type: string
  private_key?: string
  client_email?: string
}

export function isTask4BridgeCompatibleProviderFormat(format: LlmProviderFormat) {
  return format === 'openai'
}

export function isVertexServiceAccountApiKey(apiKey: string) {
  try {
    const parsed = JSON.parse(apiKey) as VertexServiceAccountCredentials
    return parsed.type === 'service_account' && Boolean(parsed.private_key) && Boolean(parsed.client_email)
  }
  catch {
    return false
  }
}

export function hasTask4BridgeRuntimeConfig(provider: Task4BridgeConfig) {
  if (!isTask4BridgeCompatibleProviderFormat(provider.format)) {
    return false
  }

  if (provider.baseUrl.trim().length === 0) {
    return false
  }

  if (provider.apiKey.trim().length === 0) {
    return false
  }

  return !isVertexServiceAccountApiKey(provider.apiKey)
}

export function isTask4BotSelectableProvider(provider: Task4BotSelectableProvider) {
  return provider.enabled
    && isTask4BridgeCompatibleProviderFormat(provider.format)
    && hasTask4BridgeRuntimeConfig(provider)
}
