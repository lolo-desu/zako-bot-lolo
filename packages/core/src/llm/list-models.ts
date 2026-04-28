import type { LLMConfig } from '@zakobot/shared'

interface ServiceAccountCreds {
  type: string
  private_key: string
  client_email: string
}

type ModelListConfig = Pick<LLMConfig, 'apiKey' | 'baseUrl'> & {
  platformName?: string
}

export type ModelListFormat = 'openai' | 'google' | 'vertex'

function parseServiceAccount(apiKey: string) {
  try {
    const parsed = JSON.parse(apiKey) as ServiceAccountCreds
    if (parsed.type === 'service_account' && parsed.private_key && parsed.client_email) {
      return parsed
    }
    return null
  }
  catch {
    return null
  }
}

export function detectModelListFormat(config: ModelListConfig): ModelListFormat {
  const baseUrl = config.baseUrl?.toLowerCase() ?? ''
  const platformName = config.platformName?.toLowerCase() ?? ''

  if (parseServiceAccount(config.apiKey) || baseUrl.includes('aiplatform.googleapis.com') || platformName.includes('vertex')) {
    return 'vertex'
  }

  if (baseUrl.includes('generativelanguage.googleapis.com') || platformName.includes('google')) {
    return 'google'
  }

  return 'openai'
}

async function fetchOpenAIModels(baseUrl: string, apiKey: string) {
  const url = buildModelListUrl(baseUrl, 'v1')
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`模型平台返回 ${response.status}: ${text.slice(0, 200)}`)
  }

  const data = await response.json() as { data?: { id: string }[] }
  return (data.data ?? [])
    .map(item => item.id)
    .sort((a, b) => a.localeCompare(b))
}

async function fetchGoogleModels(baseUrl: string, apiKey: string) {
  const url = buildModelListUrl(baseUrl, 'v1beta')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('pageSize', '100')

  const response = await fetch(url.toString())
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`模型平台返回 ${response.status}: ${text.slice(0, 200)}`)
  }

  const data = await response.json() as {
    models?: { name: string; supportedGenerationMethods?: string[] }[]
  }

  return (data.models ?? [])
    .filter(item => item.supportedGenerationMethods?.includes('generateContent'))
    .map(item => item.name.replace(/^models\//, ''))
    .sort((a, b) => a.localeCompare(b))
}

function buildModelListUrl(baseUrl: string, versionSegment: 'v1' | 'v1beta') {
  const url = new URL(baseUrl)
  const basePath = url.pathname.replace(/\/+$/, '')

  url.pathname = (basePath.endsWith(`/${versionSegment}`)
    ? `${basePath}/models`
    : `${basePath}/${versionSegment}/models`
  ).replace(/\/+/g, '/')

  return url
}

export async function fetchAvailableModels(config: ModelListConfig) {
  if (!config.baseUrl?.trim()) {
    throw new Error('当前 bot 未配置模型 base URL。')
  }

  if (!config.apiKey?.trim()) {
    throw new Error('当前 bot 未配置模型 API Key。')
  }

  const format = detectModelListFormat(config)
  if (format === 'vertex') {
    throw new Error('当前模型平台暂不支持拉取模型列表（Vertex AI）。')
  }

  try {
    return format === 'google'
      ? await fetchGoogleModels(config.baseUrl, config.apiKey)
      : await fetchOpenAIModels(config.baseUrl, config.apiKey)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`拉取模型列表失败：${message}`)
  }
}
