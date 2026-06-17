import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadConfig, normalizeTtlHours } from '../src/config.js'
import { contentDispositionAttachment, ensureInside, sanitizeFilename, sanitizeMimeType } from '../src/file-safety.js'
import { hashToken, verifyToken } from '../src/auth.js'
import { NetdiskService } from '../src/netdisk-service.js'

test('sanitizeFilename removes path segments and unsafe names', () => {
  assert.equal(sanitizeFilename('../../secret.txt'), 'secret.txt')
  assert.equal(sanitizeFilename('..'), 'download.bin')
  assert.equal(sanitizeFilename('a/bad:name?.txt'), 'bad_name_.txt')
})

test('sanitizeMimeType falls back for invalid values', () => {
  assert.equal(sanitizeMimeType('text/plain'), 'text/plain')
  assert.equal(sanitizeMimeType('bad'), 'application/octet-stream')
})

test('ensureInside rejects escaped paths', () => {
  const base = '/tmp/netdisk-root'
  assert.equal(ensureInside(base, '/tmp/netdisk-root/file'), '/tmp/netdisk-root/file')
  assert.throws(() => ensureInside(base, '/tmp/other/file'), /escapes/)
})

test('content disposition includes utf-8 filename', () => {
  assert.match(contentDispositionAttachment('报告.txt'), /filename\*=UTF-8''/)
})

test('ttl normalization defaults and clamps to max', () => {
  const config = { defaultTtlHours: 48, maxTtlHours: 48 }
  assert.equal(normalizeTtlHours(undefined, config), 48)
  assert.equal(normalizeTtlHours(72, config), 48)
  assert.throws(() => normalizeTtlHours(0, config), /positive/)
})

test('token hash verification accepts only the original token', () => {
  const tokenHash = hashToken('secret')
  assert.equal(verifyToken('secret', tokenHash), true)
  assert.equal(verifyToken('wrong', tokenHash), false)
})

test('service uploads, lists, downloads, deletes, and cleans expired files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zakobot-netdisk-'))
  try {
    const config = loadConfig({
      ZAKOBOT_HOME: root,
      NETDISK_STORAGE_DIR: join(root, 'netdisk'),
      NETDISK_PUBLIC_URL: 'http://example.test',
      NETDISK_INTERNAL_TOKEN: 'token',
      NETDISK_DEFAULT_TTL_HOURS: '48',
      NETDISK_MAX_TTL_HOURS: '48',
    } as NodeJS.ProcessEnv)
    const service = new NetdiskService(config)
    await service.init()

    const uploaded = await service.upload({
      name: '../hello.txt',
      mimeType: 'text/plain',
      contentBase64: Buffer.from('hello').toString('base64'),
      uploadedBy: 'bot',
    })

    assert.match(uploaded.url, /^http:\/\/example\.test\/f\//)
    const files = await service.listFiles()
    assert.equal(files.length, 1)
    assert.equal(files[0]?.originalName, 'hello.txt')

    const [, , id, token] = new URL(uploaded.url).pathname.split('/')
    const downloaded = await service.download(id, token)
    assert.equal(downloaded.record.size, 5)
    downloaded.stream.destroy()

    assert.equal(await service.deleteFile(id), true)
    assert.equal((await service.listFiles()).length, 0)

    const expired = await service.upload({
      name: 'expired.txt',
      contentBase64: Buffer.from('bye').toString('base64'),
      ttlHours: 0.000001,
      uploadedBy: 'admin',
    })
    await new Promise(resolve => setTimeout(resolve, 10))
    const [,, expiredId, expiredToken] = new URL(expired.url).pathname.split('/')
    await assert.rejects(() => service.download(expiredId, expiredToken), /expired/)
    assert.ok(await service.cleanupExpired() >= 0)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('service creates a signed share page for multiple files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zakobot-netdisk-share-'))
  try {
    const config = loadConfig({
      ZAKOBOT_HOME: root,
      NETDISK_STORAGE_DIR: join(root, 'netdisk'),
      NETDISK_PUBLIC_URL: 'http://example.test',
      NETDISK_INTERNAL_TOKEN: 'token',
      NETDISK_DEFAULT_TTL_HOURS: '48',
      NETDISK_MAX_TTL_HOURS: '48',
    } as NodeJS.ProcessEnv)
    const service = new NetdiskService(config)
    await service.init()

    const first = await service.upload({
      name: 'a.txt',
      contentBase64: Buffer.from('A').toString('base64'),
      uploadedBy: 'bot',
    })
    const second = await service.upload({
      name: 'b.txt',
      contentBase64: Buffer.from('B').toString('base64'),
      uploadedBy: 'bot',
    })
    const [,, firstId] = new URL(first.url).pathname.split('/')
    const [,, secondId] = new URL(second.url).pathname.split('/')

    const share = await service.createShare({
      name: '测试文件列表',
      fileIds: [firstId, secondId],
      uploadedBy: 'bot',
    })

    assert.match(share.url, /^http:\/\/example\.test\/s\//)
    assert.equal(share.files.length, 2)
    const [,, shareId, shareToken] = new URL(share.url).pathname.split('/')
    const page = await service.getSharePage(shareId, shareToken)
    assert.equal(page.share.name, '测试文件列表')
    assert.deepEqual(page.files.map(file => file.originalName).sort(), ['a.txt', 'b.txt'])

    const downloaded = await service.downloadFromShare(shareId, shareToken, firstId)
    assert.equal(downloaded.record.originalName, 'a.txt')
    downloaded.stream.destroy()
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})
