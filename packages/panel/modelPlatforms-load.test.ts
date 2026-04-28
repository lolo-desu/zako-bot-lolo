import assert from 'node:assert/strict'
import test from 'node:test'
import { refreshModelPlatformsSafely } from './composables/modelPlatforms-load'

test('refreshModelPlatformsSafely resolves without rejecting when refresh fails', async () => {
  const error = new Error('backend down')

  await assert.doesNotReject(async () => {
    const refreshed = await refreshModelPlatformsSafely(async () => {
      throw error
    })

    assert.equal(refreshed, false)
  })
})

test('refreshModelPlatformsSafely reports success after a successful refresh', async () => {
  let calls = 0
  const refreshed = await refreshModelPlatformsSafely(async () => {
    calls += 1
  })

  assert.equal(calls, 1)
  assert.equal(refreshed, true)
})
