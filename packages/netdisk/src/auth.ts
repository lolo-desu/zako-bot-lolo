import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import type http from 'http'
import type { NetdiskConfig } from './config.js'

const SESSION_COOKIE_NAME = 'zakobot_netdisk_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24

export interface AuthResult {
  ok: boolean
  sessionToken?: string
}

export class NetdiskAuth {
  private readonly passwordSalt = randomBytes(16).toString('hex')
  private readonly passwordHash: Buffer
  private readonly sessions = new Set<string>()

  constructor(private readonly config: NetdiskConfig) {
    this.passwordHash = Buffer.from(hashPassword(config.adminPassword, this.passwordSalt), 'hex')
  }

  login(username: string, password: string): AuthResult {
    if (username !== this.config.adminUsername || !this.verifyPassword(password)) {
      return { ok: false }
    }

    const sessionToken = randomToken()
    this.sessions.add(sessionToken)
    return { ok: true, sessionToken }
  }

  logout(req: http.IncomingMessage) {
    const token = this.getSessionToken(req)
    if (token) {
      this.sessions.delete(token)
    }
  }

  isAdminRequest(req: http.IncomingMessage): boolean {
    return this.hasValidSession(req) || this.hasValidBearer(req)
  }

  hasValidSession(req: http.IncomingMessage): boolean {
    const token = this.getSessionToken(req)
    return Boolean(token && this.sessions.has(token))
  }

  hasValidBearer(req: http.IncomingMessage): boolean {
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) {
      return false
    }

    const expected = this.config.internalToken
    const actual = auth.slice('Bearer '.length).trim()
    if (!expected || !actual) {
      return false
    }

    return safeEqual(actual, expected)
  }

  createSessionCookie(token: string): string {
    const parts = [
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    ]

    if (this.config.secureCookies) {
      parts.push('Secure')
    }

    return parts.join('; ')
  }

  clearSessionCookie(): string {
    const parts = [
      `${SESSION_COOKIE_NAME}=`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      'Max-Age=0',
    ]

    if (this.config.secureCookies) {
      parts.push('Secure')
    }

    return parts.join('; ')
  }

  private getSessionToken(req: http.IncomingMessage): string | null {
    const cookies = parseCookieHeader(req.headers.cookie)
    return cookies.get(SESSION_COOKIE_NAME) ?? null
  }

  private verifyPassword(password: string): boolean {
    const actual = Buffer.from(hashPassword(password, this.passwordSalt), 'hex')
    return bufferSafeEqual(actual, this.passwordHash)
  }
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function verifyToken(token: string, tokenHash: string): boolean {
  return safeEqual(hashToken(token), tokenHash)
}

export function safeEqual(actual: string, expected: string): boolean {
  return bufferSafeEqual(Buffer.from(actual), Buffer.from(expected))
}

function bufferSafeEqual(actual: Buffer, expected: Buffer): boolean {
  if (actual.length !== expected.length) {
    return false
  }

  return timingSafeEqual(actual, expected)
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString('hex')
}

function parseCookieHeader(header: string | undefined): Map<string, string> {
  const result = new Map<string, string>()
  if (!header) {
    return result
  }

  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) {
      continue
    }

    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (!key) {
      continue
    }

    result.set(key, decodeURIComponent(value))
  }

  return result
}
