export interface MemorySettings {
  enabled: boolean
  provider: 'mem0'
  apiKey: string
  baseUrl: string
  topK: number
  maxMemories: number
  maxPromptChars: number
  timeoutMs: number
  writebackEnabled: boolean
}
