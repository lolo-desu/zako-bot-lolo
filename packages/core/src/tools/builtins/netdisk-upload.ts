import { readFile, stat } from 'fs/promises'
import { basename } from 'path'
import type { LLMTool } from '@zakobot/shared'

const DEFAULT_NETDISK_API_URL = 'http://127.0.0.1:6330'
const DEFAULT_MAX_FILE_BYTES = 100 * 1024 * 1024
const DEFAULT_TTL_HOURS = 48

interface NetdiskUploadResponse {
  ok?: boolean
  data?: {
    id?: string
    url?: string
    expiresAt?: string
  }
  error?: string
}

interface NetdiskShareResponse {
  ok?: boolean
  data?: {
    id?: string
    url?: string
    expiresAt?: string
    files?: Array<{ id: string, originalName: string }>
  }
  error?: string
}

export function createNetdiskUploadTool(): LLMTool {
  return {
    name: 'netdisk_upload',
    description: 'Upload one or more local files to the configured ZakoBot netdisk service. A single file returns a direct 48-hour expiring download URL; multiple files return a 48-hour expiring web page listing all files.',
    sensitive: true,
    instructions: [
      '使用 netdisk_upload 将本地文件发布到网盘并获取下载链接。',
      '上传单个文件时使用 path；上传多个文件时使用 paths，工具会返回一个网页列表链接。',
      '只上传用户明确需要分享的文件；不要上传密钥、token、私密配置或无关本地文件。',
      '返回给用户时说明链接默认 48 小时后过期。',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Local file path to upload. Use this for a single file.',
        },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Local file paths to upload together. Use this for multiple files; the result is a share page URL listing all files.',
        },
        name: {
          type: 'string',
          description: 'Optional download filename for one file, or share page title for multiple files.',
        },
        ttlHours: {
          type: 'number',
          description: 'URL lifetime in hours. Defaults to 48 and cannot exceed the netdisk service maximum.',
        },
        mimeType: {
          type: 'string',
          description: 'Optional MIME type for single-file uploads. Defaults to application/octet-stream on the netdisk service.',
        },
      },
      additionalProperties: false,
    },
    execute: async (args) => {
      const filePaths = getFilePaths(args)
      const token = process.env.NETDISK_INTERNAL_TOKEN?.trim()
      if (!token) {
        throw new Error('NETDISK_INTERNAL_TOKEN is required to upload files to netdisk')
      }

      const apiUrl = (process.env.NETDISK_API_URL?.trim() || DEFAULT_NETDISK_API_URL).replace(/\/+$/, '')
      const ttlHours = normalizeTtlHours(args.ttlHours)
      const uploaded = []

      for (const filePath of filePaths) {
        const info = await stat(filePath)
        if (!info.isFile()) {
          throw new Error(`${filePath} is not a regular file`)
        }

        const maxBytes = getMaxFileBytes()
        if (info.size > maxBytes) {
          throw new Error(`File is too large (${info.size} bytes, limit ${maxBytes}): ${filePath}`)
        }

        const content = await readFile(filePath)
        const payload = {
          name: filePaths.length === 1 && typeof args.name === 'string' && args.name.trim() ? args.name.trim() : basename(filePath),
          mimeType: filePaths.length === 1 && typeof args.mimeType === 'string' && args.mimeType.trim() ? args.mimeType.trim() : undefined,
          ttlHours,
          contentBase64: content.toString('base64'),
        }

        const result = await postJson<NetdiskUploadResponse>(`${apiUrl}/api/files`, token, payload)
        const id = result.data?.id
        const url = result.data?.url
        const expiresAt = result.data?.expiresAt
        if (!id || !url || !expiresAt) {
          throw new Error('Netdisk upload response is missing id, url, or expiresAt')
        }

        uploaded.push({ id, path: filePath, url, expiresAt })
      }

      if (uploaded.length === 1) {
        const file = uploaded[0]!
        return `Uploaded ${file.path} to netdisk. Download URL: ${file.url}\nExpires at: ${file.expiresAt}`
      }

      const shareResult = await postJson<NetdiskShareResponse>(`${apiUrl}/api/shares`, token, {
        name: typeof args.name === 'string' && args.name.trim() ? args.name.trim() : 'shared-files',
        fileIds: uploaded.map(file => file.id),
        ttlHours,
      })
      const shareUrl = shareResult.data?.url
      const expiresAt = shareResult.data?.expiresAt
      if (!shareUrl || !expiresAt) {
        throw new Error('Netdisk share response is missing url or expiresAt')
      }

      return [
        `Uploaded ${uploaded.length} files to netdisk. Share page URL: ${shareUrl}`,
        `Expires at: ${expiresAt}`,
        'Files:',
        ...uploaded.map(file => `- ${file.path}`),
      ].join('\n')
    },
  }
}

function getFilePaths(args: Record<string, unknown>): string[] {
  if (Array.isArray(args.paths)) {
    const paths = args.paths.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map(item => item.trim())
    if (paths.length > 0) {
      return paths
    }
  }

  return [getString(args.path, 'path')]
}

function getString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} is required`)
  }

  return value.trim()
}

function getMaxFileBytes(): number {
  const configured = Number(process.env.NETDISK_MAX_FILE_BYTES)
  return Number.isFinite(configured) && configured > 0 ? Math.trunc(configured) : DEFAULT_MAX_FILE_BYTES
}

function normalizeTtlHours(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_TTL_HOURS
  }

  const ttl = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(ttl) || ttl <= 0) {
    throw new Error('ttlHours must be a positive number')
  }

  return Math.min(ttl, DEFAULT_TTL_HOURS)
}

async function postJson<T extends { ok?: boolean, error?: string }>(url: string, token: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const result = await parseResponse<T>(response)
  if (!response.ok || result.ok === false) {
    throw new Error(result.error || `Netdisk request failed with status ${response.status}`)
  }
  return result
}

async function parseResponse<T>(response: Response): Promise<T & { error?: string }> {
  const text = await response.text()
  if (!text.trim()) {
    return {} as T & { error?: string }
  }

  try {
    return JSON.parse(text) as T & { error?: string }
  }
  catch {
    return { error: text } as T & { error?: string }
  }
}
