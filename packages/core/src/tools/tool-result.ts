import type { LLMToolExecuteResult, ToolExecutionArtifact } from '@zakobot/shared'

export interface NormalizedToolExecutionResult {
  content: string
  artifacts: ToolExecutionArtifact[]
}

export function normalizeToolExecutionResult(result: LLMToolExecuteResult): NormalizedToolExecutionResult {
  if (typeof result === 'string') {
    return {
      content: result,
      artifacts: [],
    }
  }

  return {
    content: result.content,
    artifacts: Array.isArray(result.artifacts)
      ? result.artifacts.filter(isImageArtifact)
      : [],
  }
}

function isImageArtifact(value: unknown): value is ToolExecutionArtifact {
  if (!value || typeof value !== 'object') {
    return false
  }

  const artifact = value as Partial<ToolExecutionArtifact>
  return artifact.kind === 'image'
    && typeof artifact.filePath === 'string'
    && artifact.filePath.trim().length > 0
    && typeof artifact.fileName === 'string'
    && artifact.fileName.trim().length > 0
    && artifact.mimeType === 'image/png'
}
