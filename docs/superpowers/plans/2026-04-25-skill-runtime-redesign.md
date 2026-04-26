# Skill Runtime Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change `zako-bot` skills from automatic full-prompt injection to Claude Code style allowlisted discovery plus explicit skill loading.

**Architecture:** Keep `enabledSkills` as persisted role state, but reinterpret it as an allowlist. The first model request gets only an `available_skills` metadata block plus a new `skill_load` tool. Full skill bodies and references only enter context after the model explicitly loads an authorized skill. At the same time, replace the current ad hoc frontmatter extraction with real YAML parsing so standard skill packages import correctly.

**Tech Stack:** TypeScript, Node 22, node:test via `node --import tsx --test`, SQLite/Drizzle, Nuxt 4 panel

---

### Task 1: Add a Core Test Harness for Skill Runtime Work

**Files:**
- Modify: `packages/core/package.json`
- Create: `packages/core/test/helpers/create-test-skill-env.ts`
- Create: `packages/core/test/skills/skill-manager.test.ts`
- Create: `packages/core/test/llm/build-conversation-request.test.ts`

- [ ] **Step 1: Add a core test script**

```json
{
  "scripts": {
    "dev": "node --watch --watch-preserve-output --import tsx src/index.ts",
    "build": "tsc",
    "test": "node --import tsx --test test/**/*.test.ts",
    "start": "node dist/index.js"
  }
}
```

- [ ] **Step 2: Run the empty test command to verify the harness works**

Run: `pnpm --filter @zakobot/core test`
Expected: Node test runner starts successfully and reports no matching tests or zero tests without TypeScript loader errors.

- [ ] **Step 3: Create a shared test environment helper**

```ts
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
      rmSync(root, { recursive: true, force: true })
    },
  }
}
```

- [ ] **Step 4: Write failing SkillManager tests first**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { createTestSkillEnv } from '../helpers/create-test-skill-env.js'

test('imports multiline YAML frontmatter and list-based required tools', () => {
  const env = createTestSkillEnv()
  try {
    const skill = env.manager.create({
      name: '',
      description: '',
      enabled: true,
      requiredTools: [],
      content: `---
name: yaml-skill
description: >
  Use when the user needs
  structured skill loading.
requiredTools:
  - file_read
  - shell_exec
metadata:
  owner: core
---

# YAML Skill
`,
    })

    assert.equal(skill.name, 'yaml-skill')
    assert.equal(skill.description, 'Use when the user needs structured skill loading.')
    assert.deepEqual(skill.requiredTools, ['file_read', 'shell_exec'])
  } finally {
    env.cleanup()
  }
})

test('discovery returns only authorized skills in requested order', () => {
  const env = createTestSkillEnv()
  try {
    const first = env.manager.create({ name: 'alpha', description: 'a', enabled: true, requiredTools: [], content: '# alpha' })
    const second = env.manager.create({ name: 'beta', description: 'b', enabled: true, requiredTools: [], content: '# beta' })

    const available = env.manager.listAvailable([second.id, first.id])

    assert.deepEqual(available.map(skill => skill.name), ['beta', 'alpha'])
  } finally {
    env.cleanup()
  }
})
```

- [ ] **Step 5: Run the SkillManager tests to verify they fail for the expected reasons**

Run: `pnpm --filter @zakobot/core test -- test/skills/skill-manager.test.ts`
Expected: FAIL because `SkillManager` does not yet support true YAML parsing or a `listAvailable()` API.

- [ ] **Step 6: Write a failing request-construction test**

```ts
test('initial conversation request exposes available_skills metadata without full skill body', async () => {
  assert.match(skillBlock, /available_skills/)
  assert.doesNotMatch(skillBlock, /内容：/)
  assert.doesNotMatch(skillBlock, /full skill body should not be here/)
})
```

- [ ] **Step 7: Run the request-construction test to verify it fails**

Run: `pnpm --filter @zakobot/core test -- test/llm/build-conversation-request.test.ts`
Expected: FAIL because the current agent still injects the full skill prompt at turn start.

- [ ] **Step 8: Commit the test harness and failing coverage scaffold**

```bash
git add packages/core/package.json packages/core/test
git commit -m "test: add skill runtime coverage scaffold"
```

### Task 2: Split Skill Discovery from Skill Loading in SkillManager

**Files:**
- Modify: `packages/core/package.json`
- Modify: `packages/core/src/skills/skill-manager.ts`
- Modify: `packages/core/src/skills/index.ts`
- Modify: `packages/database/src/queries/skills.ts`
- Modify: `shared/src/types/skill.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Extend shared skill types with discovery and load payloads**

```ts
export interface AvailableSkill {
  id: string
  name: string
  description: string
  requiredTools: string[]
  referenceCount: number
}

export interface LoadedSkill {
  id: string
  name: string
  description: string
  requiredTools: string[]
  content: string
  references: Array<SkillReferenceInfo & { content: string }>
}
```

- [ ] **Step 2: Add ordered skill lookup in database queries**

```ts
export function listEnabledSkillsByIds(db: DB, ids: string[]) {
  if (!ids.length) return []

  const rows = db
    .select()
    .from(skills)
    .where(inArray(skills.id, ids))
    .all()
    .filter(skill => skill.enabled)

  const byId = new Map(rows.map(row => [row.id, row]))
  return ids.map(id => byId.get(id)).filter((row): row is typeof rows[number] => Boolean(row))
}
```

- [ ] **Step 3: Add the YAML parser dependency to core**

```json
{
  "dependencies": {
    "yaml": "^2.8.1"
  }
}
```

Run: `pnpm install`
Expected: lockfile and workspace dependencies update cleanly.

- [ ] **Step 4: Replace ad hoc frontmatter extraction with YAML parsing**

```ts
import { parse as parseYaml } from 'yaml'

private parseMarkdown(content: string): ParsedSkillMarkdown {
  const normalized = this.normalizeMarkdownContent(content)
  const { frontmatter, body } = this.extractFrontmatter(normalized)
  const parsed = frontmatter ? parseYaml(frontmatter) as Record<string, unknown> : {}

  const name = this.getStringField(parsed.name) || this.findTitle(body) || '未命名技能'
  const description = this.getStringField(parsed.description) || this.findDescription(body)
  const version = this.getStringField(parsed.version) || '1.0.0'
  const requiredTools = this.normalizeStringList(this.getListField(parsed.requiredTools ?? parsed.required_tools ?? parsed.tools))

  return { content: body, name, description, version, requiredTools }
}
```

- [ ] **Step 5: Add metadata-only discovery and explicit load methods to SkillManager**

```ts
listAvailable(skillIds: string[]): AvailableSkill[] {
  return listEnabledSkillsByIds(this.db, this.normalizeStringList(skillIds))
    .map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      requiredTools: this.parseStringList(row.requiredTools),
      referenceCount: this.listReferences(row).length,
    }))
}

loadAuthorized(skillIds: string[], skillId: string, userText: string): LoadedSkill {
  const allowed = new Set(this.normalizeStringList(skillIds))
  if (!allowed.has(skillId)) {
    throw new Error('Skill is not available for this role')
  }

  const row = this.requireSkill(skillId)
  if (!row.enabled) {
    throw new Error('Skill is disabled')
  }

  const content = this.stripFrontmatter(this.readEntry(row)).trim()
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    requiredTools: this.parseStringList(row.requiredTools),
    content: this.truncate(content, MAX_SKILL_PROMPT_CHARS),
    references: this.selectReferences(row, content, userText),
  }
}
```

- [ ] **Step 6: Run the SkillManager tests to make them pass**

Run: `pnpm --filter @zakobot/core test -- test/skills/skill-manager.test.ts`
Expected: PASS, including YAML lists, multiline descriptions, and stable authorized ordering.

- [ ] **Step 7: Build shared, database, and core after the API changes**

Run: `pnpm --filter @zakobot/shared build && pnpm --filter @zakobot/database build && pnpm --filter @zakobot/core build`
Expected: all three packages compile without type errors.

- [ ] **Step 8: Commit the SkillManager refactor**

```bash
git add packages/core/package.json pnpm-lock.yaml shared/src/types/skill.ts shared/src/index.ts packages/database/src/queries/skills.ts packages/core/src/skills
git commit -m "refactor: split skill discovery from skill loading"
```

### Task 3: Add Explicit Skill Loading to the Core Agent Runtime

**Files:**
- Create: `packages/core/src/tools/builtins/skill-load.ts`
- Modify: `packages/core/src/tools/index.ts`
- Modify: `packages/core/src/llm/agent.ts`
- Modify: `packages/core/test/llm/build-conversation-request.test.ts`
- Create: `packages/core/test/tools/skill-load.test.ts`

- [ ] **Step 1: Write a failing skill-load tool test**

```ts
test('skill_load returns full content only for an authorized skill', async () => {
  const result = await tool.execute({ skill_id: allowedSkill.id, user_text: 'debug the runtime' })
  assert.match(String(result), /Use when/)
  assert.match(String(result), /required tools/i)
})
```

- [ ] **Step 2: Run the skill-load tool test to verify it fails**

Run: `pnpm --filter @zakobot/core test -- test/tools/skill-load.test.ts`
Expected: FAIL because no `skill_load` tool exists yet.

- [ ] **Step 3: Implement a dedicated skill-load builtin tool**

```ts
import type { LLMTool } from '@zakobot/shared'
import type { SkillManager } from '../../skills/index.js'

export function createSkillLoadTool(skillManager: SkillManager, allowedSkillIds: string[], getUserText: () => string): LLMTool {
  const loaded = new Map<string, string>()

  return {
    name: 'skill_load',
    description: 'Load the full content of an available skill before following its workflow.',
    parameters: {
      type: 'object',
      properties: {
        skill_id: { type: 'string', description: 'ID of a skill from available_skills.' },
      },
      required: ['skill_id'],
      additionalProperties: false,
    },
    execute: async (args) => {
      const skillId = typeof args.skill_id === 'string' ? args.skill_id.trim() : ''
      if (!skillId) throw new Error('skill_id is required')
      if (loaded.has(skillId)) return loaded.get(skillId)!

      const skill = skillManager.loadAuthorized(allowedSkillIds, skillId, getUserText())
      const result = [
        `Skill: ${skill.name}`,
        skill.description ? `Description: ${skill.description}` : '',
        skill.requiredTools.length ? `Required tools: ${skill.requiredTools.join(', ')}` : '',
        '',
        skill.content,
        ...(skill.references.length ? ['', 'References:', ...skill.references.map(ref => `Reference: ${ref.path}\n${ref.content}`)] : []),
      ].filter(Boolean).join('\n')

      loaded.set(skillId, result)
      return result
    },
  }
}
```

- [ ] **Step 4: Register `skill_load` only when the role has authorized skills**

```ts
const availableSkills = this.skillManager.listAvailable(enabledSkills)
const skillLoadTool = availableSkills.length
  ? [createSkillLoadTool(this.skillManager, enabledSkills, () => this.getLatestUserText(history))]
  : []

const allowedTools = [
  ...this.toolRegistry.listEnabled(enabledTools),
  ...scopedMemoryTools,
  ...skillLoadTool,
]
```

- [ ] **Step 5: Replace full skill prompt injection with metadata-only `available_skills` formatting**

```ts
function buildAvailableSkillsPrompt(skills: AvailableSkill[]) {
  if (!skills.length) return ''

  return [
    'available_skills:',
    ...skills.map(skill => [
      `- id: ${skill.id}`,
      `  name: ${skill.name}`,
      `  description: ${skill.description || 'No description provided.'}`,
      `  required_tools: ${skill.requiredTools.join(', ') || '(none)'}`,
      `  reference_count: ${skill.referenceCount}`,
    ].join('\n')),
    '',
    'Load a skill with skill_load before relying on its full workflow or references.',
  ].join('\n')
}
```

- [ ] **Step 6: Update the request-construction tests to assert the new behavior**

```ts
assert.match(initialSkillPrompt, /available_skills:/)
assert.match(initialSkillPrompt, /Load a skill with skill_load/)
assert.doesNotMatch(initialSkillPrompt, /内容：/)
assert.doesNotMatch(initialSkillPrompt, /full skill body should not be here/)
```

- [ ] **Step 7: Run the focused core tests**

Run: `pnpm --filter @zakobot/core test -- test/llm/build-conversation-request.test.ts test/tools/skill-load.test.ts`
Expected: PASS, including metadata-only initial prompt and successful authorized skill loading.

- [ ] **Step 8: Build the affected packages again**

Run: `pnpm --filter @zakobot/shared build && pnpm --filter @zakobot/database build && pnpm --filter @zakobot/core build`
Expected: PASS with the new tool and updated agent request construction.

- [ ] **Step 9: Commit the runtime change**

```bash
git add packages/core/src/tools packages/core/src/llm/agent.ts packages/core/test
git commit -m "feat: load skills on demand"
```

### Task 4: Update Panel Semantics and Import Validation

**Files:**
- Modify: `packages/panel/components/RoleEditorForm.vue`
- Modify: `packages/panel/pages/settings/skills/index.vue`
- Modify: `packages/core/src/api/validators.ts`
- Modify: `packages/core/src/api/routes/skills.ts`

- [ ] **Step 1: Write the wording changes inline before implementation**

```vue
<UFormField
  label="技能"
  name="enabledSkills"
  description="允许模型在需要时使用这些技能。未勾选的技能对模型不可见。"
>
```

```vue
<ToolPermissionGroup
  title="可用技能"
  description="勾选后仅表示允许模型按需发现和加载"
```

- [ ] **Step 2: Harden API validation so malformed YAML frontmatter returns a clear error**

```ts
export function parseSkillInput(body: Partial<SkillEditorInput>): SkillEditorInput {
  const content = body.content?.trim()
  if (!content) {
    throw new Error('Skill content is required')
  }

  return {
    name: body.name?.trim() ?? '',
    description: body.description?.trim() ?? '',
    content,
    enabled: body.enabled === false ? false : true,
    requiredTools: normalizeEnabledToolNames(body.requiredTools),
  }
}
```

Use the existing `SkillManager.create()` / `update()` / `import()` failure path so YAML parsing errors surface through the current API error wrapper instead of being swallowed.

- [ ] **Step 3: Update skill settings hints to match the new semantics**

```vue
<p class="mt-1 text-xs text-[var(--text-secondary)]">
  管理角色可授权模型按需使用的工作流
</p>
```

- [ ] **Step 4: Run panel typecheck and core build after the wording/API changes**

Run: `pnpm --filter @zakobot/core build && pnpm --filter @zakobot/panel typecheck && pnpm --filter @zakobot/panel build`
Expected: PASS with no Vue or TypeScript errors.

- [ ] **Step 5: Commit the panel and validation changes**

```bash
git add packages/panel/components/RoleEditorForm.vue packages/panel/pages/settings/skills/index.vue packages/core/src/api/validators.ts packages/core/src/api/routes/skills.ts
git commit -m "docs: clarify skill allowlist behavior"
```

### Task 5: End-to-End Verification on the VPS Runtime

**Files:**
- Verify only: `packages/core/src/llm/agent.ts`, `packages/core/src/skills/skill-manager.ts`, `packages/panel/components/RoleEditorForm.vue`, `packages/panel/pages/settings/skills/index.vue`

- [ ] **Step 1: Run the focused core tests and package builds together**

Run: `pnpm --filter @zakobot/core test && pnpm --filter @zakobot/shared build && pnpm --filter @zakobot/database build && pnpm --filter @zakobot/core build && pnpm --filter @zakobot/panel typecheck && pnpm --filter @zakobot/panel build`
Expected: all commands pass.

- [ ] **Step 2: Restart the service only after builds pass**

Run: `systemctl restart zako-bot.service`
Expected: command exits successfully.

- [ ] **Step 3: Verify the runtime is healthy**

Run: `systemctl is-active zako-bot.service`
Expected: `active`

Run: `curl -fsS http://127.0.0.1:6325/status`
Expected: JSON status response from core.

Run: `journalctl -u zako-bot.service -n 100 --no-pager`
Expected: no startup failure related to skill parsing, `skill_load`, or route registration.

- [ ] **Step 4: Perform a manual panel smoke check**

Verify in `http://127.0.0.1:6324`:

- role editor copy says skills are allowed on demand, not auto-applied
- unselected skills are not exposed to the model
- malformed skill imports return readable validation errors
- selected skills remain visible in role settings and missing tool warnings still show

- [ ] **Step 5: Inspect one real conversation transcript**

Confirm the first request exposes only `available_skills` metadata and that a skill body appears only after a `skill_load` tool call.

- [ ] **Step 6: Commit final verification adjustments**

```bash
git add packages/core packages/panel shared packages/database
git commit -m "fix: finalize skill runtime redesign"
```
