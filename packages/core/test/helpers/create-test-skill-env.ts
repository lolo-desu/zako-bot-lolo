import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createDb, runMigrations } from '@zakobot/database'
import { SkillManager } from '../../src/skills/index.js'

export function createTestSkillEnv() {
  const root = mkdtempSync(join(tmpdir(), 'zakobot-skill-test-'))
  const db = createDb(join(root, 'data.db'))

  runMigrations(db)

  const manager = new SkillManager(db, join(root, 'skills'))

  return {
    root,
    db,
    manager,
    cleanup() {
      ;(db as { $client?: { close?: () => void } }).$client?.close?.()
      rmSync(root, { recursive: true, force: true })
    },
  }
}
