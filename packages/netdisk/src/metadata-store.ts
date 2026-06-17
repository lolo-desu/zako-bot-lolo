import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname } from 'path'

export interface NetdiskFileRecord {
  id: string
  tokenHash: string
  originalName: string
  storedName: string
  mimeType: string
  size: number
  createdAt: string
  expiresAt: string
  uploadedBy: 'admin' | 'bot'
}

export interface NetdiskShareRecord {
  id: string
  tokenHash: string
  name: string
  fileIds: string[]
  createdAt: string
  expiresAt: string
  uploadedBy: 'admin' | 'bot'
}

interface MetadataFile {
  files: NetdiskFileRecord[]
  shares: NetdiskShareRecord[]
}

export class MetadataStore {
  constructor(private readonly filePath: string) {}

  async list(): Promise<NetdiskFileRecord[]> {
    return (await this.read()).files
  }

  async listShares(): Promise<NetdiskShareRecord[]> {
    return (await this.read()).shares
  }

  async get(id: string): Promise<NetdiskFileRecord | null> {
    const metadata = await this.read()
    return metadata.files.find(file => file.id === id) ?? null
  }

  async getShare(id: string): Promise<NetdiskShareRecord | null> {
    const metadata = await this.read()
    return metadata.shares.find(share => share.id === id) ?? null
  }

  async add(record: NetdiskFileRecord): Promise<void> {
    const metadata = await this.read()
    metadata.files = metadata.files.filter(file => file.id !== record.id)
    metadata.files.push(record)
    await this.write(metadata)
  }

  async addShare(record: NetdiskShareRecord): Promise<void> {
    const metadata = await this.read()
    metadata.shares = metadata.shares.filter(share => share.id !== record.id)
    metadata.shares.push(record)
    await this.write(metadata)
  }

  async delete(id: string): Promise<NetdiskFileRecord | null> {
    const metadata = await this.read()
    const existing = metadata.files.find(file => file.id === id) ?? null
    if (!existing) {
      return null
    }

    metadata.files = metadata.files.filter(file => file.id !== id)
    metadata.shares = metadata.shares
      .map(share => ({ ...share, fileIds: share.fileIds.filter(fileId => fileId !== id) }))
      .filter(share => share.fileIds.length > 0)
    await this.write(metadata)
    return existing
  }

  async replace(records: NetdiskFileRecord[], shares?: NetdiskShareRecord[]): Promise<void> {
    const metadata = await this.read()
    await this.write({ files: records, shares: shares ?? metadata.shares })
  }

  private async read(): Promise<MetadataFile> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<MetadataFile>
      return {
        files: Array.isArray(parsed.files) ? parsed.files.filter(isFileRecord) : [],
        shares: Array.isArray(parsed.shares) ? parsed.shares.filter(isShareRecord) : [],
      }
    }
    catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return { files: [], shares: [] }
      }

      throw error
    }
  }

  private async write(metadata: MetadataFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const tempPath = `${this.filePath}.tmp`
    await writeFile(tempPath, JSON.stringify(metadata, null, 2), 'utf8')
    await rename(tempPath, this.filePath)
  }
}

function isFileRecord(value: unknown): value is NetdiskFileRecord {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  return typeof record.id === 'string'
    && typeof record.tokenHash === 'string'
    && typeof record.originalName === 'string'
    && typeof record.storedName === 'string'
    && typeof record.mimeType === 'string'
    && typeof record.size === 'number'
    && typeof record.createdAt === 'string'
    && typeof record.expiresAt === 'string'
    && (record.uploadedBy === 'admin' || record.uploadedBy === 'bot')
}

function isShareRecord(value: unknown): value is NetdiskShareRecord {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  return typeof record.id === 'string'
    && typeof record.tokenHash === 'string'
    && typeof record.name === 'string'
    && Array.isArray(record.fileIds)
    && record.fileIds.every(item => typeof item === 'string')
    && typeof record.createdAt === 'string'
    && typeof record.expiresAt === 'string'
    && (record.uploadedBy === 'admin' || record.uploadedBy === 'bot')
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
