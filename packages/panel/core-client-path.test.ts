import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveCoreApiUrl } from './server/utils/core-client-path'

test('resolveCoreApiUrl preserves configured API path prefixes', () => {
  assert.equal(
    resolveCoreApiUrl('/llm-providers', 'http://panel.test/core/'),
    'http://panel.test/core/llm-providers',
  )
})

test('resolveCoreApiUrl still handles base URLs without a trailing slash', () => {
  assert.equal(
    resolveCoreApiUrl('/llm-providers', 'http://panel.test/core'),
    'http://panel.test/core/llm-providers',
  )
})
