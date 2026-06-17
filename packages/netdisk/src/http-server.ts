import http from 'http'
import { Buffer } from 'buffer'
import type { NetdiskAuth } from './auth.js'
import { contentDispositionAttachment } from './file-safety.js'
import { HttpError, type NetdiskService } from './netdisk-service.js'

const MAX_FORM_BYTES = 1024 * 1024

export class NetdiskHttpServer {
  private server: http.Server
  private cleanupTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly service: NetdiskService,
    private readonly auth: NetdiskAuth,
  ) {
    this.server = http.createServer((req, res) => {
      void this.handle(req, res).catch((error) => this.handleError(res, error))
    })
  }

  async start(): Promise<void> {
    await this.service.init()
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        cleanup()
        reject(error)
      }
      const onListening = () => {
        cleanup()
        resolve()
      }
      const cleanup = () => {
        this.server.off('error', onError)
        this.server.off('listening', onListening)
      }

      this.server.once('error', onError)
      this.server.once('listening', onListening)
      this.server.listen(this.service.config.port, this.service.config.host)
    })

    const intervalMs = this.service.config.cleanupIntervalMinutes * 60 * 1000
    this.cleanupTimer = setInterval(() => {
      void this.service.cleanupExpired().catch(error => console.error('[Netdisk] Cleanup failed:', error))
    }, intervalMs)
    this.cleanupTimer.unref()
  }

  async stop(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }

    await new Promise<void>((resolve, reject) => {
      this.server.close(error => error ? reject(error) : resolve())
    })
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
    const { pathname } = url

    if (pathname === '/health' && req.method === 'GET') {
      return this.json(res, { ok: true, data: { status: 'ok' } })
    }

    if (pathname === '/' && req.method === 'GET') {
      return this.redirect(res, this.auth.hasValidSession(req) ? '/files' : '/login')
    }

    if (pathname === '/login' && req.method === 'GET') {
      return this.html(res, loginPage())
    }

    if (pathname === '/login' && req.method === 'POST') {
      const form = await this.readForm(req)
      const result = this.auth.login(form.get('username') ?? '', form.get('password') ?? '')
      if (!result.ok || !result.sessionToken) {
        return this.html(res, loginPage('账号或密码错误'), 401)
      }

      res.setHeader('Set-Cookie', this.auth.createSessionCookie(result.sessionToken))
      return this.redirect(res, '/files')
    }

    if (pathname === '/logout' && req.method === 'POST') {
      this.auth.logout(req)
      res.setHeader('Set-Cookie', this.auth.clearSessionCookie())
      return this.redirect(res, '/login')
    }

    if (pathname === '/files' && req.method === 'GET') {
      this.requireSession(req)
      return this.html(res, filesPage(await this.service.listFiles()))
    }

    if (pathname === '/upload' && req.method === 'GET') {
      this.requireSession(req)
      return this.html(res, uploadPage())
    }

    if (pathname === '/upload' && req.method === 'POST') {
      this.requireSession(req)
      const form = await this.readForm(req, this.service.config.maxFileBytes * 2)
      const result = await this.service.upload({
        name: form.get('name') ?? undefined,
        mimeType: form.get('mimeType') ?? undefined,
        contentBase64: Buffer.from(form.get('content') ?? '', 'utf8').toString('base64'),
        ttlHours: Number(form.get('ttlHours') || this.service.config.defaultTtlHours),
        uploadedBy: 'admin',
      })
      return this.html(res, uploadPage(`上传成功：<a href="${escapeHtml(result.url)}">${escapeHtml(result.url)}</a>`))
    }

    if (pathname === '/api/files' && req.method === 'POST') {
      this.requireAdmin(req)
      const body = await this.readJson<Record<string, unknown>>(req, this.service.config.maxFileBytes * 2)
      const result = await this.service.upload({
        name: stringValue(body.name),
        mimeType: stringValue(body.mimeType),
        contentBase64: stringValue(body.contentBase64),
        ttlHours: numberValue(body.ttlHours),
        uploadedBy: this.auth.hasValidBearer(req) ? 'bot' : 'admin',
      })
      return this.json(res, { ok: true, data: result }, 201)
    }

    if (pathname === '/api/shares' && req.method === 'POST') {
      this.requireAdmin(req)
      const body = await this.readJson<Record<string, unknown>>(req)
      const result = await this.service.createShare({
        name: stringValue(body.name),
        fileIds: stringArrayValue(body.fileIds),
        ttlHours: numberValue(body.ttlHours),
        uploadedBy: this.auth.hasValidBearer(req) ? 'bot' : 'admin',
      })
      return this.json(res, { ok: true, data: result }, 201)
    }

    if (pathname === '/api/files' && req.method === 'GET') {
      this.requireAdmin(req)
      return this.json(res, { ok: true, data: await this.service.listFiles() })
    }

    const deleteMatch = pathname.match(/^\/api\/files\/([^/]+)$/)
    if (deleteMatch && req.method === 'DELETE') {
      this.requireAdmin(req)
      const deleted = await this.service.deleteFile(decodeURIComponent(deleteMatch[1]))
      return this.json(res, { ok: true, data: { deleted } })
    }

    const downloadMatch = pathname.match(/^\/f\/([^/]+)\/([^/]+)\//)
    if (downloadMatch && req.method === 'GET') {
      const result = await this.service.download(decodeURIComponent(downloadMatch[1]), decodeURIComponent(downloadMatch[2]))
      return this.sendDownload(res, result.record, result.stream)
    }

    const shareDownloadMatch = pathname.match(/^\/s\/([^/]+)\/([^/]+)\/files\/([^/]+)$/)
    if (shareDownloadMatch && req.method === 'GET') {
      const result = await this.service.downloadFromShare(
        decodeURIComponent(shareDownloadMatch[1]),
        decodeURIComponent(shareDownloadMatch[2]),
        decodeURIComponent(shareDownloadMatch[3]),
      )
      return this.sendDownload(res, result.record, result.stream)
    }

    const shareMatch = pathname.match(/^\/s\/([^/]+)\/([^/]+)$/)
    if (shareMatch && req.method === 'GET') {
      const page = await this.service.getSharePage(decodeURIComponent(shareMatch[1]), decodeURIComponent(shareMatch[2]))
      return this.html(res, sharePage(page.share.name, page.share.expiresAt, page.files, pathname))
    }

    throw new HttpError(404, 'Not found')
  }

  private requireSession(req: http.IncomingMessage): void {
    if (!this.auth.hasValidSession(req)) {
      throw new HttpError(401, 'Login required')
    }
  }

  private requireAdmin(req: http.IncomingMessage): void {
    if (!this.auth.isAdminRequest(req)) {
      throw new HttpError(401, 'Authentication required')
    }
  }

  private async readJson<T>(req: http.IncomingMessage, maxBytes = MAX_FORM_BYTES): Promise<T> {
    const raw = await this.readRaw(req, maxBytes)
    if (!raw.trim()) {
      return {} as T
    }

    try {
      return JSON.parse(raw) as T
    }
    catch {
      throw new HttpError(400, 'Invalid JSON request body')
    }
  }

  private async readForm(req: http.IncomingMessage, maxBytes = MAX_FORM_BYTES): Promise<URLSearchParams> {
    const raw = await this.readRaw(req, maxBytes)
    return new URLSearchParams(raw)
  }

  private async readRaw(req: http.IncomingMessage, maxBytes: number): Promise<string> {
    const chunks: Buffer[] = []
    let total = 0
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      total += buffer.byteLength
      if (total > maxBytes) {
        throw new HttpError(413, 'Request body is too large')
      }
      chunks.push(buffer)
    }

    return Buffer.concat(chunks).toString('utf8')
  }

  private json(res: http.ServerResponse, data: unknown, status = 200): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(data))
  }

  private html(res: http.ServerResponse, body: string, status = 200): void {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(layout(body))
  }

  private redirect(res: http.ServerResponse, location: string): void {
    res.writeHead(302, { Location: location })
    res.end()
  }

  private sendDownload(res: http.ServerResponse, record: { mimeType: string, size: number, originalName: string }, stream: NodeJS.ReadableStream): void {
    res.writeHead(200, {
      'Content-Type': record.mimeType,
      'Content-Length': String(record.size),
      'Content-Disposition': contentDispositionAttachment(record.originalName),
      'Cache-Control': 'private, max-age=0, no-store',
    })
    stream.pipe(res)
  }

  private handleError(res: http.ServerResponse, error: unknown): void {
    if (res.headersSent) {
      res.destroy(error instanceof Error ? error : undefined)
      return
    }

    const status = error instanceof HttpError ? error.status : 500
    const message = error instanceof Error ? error.message : 'Internal server error'
    if (status >= 500) {
      console.error('[Netdisk] Request failed:', error)
    }
    this.json(res, { ok: false, error: message }, status)
  }
}

function layout(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ZakoBot Netdisk</title><style>body{font-family:system-ui,sans-serif;max-width:960px;margin:40px auto;padding:0 16px;color:#172033}a{color:#2563eb}input,textarea{box-sizing:border-box;width:100%;padding:8px;margin:4px 0 12px}button{padding:8px 12px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e5e7eb;padding:8px;text-align:left}.error{color:#dc2626}.ok{color:#059669}.top{display:flex;gap:12px;align-items:center;margin-bottom:20px}</style></head><body>${body}</body></html>`
}

function loginPage(error = ''): string {
  return `<h1>ZakoBot Netdisk</h1>${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}<form method="post" action="/login"><label>用户名</label><input name="username" autocomplete="username"><label>密码</label><input name="password" type="password" autocomplete="current-password"><button type="submit">登录</button></form>`
}

function filesPage(files: Array<{ id: string, originalName: string, size: number, expiresAt: string, uploadedBy: string, expired: boolean }>): string {
  const rows = files.map(file => `<tr><td>${escapeHtml(file.originalName)}</td><td>${file.size}</td><td>${escapeHtml(file.uploadedBy)}</td><td>${escapeHtml(file.expiresAt)}${file.expired ? ' <span class="error">已过期</span>' : ''}</td><td><button data-id="${escapeHtml(file.id)}" onclick="deleteFile(this.dataset.id)">删除</button></td></tr>`).join('')
  return `<div class="top"><h1>文件列表</h1><a href="/upload">上传</a><form method="post" action="/logout"><button>退出</button></form></div><table><thead><tr><th>文件名</th><th>大小</th><th>来源</th><th>过期时间</th><th>操作</th></tr></thead><tbody>${rows || '<tr><td colspan="5">暂无文件</td></tr>'}</tbody></table><script>async function deleteFile(id){if(!confirm('删除这个文件？'))return;await fetch('/api/files/'+encodeURIComponent(id),{method:'DELETE'});location.reload()}</script>`
}

function uploadPage(message = ''): string {
  return `<div class="top"><h1>上传文件</h1><a href="/files">文件列表</a></div>${message ? `<p class="ok">${message}</p>` : ''}<form method="post" action="/upload"><label>下载文件名</label><input name="name" placeholder="report.txt"><label>MIME 类型</label><input name="mimeType" placeholder="text/plain"><label>有效期（小时，最多 48）</label><input name="ttlHours" value="48"><label>文件内容（文本）</label><textarea name="content" rows="12"></textarea><button type="submit">上传</button></form><p>浏览器管理页第一版支持文本内容上传；ZakoBot 内部 API 使用 base64 上传文件。</p>`
}

function sharePage(name: string, expiresAt: string, files: Array<{ id: string, originalName: string, size: number }>, basePath: string): string {
  const rows = files.map(file => `<tr><td>${escapeHtml(file.originalName)}</td><td>${file.size}</td><td><a href="${escapeHtml(basePath)}/files/${encodeURIComponent(file.id)}">下载</a></td></tr>`).join('')
  return `<h1>${escapeHtml(name)}</h1><p>此分享链接过期时间：${escapeHtml(expiresAt)}</p><table><thead><tr><th>文件名</th><th>大小</th><th>操作</th></tr></thead><tbody>${rows || '<tr><td colspan="3">没有可下载文件</td></tr>'}</tbody></table>`
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : []
}
