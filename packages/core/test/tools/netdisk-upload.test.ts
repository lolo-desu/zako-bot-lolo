import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import test from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createNetdiskUploadTool } from '../../src/tools/builtins/netdisk-upload.js'

async function withEnv<T>(env: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key])
    if (value === undefined) {
      delete process.env[key]
    }
    else {
      process.env[key] = value
    }
  }

  try {
    return await fn()
  }
  finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key]
      }
      else {
        process.env[key] = value
      }
    }
  }
}

test('netdisk_upload requires an internal token', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'netdisk-tool-'))
  try {
    const filePath = join(dir, 'hello.txt')
    await writeFile(filePath, 'hello', 'utf8')
    await withEnv({ NETDISK_INTERNAL_TOKEN: undefined }, async () => {
      await assert.rejects(() => createNetdiskUploadTool().execute({ path: filePath }), /NETDISK_INTERNAL_TOKEN/)
    })
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('netdisk_upload rejects oversized files before uploading', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'netdisk-tool-'))
  try {
    const filePath = join(dir, 'hello.txt')
    await writeFile(filePath, 'hello', 'utf8')
    await withEnv({ NETDISK_INTERNAL_TOKEN: 'secret', NETDISK_MAX_FILE_BYTES: '1' }, async () => {
      await assert.rejects(() => createNetdiskUploadTool().execute({ path: filePath }), /too large/)
    })
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('netdisk_upload posts file content and bearer token', async () => {
  const requests: Array<{ url?: string, auth?: string, body: any }> = []
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const body = await readBody(req)
    requests.push({ url: req.url, auth: req.headers.authorization, body })
    res.writeHead(201, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, data: { id: 'file-1', url: 'http://files.test/f/1', expiresAt: '2026-06-19T00:00:00.000Z' } }))
  })

  await listen(server)

  const address = server.address()
  assert.equal(typeof address, 'object')
  const dir = await mkdtemp(join(tmpdir(), 'netdisk-tool-'))
  try {
    const filePath = join(dir, 'hello.txt')
    await writeFile(filePath, 'hello', 'utf8')
    const output = await withEnv({
      NETDISK_INTERNAL_TOKEN: 'secret-token',
      NETDISK_API_URL: `http://127.0.0.1:${address?.port}`,
      NETDISK_MAX_FILE_BYTES: '1000',
    }, async () => createNetdiskUploadTool().execute({ path: filePath, ttlHours: 72 }))

    assert.match(output, /http:\/\/files\.test\/f\/1/)
    assert.equal(requests.length, 1)
    assert.equal(requests[0]?.url, '/api/files')
    assert.equal(requests[0]?.auth, 'Bearer secret-token')
    assert.equal(requests[0]?.body.name, 'hello.txt')
    assert.equal(requests[0]?.body.ttlHours, 48)
    assert.equal(Buffer.from(requests[0]?.body.contentBase64, 'base64').toString('utf8'), 'hello')
  }
  finally {
    await rm(dir, { recursive: true, force: true })
    await close(server)
  }
})

test('netdisk_upload creates a share page for multiple files', async () => {
  const requests: Array<{ url?: string, auth?: string, body: any }> = []
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const body = await readBody(req)
    requests.push({ url: req.url, auth: req.headers.authorization, body })
    res.writeHead(201, { 'Content-Type': 'application/json' })
    if (req.url === '/api/shares') {
      res.end(JSON.stringify({ ok: true, data: { id: 'share-1', url: 'http://files.test/s/share-1/token', expiresAt: '2026-06-19T00:00:00.000Z', files: [] } }))
      return
    }

    const id = requests.filter(item => item.url === '/api/files').length
    res.end(JSON.stringify({ ok: true, data: { id: `file-${id}`, url: `http://files.test/f/${id}`, expiresAt: '2026-06-19T00:00:00.000Z' } }))
  })

  await listen(server)

  const address = server.address()
  assert.equal(typeof address, 'object')
  const dir = await mkdtemp(join(tmpdir(), 'netdisk-tool-'))
  try {
    const firstPath = join(dir, 'a.txt')
    const secondPath = join(dir, 'b.txt')
    await writeFile(firstPath, 'A', 'utf8')
    await writeFile(secondPath, 'B', 'utf8')
    const output = await withEnv({
      NETDISK_INTERNAL_TOKEN: 'secret-token',
      NETDISK_API_URL: `http://127.0.0.1:${address?.port}`,
      NETDISK_MAX_FILE_BYTES: '1000',
    }, async () => createNetdiskUploadTool().execute({ paths: [firstPath, secondPath], name: 'two files' }))

    assert.match(output, /Share page URL: http:\/\/files\.test\/s\/share-1\/token/)
    assert.deepEqual(requests.map(request => request.url), ['/api/files', '/api/files', '/api/shares'])
    assert.equal(requests[0]?.auth, 'Bearer secret-token')
    assert.deepEqual(requests[2]?.body.fileIds, ['file-1', 'file-2'])
    assert.equal(requests[2]?.body.name, 'two files')
  }
  finally {
    await rm(dir, { recursive: true, force: true })
    await close(server)
  }
})

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function listen(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
}

async function close(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>(resolve => server.close(() => resolve()))
}
