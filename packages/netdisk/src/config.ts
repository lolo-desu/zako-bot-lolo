import { homedir } from 'os'
import { resolve } from 'path'

const DEFAULT_PORT = 6330
const DEFAULT_TTL_HOURS = 48
const DEFAULT_MAX_FILE_BYTES = 100 * 1024 * 1024
const DEFAULT_CLEANUP_INTERVAL_MINUTES = 60

export interface NetdiskConfig {
  host: string
  port: number
  publicUrl: string
  storageRoot: string
  filesDir: string
  metadataPath: string
  adminUsername: string
  adminPassword: string
  internalToken: string
  maxFileBytes: number
  defaultTtlHours: number
  maxTtlHours: number
  cleanupIntervalMinutes: number
  secureCookies: boolean
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): NetdiskConfig {
  const zakobotHome = resolveConfigPath(env.ZAKOBOT_HOME) ?? resolve(homedir(), '.zakobot')
  const storageRoot = resolveConfigPath(env.NETDISK_STORAGE_DIR) ?? resolve(zakobotHome, 'netdisk')
  const host = env.NETDISK_HOST?.trim() || '127.0.0.1'
  const port = readPositiveInt(env.NETDISK_PORT, DEFAULT_PORT)
  const publicUrl = normalizeBaseUrl(env.NETDISK_PUBLIC_URL?.trim() || `http://127.0.0.1:${port}`)
  const defaultTtlHours = readPositiveNumber(env.NETDISK_DEFAULT_TTL_HOURS, DEFAULT_TTL_HOURS)
  const maxTtlHours = readPositiveNumber(env.NETDISK_MAX_TTL_HOURS, DEFAULT_TTL_HOURS)

  return {
    host,
    port,
    publicUrl,
    storageRoot,
    filesDir: resolve(storageRoot, 'files'),
    metadataPath: resolve(storageRoot, 'metadata.json'),
    adminUsername: env.NETDISK_ADMIN_USERNAME?.trim() || 'admin',
    adminPassword: env.NETDISK_ADMIN_PASSWORD ?? '123456',
    internalToken: env.NETDISK_INTERNAL_TOKEN?.trim() || '',
    maxFileBytes: readPositiveInt(env.NETDISK_MAX_FILE_BYTES, DEFAULT_MAX_FILE_BYTES),
    defaultTtlHours: Math.min(defaultTtlHours, maxTtlHours),
    maxTtlHours,
    cleanupIntervalMinutes: readPositiveNumber(env.NETDISK_CLEANUP_INTERVAL_MINUTES, DEFAULT_CLEANUP_INTERVAL_MINUTES),
    secureCookies: env.NODE_ENV === 'production' || env.NETDISK_SECURE_COOKIES === 'true',
  }
}

export function normalizeTtlHours(value: unknown, config: Pick<NetdiskConfig, 'defaultTtlHours' | 'maxTtlHours'>): number {
  if (value === undefined || value === null || value === '') {
    return config.defaultTtlHours
  }

  const ttl = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(ttl) || ttl <= 0) {
    throw new Error('ttlHours must be a positive number')
  }

  return Math.min(ttl, config.maxTtlHours)
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback
}

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

function resolveConfigPath(value: string | undefined): string | undefined {
  const raw = value?.trim()
  if (!raw) {
    return undefined
  }

  if (raw === '~') {
    return homedir()
  }

  if (raw.startsWith('~/') || raw.startsWith('~\\')) {
    return resolve(homedir(), raw.slice(2))
  }

  return resolve(raw)
}
