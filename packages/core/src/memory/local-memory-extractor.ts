import type { ChatMessage } from '@zakobot/shared'

export type ExtractedMemoryItem = {
  memory: string
  kind: string
}

const MEMORY_EXTRACTION_PROMPT = '你是长期记忆提炼器。请从这轮对话中只提炼对未来互动稳定有帮助的信息，并返回严格 JSON 数组。每项格式为 {"memory": string, "kind": "preference"|"constraint"|"profile"|"project"|"fact"}。最多返回 3 项。不要输出 markdown，不要解释。不要记录一次性任务、短期状态、敏感信息、密码、token、密钥、验证码，或明显会过期的信息。'

export function buildMemoryExtractionMessages(userContent: string, assistantContent: string): ChatMessage[] {
  const trimmedUser = truncateContent(userContent)
  const trimmedAssistant = truncateContent(assistantContent)

  if (!trimmedUser || !trimmedAssistant) {
    return []
  }

  return [
    {
      role: 'system',
      content: MEMORY_EXTRACTION_PROMPT,
    },
    {
      role: 'user',
      content: `用户消息：${trimmedUser}\n助手回复：${trimmedAssistant}`,
    },
  ]
}

export function parseExtractedMemories(value: string): ExtractedMemoryItem[] {
  const jsonText = extractJsonArray(value)
  if (!jsonText) {
    return []
  }

  try {
    const parsed = JSON.parse(jsonText) as Array<{ memory?: unknown, kind?: unknown }>
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map(item => ({
        memory: typeof item.memory === 'string' ? item.memory.trim() : '',
        kind: typeof item.kind === 'string' ? item.kind.trim() : 'fact',
      }))
      .filter(item => item.memory)
      .slice(0, 3)
  }
  catch {
    return []
  }
}

function extractJsonArray(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
  }

  const blockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (blockMatch?.[1]) {
    const block = blockMatch[1].trim()
    if (block.startsWith('[') && block.endsWith(']')) {
      return block
    }
  }

  const start = trimmed.indexOf('[')
  const end = trimmed.lastIndexOf(']')
  if (start !== -1 && end > start) {
    return trimmed.slice(start, end + 1)
  }

  return ''
}

function truncateContent(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 1500) {
    return normalized
  }

  return `${normalized.slice(0, 1499).trimEnd()}…`
}
