export function splitSegments(text: string, maxLength = 1800): string[] {
  const paragraphs = text.split(/\n{2,}/).map(segment => segment.trim()).filter(Boolean)
  const result: string[] = []

  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxLength) {
      result.push(paragraph)
      continue
    }

    for (let i = 0; i < paragraph.length; i += maxLength) {
      result.push(paragraph.slice(i, i + maxLength))
    }
  }

  return result
}

export function formatDeniedToolResult(decision: { reason?: string, guidance?: string }): string {
  return decision.guidance?.trim()
    ? `User denied this tool call. Guidance: ${decision.guidance.trim()}`
    : decision.reason?.trim()
        ? `User denied this tool call. Reason: ${decision.reason.trim()}`
        : 'User denied this tool call.'
}

export function formatLogValue(value: unknown): string {
  try {
    return truncateLogMessage(JSON.stringify(value))
  }
  catch {
    return '[unserializable]'
  }
}

export function escapeLogMessage(value: string): string {
  return truncateLogMessage(value).replaceAll('"', '\\"')
}

function truncateLogMessage(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > 500 ? `${normalized.slice(0, 500)}...` : normalized
}
