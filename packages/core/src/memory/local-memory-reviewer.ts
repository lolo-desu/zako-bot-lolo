import type { ChatMessage } from '@zakobot/shared'

export type ReviewedMemoryItem = {
  memory: string
  kind: string
}

export type ReviewedMemoryParseResult = {
  items: ReviewedMemoryItem[]
  malformed: boolean
}

const MEMORY_REVIEW_PROMPT = '你是长期记忆复核器。请结合最近对话和已有长期记忆，只输出值得新增或更新的稳定长期记忆，并返回严格 JSON 数组。每项格式为 {"memory": string, "kind": "preference"|"constraint"|"profile"|"project"|"fact"}。如果没有需要新增或更新的内容，返回 []。不要输出 markdown，不要解释。不要记录一次性任务、短期状态、敏感信息、密码、token、密钥、验证码，或明显会过期的信息。'

export function buildMemoryReviewMessages(recentMessages: ChatMessage[], existingMemories: string[]): ChatMessage[] {
  const recentLines = recentMessages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map(message => {
      const content = truncateContent(normalizeContent(message.content))
      if (!content) {
        return ''
      }

      const speaker = message.role === 'user' ? '用户' : '助手'
      return `${speaker}：${content}`
    })
    .filter(Boolean)
    .slice(-12)

  if (recentLines.length === 0) {
    return []
  }

  const memoryLines = existingMemories
    .map(memory => truncateContent(memory))
    .filter(Boolean)
    .slice(0, 20)

  return [
    {
      role: 'system',
      content: MEMORY_REVIEW_PROMPT,
    },
    {
      role: 'user',
      content: [
        '最近对话：',
        ...recentLines,
        '',
        '已有长期记忆：',
        ...(memoryLines.length > 0 ? memoryLines.map(memory => `- ${memory}`) : ['(无)']),
      ].join('\n'),
    },
  ]
}

export function parseReviewedMemories(value: string): ReviewedMemoryParseResult {
  const jsonText = extractJsonArray(value)
  if (!jsonText) {
    return { items: [], malformed: true }
  }

  try {
    const parsed = JSON.parse(jsonText) as Array<{ memory?: unknown, kind?: unknown }>
    if (!Array.isArray(parsed)) {
      return { items: [], malformed: true }
    }

    return {
      items: parsed
        .map(item => ({
          memory: typeof item.memory === 'string' ? item.memory.trim() : '',
          kind: typeof item.kind === 'string' ? item.kind.trim() : 'fact',
        }))
        .filter(item => item.memory)
        .slice(0, 5),
      malformed: false,
    }
  }
  catch {
    return { items: [], malformed: true }
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

function normalizeContent(content: ChatMessage['content']): string {
  if (typeof content === 'string') {
    return content.replace(/\s+/g, ' ').trim()
  }

  return content
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncateContent(value: string): string {
  if (value.length <= 600) {
    return value
  }

  return `${value.slice(0, 599).trimEnd()}…`
}
