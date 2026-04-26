import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMemoryReviewMessages, parseReviewedMemories } from '../../src/memory/local-memory-reviewer.js'

test('buildMemoryReviewMessages includes recent topic window and existing memories', () => {
  const messages = buildMemoryReviewMessages([
    { role: 'user', content: '我更喜欢 TypeScript。' },
    { role: 'assistant', content: '记住了。' },
    { role: 'user', content: '最近主要在维护 zako-bot。' },
  ], ['用户偏好 TypeScript'])

  assert.equal(messages.length, 2)
  assert.equal(messages[0]?.role, 'system')
  assert.equal(messages[1]?.role, 'user')
  assert.match(String(messages[0]?.content), /严格 JSON 数组/)
  assert.match(String(messages[1]?.content), /最近对话/)
  assert.match(String(messages[1]?.content), /用户：我更喜欢 TypeScript。/)
  assert.match(String(messages[1]?.content), /助手：记住了。/)
  assert.match(String(messages[1]?.content), /已有长期记忆/)
  assert.match(String(messages[1]?.content), /- 用户偏好 TypeScript/)
})

test('buildMemoryReviewMessages returns empty when no usable topic messages exist', () => {
  const messages = buildMemoryReviewMessages([
    { role: 'system', content: 'ignore me' },
    { role: 'user', content: '   ' },
  ], ['已有记忆'])

  assert.deepEqual(messages, [])
})

test('parseReviewedMemories extracts reviewed memories from fenced json', () => {
  const parsed = parseReviewedMemories('```json\n[\n  {"memory": "  用户偏好 TypeScript  ", "kind": " preference "},\n  {"memory": "项目是 zako-bot", "kind": 123},\n  {"memory": "   ", "kind": "fact"}\n]\n```')

  assert.deepEqual(parsed, {
    items: [
      { memory: '用户偏好 TypeScript', kind: 'preference' },
      { memory: '项目是 zako-bot', kind: 'fact' },
    ],
    malformed: false,
  })
})

test('parseReviewedMemories marks malformed reviewer output', () => {
  assert.deepEqual(parseReviewedMemories('not json at all'), {
    items: [],
    malformed: true,
  })
})
