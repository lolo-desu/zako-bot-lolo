import { randomUUID } from 'crypto'
import { mkdir, readdir, rm, stat, writeFile } from 'fs/promises'
import { createReadStream } from 'fs'
import { resolve } from 'path'
import type { ReadStream } from 'fs'
import type { NetdiskConfig } from './config.js'
import { normalizeTtlHours } from './config.js'
import { hashToken, randomToken, verifyToken } from './auth.js'
import { ensureInside, sanitizeFilename, sanitizeMimeType } from './file-safety.js'
import { MetadataStore, type NetdiskFileRecord, type NetdiskShareRecord } from './metadata-store.js'

export interface UploadInput {
  name?: string
  mimeType?: string
  contentBase64?: string
  ttlHours?: number
  uploadedBy: 'admin' | 'bot'
}

export interface CreateShareInput {
  name?: string
  fileIds: string[]
  ttlHours?: number
  uploadedBy: 'admin' | 'bot'
}

export interface UploadResult {
  id: string
  url: string
  expiresAt: string
}

export interface ShareResult {
  id: string
  url: string
  expiresAt: string
  files: PublicFileProfile[]
}

export interface SharePageResult {
  share: NetdiskShareRecord
  files: PublicFileProfile[]
}

export interface DownloadResult {
  record: NetdiskFileRecord
  stream: ReadStream
}

export interface PublicFileProfile {
  id: string
  originalName: string
  mimeType: string
  size: number
  createdAt: string
  expiresAt: string
  uploadedBy: 'admin' | 'bot'
  expired: boolean
}

export class NetdiskService {
  readonly store: MetadataStore

  constructor(readonly config: NetdiskConfig) {
    this.store = new MetadataStore(config.metadataPath)
  }

  async init(): Promise<void> {
    await mkdir(this.config.filesDir, { recursive: true })
    await this.cleanupExpired()
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    if (!input.contentBase64) {
      throw new HttpError(400, 'contentBase64 is required')
    }

    const content = decodeBase64(input.contentBase64)
    if (content.byteLength > this.config.maxFileBytes) {
      throw new HttpError(413, `File is too large (${content.byteLength} bytes, limit ${this.config.maxFileBytes})`)
    }

    const ttlHours = normalizeTtlHours(input.ttlHours, this.config)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000)
    const id = randomUUID()
    const token = randomToken()
    const originalName = sanitizeFilename(input.name)
    const storedName = id
    const filePath = this.filePath(storedName)

    await writeFile(filePath, content)

    await this.store.add({
      id,
      tokenHash: hashToken(token),
      originalName,
      storedName,
      mimeType: sanitizeMimeType(input.mimeType),
      size: content.byteLength,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      uploadedBy: input.uploadedBy,
    })

    return {
      id,
      url: this.downloadUrl(id, token, originalName),
      expiresAt: expiresAt.toISOString(),
    }
  }

  async createShare(input: CreateShareInput): Promise<ShareResult> {
    const uniqueFileIds = Array.from(new Set(input.fileIds.filter(Boolean)))
    if (uniqueFileIds.length === 0) {
      throw new HttpError(400, 'fileIds is required')
    }

    const records = await this.store.list()
    const recordById = new Map(records.map(record => [record.id, record]))
    const nowMs = Date.now()
    const selected: NetdiskFileRecord[] = []

    for (const fileId of uniqueFileIds) {
      const record = recordById.get(fileId)
      if (!record) {
        throw new HttpError(404, `File not found: ${fileId}`)
      }
      if (Date.parse(record.expiresAt) <= nowMs) {
        throw new HttpError(410, `File link has expired: ${fileId}`)
      }
      selected.push(record)
    }

    const ttlHours = normalizeTtlHours(input.ttlHours, this.config)
    const now = new Date()
    const requestedExpiresAt = now.getTime() + ttlHours * 60 * 60 * 1000
    const earliestFileExpiry = Math.min(...selected.map(record => Date.parse(record.expiresAt)))
    const expiresAt = new Date(Math.min(requestedExpiresAt, earliestFileExpiry))
    const id = randomUUID()
    const token = randomToken()
    const name = sanitizeFilename(input.name || 'shared-files')

    await this.store.addShare({
      id,
      tokenHash: hashToken(token),
      name,
      fileIds: selected.map(record => record.id),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      uploadedBy: input.uploadedBy,
    })

    return {
      id,
      url: this.shareUrl(id, token),
      expiresAt: expiresAt.toISOString(),
      files: selected.map(record => this.toPublicFileProfile(record, nowMs)),
    }
  }

  async getSharePage(id: string, token: string): Promise<SharePageResult> {
    const share = await this.store.getShare(id)
    if (!share) {
      throw new HttpError(404, 'Share not found')
    }

    if (Date.parse(share.expiresAt) <= Date.now()) {
      throw new HttpError(410, 'Share link has expired')
    }

    if (!verifyToken(token, share.tokenHash)) {
      throw new HttpError(404, 'Share not found')
    }

    const records = await this.store.list()
    const recordById = new Map(records.map(record => [record.id, record]))
    const nowMs = Date.now()
    const files = share.fileIds
      .map(fileId => recordById.get(fileId))
      .filter((record): record is NetdiskFileRecord => Boolean(record))
      .filter(record => Date.parse(record.expiresAt) > nowMs)
      .map(record => this.toPublicFileProfile(record, nowMs))

    if (files.length === 0) {
      throw new HttpError(410, 'Share link has expired')
    }

    return { share, files }
  }

  async downloadFromShare(shareId: string, token: string, fileId: string): Promise<DownloadResult> {
    const page = await this.getSharePage(shareId, token)
    if (!page.share.fileIds.includes(fileId)) {
      throw new HttpError(404, 'File not found')
    }

    const record = await this.store.get(fileId)
    if (!record || Date.parse(record.expiresAt) <= Date.now()) {
      throw new HttpError(410, 'File link has expired')
    }

    const path = this.filePath(record.storedName)
    try {
      const info = await stat(path)
      if (!info.isFile()) {
        throw new HttpError(404, 'File not found')
      }
    }
    catch (error) {
      if (error instanceof HttpError) {
        throw error
      }
      throw new HttpError(404, 'File not found')
    }

    return { record, stream: createReadStream(path) }
  }

  async listFiles(): Promise<PublicFileProfile[]> {
    const now = Date.now()
    return (await this.store.list())
      .slice()
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map(record => this.toPublicFileProfile(record, now))
  }

  async deleteFile(id: string): Promise<boolean> {
    const record = await this.store.delete(id)
    if (!record) {
      return false
    }

    await rm(this.filePath(record.storedName), { force: true })
    return true
  }

  async download(id: string, token: string): Promise<DownloadResult> {
    const record = await this.store.get(id)
    if (!record) {
      throw new HttpError(404, 'File not found')
    }

    if (Date.parse(record.expiresAt) <= Date.now()) {
      await this.deleteFile(record.id)
      throw new HttpError(410, 'File link has expired')
    }

    if (!verifyToken(token, record.tokenHash)) {
      throw new HttpError(404, 'File not found')
    }

    const path = this.filePath(record.storedName)
    try {
      const info = await stat(path)
      if (!info.isFile()) {
        throw new HttpError(404, 'File not found')
      }
    }
    catch (error) {
      if (error instanceof HttpError) {
        throw error
      }
      throw new HttpError(404, 'File not found')
    }

    return {
      record,
      stream: createReadStream(path),
    }
  }

  async cleanupExpired(): Promise<number> {
    const now = Date.now()
    const records = await this.store.list()
    const liveRecords: NetdiskFileRecord[] = []
    let deleted = 0
    const liveStoredNames = new Set<string>()

    for (const record of records) {
      const path = this.filePath(record.storedName)
      let keep = Date.parse(record.expiresAt) > now
      if (keep) {
        try {
          const info = await stat(path)
          keep = info.isFile()
        }
        catch {
          keep = false
        }
      }

      if (keep) {
        liveRecords.push(record)
        liveStoredNames.add(record.storedName)
      }
      else {
        deleted += 1
        await rm(path, { force: true })
      }
    }

    await this.store.replace(liveRecords, await this.liveShares(liveRecords, now))

    try {
      for (const entry of await readdir(this.config.filesDir, { withFileTypes: true })) {
        if (!entry.isFile() || liveStoredNames.has(entry.name)) {
          continue
        }

        await rm(this.filePath(entry.name), { force: true })
        deleted += 1
      }
    }
    catch {
      // Directory may not exist during early startup; init creates it before use.
    }

    return deleted
  }

  private filePath(storedName: string): string {
    return ensureInside(this.config.filesDir, resolve(this.config.filesDir, storedName))
  }

  private toPublicFileProfile(record: NetdiskFileRecord, nowMs: number): PublicFileProfile {
    return {
      id: record.id,
      originalName: record.originalName,
      mimeType: record.mimeType,
      size: record.size,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      uploadedBy: record.uploadedBy,
      expired: Date.parse(record.expiresAt) <= nowMs,
    }
  }

  private async liveShares(liveRecords: NetdiskFileRecord[], nowMs: number): Promise<NetdiskShareRecord[]> {
    const liveFileIds = new Set(liveRecords.map(record => record.id))
    return (await this.store.listShares())
      .filter(share => Date.parse(share.expiresAt) > nowMs)
      .map(share => ({ ...share, fileIds: share.fileIds.filter(fileId => liveFileIds.has(fileId)) }))
      .filter(share => share.fileIds.length > 0)
  }

  private downloadUrl(id: string, token: string, filename: string): string {
    return `${this.config.publicUrl}/f/${encodeURIComponent(id)}/${encodeURIComponent(token)}/${encodeURIComponent(filename)}`
  }

  private shareUrl(id: string, token: string): string {
    return `${this.config.publicUrl}/s/${encodeURIComponent(id)}/${encodeURIComponent(token)}`
  }
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

function decodeBase64(value: string): Buffer {
  try {
    return Buffer.from(value, 'base64')
  }
  catch {
    throw new HttpError(400, 'contentBase64 is invalid')
  }
}
