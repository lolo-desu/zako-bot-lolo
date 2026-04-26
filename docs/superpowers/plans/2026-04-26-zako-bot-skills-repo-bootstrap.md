# Zako Bot Skills Repo Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new private repository named `zako-bot-skills`, seed it with the current three live ZakoBot runtime skills, and add export/sync tooling so it can become the long-term source repository for those skills.

**Architecture:** Keep the current `zako-bot` repo as the control plane for planning and documentation, but create a separate git repository at `/root/zako-bot-skills` for the actual skill source. The new repository will store human-readable `SKILL.md` files, machine-readable `skills/index.json`, and two Node ESM scripts that talk to the live ZakoBot core API for export and sync.

**Tech Stack:** Git, GitHub CLI, Node 24 ESM scripts, core API (`curl`/`fetch`), JSON metadata, Markdown skill files

## Execution Status

Completed on `2026-04-26`.

- Published repository: `https://github.com/lolo-desu/zako-bot-skills`
- Initial bootstrap commit: `3a3b753 feat: bootstrap zakobot runtime skills repo`
- Follow-up fix commit: `deac0db fix: fall back to role names during skill sync`
- The shipped repository also includes `scripts/sync-to-zakobot.test.mjs` and a `pnpm test` entry for sync behavior verification.

The remainder of this file is preserved as the original execution checklist. Where those historical steps or inline examples differ from the shipped repository, follow the execution status above and the actual contents of `/root/zako-bot-skills`.

Key shipped differences from the initial draft:

- `package.json` includes a `test` script
- `skills/index.json` includes both `roles` and `roleIds`
- `sync-to-zakobot.mjs` validates the full role plan before any `PUT`
- `sync-to-zakobot.mjs` prefers `roleIds` but falls back to role names in other environments
- `scripts/sync-to-zakobot.test.mjs` exists and covers the critical sync behavior

---

## File Structure

Historical bootstrap target below; see `Execution Status` for the shipped state.

Do not treat the inline `Write this exact file` / `Write this exact script` blocks below as the final repository contents. They are preserved as the original bootstrap checklist only.

**Current repo files**
- Create: `docs/superpowers/plans/2026-04-26-zako-bot-skills-repo-bootstrap.md`

**New repository root**
- Create: `/root/zako-bot-skills/.gitignore`
- Create: `/root/zako-bot-skills/README.md`
- Create: `/root/zako-bot-skills/package.json`
- Create: `/root/zako-bot-skills/skills/index.json`
- Create: `/root/zako-bot-skills/skills/browser-workflow/SKILL.md`
- Create: `/root/zako-bot-skills/skills/current-vps-environment/SKILL.md`
- Create: `/root/zako-bot-skills/skills/markdown-table-image-reply/SKILL.md`
- Create: `/root/zako-bot-skills/scripts/export-live-skills.mjs`
- Create: `/root/zako-bot-skills/scripts/sync-to-zakobot.mjs`

## Runtime Record Map

- Skill: `Browser Workflow` -> `4c71404b-11f1-4feb-b514-404ae2bcad63`
- Skill: `Current VPS Environment` -> `9d2aaab5-0530-48ba-b277-38bf9178df12`
- Skill: `Markdown Table Image Reply` -> `980efd7a-82c6-4406-b20a-c058e0c5287f`
- Role: `Shared Role` -> `ed175b6c-8d7e-42a6-add9-bbff66f7ebbf`
- Role: `Lolo Role` -> `8aeb0472-8011-40d3-9f83-9617b9b4ae8a`
- Role: `Airly Role` -> `1e67742e-1545-4d21-b4ae-22796b04410a`

### Task 1: Create The New Repository Skeleton

**Files:**
- Create: `/root/zako-bot-skills/.gitignore`
- Create: `/root/zako-bot-skills/package.json`
- Create: `/root/zako-bot-skills/README.md`
- Create: `/root/zako-bot-skills/skills/index.json`

- [x] **Step 1: Verify `/root` is the correct parent directory**

Run: `ls /root`
Expected: `/root` exists and is the intended location for the new repository.

- [x] **Step 2: Create the repository directories**

Run:

```bash
mkdir -p "/root/zako-bot-skills/skills/browser-workflow" \
  "/root/zako-bot-skills/skills/current-vps-environment" \
  "/root/zako-bot-skills/skills/markdown-table-image-reply" \
  "/root/zako-bot-skills/scripts"
```

Expected: the new repository tree exists under `/root/zako-bot-skills`.

- [x] **Step 3: Create `.gitignore`**

Write this exact file:

```gitignore
node_modules/
*.log
.DS_Store
tmp/
```

- [x] **Step 4: Create `package.json`**

Write this exact file:

```json
{
  "name": "zako-bot-skills",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "export": "node scripts/export-live-skills.mjs",
    "sync": "node scripts/sync-to-zakobot.mjs"
  }
}
```

- [x] **Step 5: Create the initial `README.md`**

Write this exact file:

```md
# zako-bot-skills

Source repository for ZakoBot runtime skills.

## Tracked skills

- Browser Workflow
- Current VPS Environment
- Markdown Table Image Reply

## Structure

- `skills/browser-workflow/SKILL.md`, `skills/current-vps-environment/SKILL.md`, and `skills/markdown-table-image-reply/SKILL.md`: human-readable skill source
- `skills/index.json`: machine-readable skill registry and role mapping
- `scripts/export-live-skills.mjs`: export live runtime state into repository form
- `scripts/sync-to-zakobot.mjs`: push repository state into the live ZakoBot runtime

## Usage

Export current live runtime state:

```bash
npm run export
```

Sync repository state into the live runtime:

```bash
npm run sync
```

## Source of truth

Edit skill content and metadata in this repository, then sync into the running ZakoBot instance.
```

- [x] **Step 6: Create the initial empty `skills/index.json`**

Write this exact file:

```json
[]
```

- [x] **Step 7: Verify the repository skeleton**

Run: `git init && git status --short`
Workdir: `/root/zako-bot-skills`
Expected: a new git repository is initialized and the created files appear as untracked.

### Task 2: Export The Current Three Live Skills Into Repository Form

**Files:**
- Create: `/root/zako-bot-skills/skills/browser-workflow/SKILL.md`
- Create: `/root/zako-bot-skills/skills/current-vps-environment/SKILL.md`
- Create: `/root/zako-bot-skills/skills/markdown-table-image-reply/SKILL.md`
- Modify: `/root/zako-bot-skills/skills/index.json`

- [x] **Step 1: Fetch the live skill library and roles**

Run:

```bash
curl -fsS http://127.0.0.1:6325/skills && curl -fsS http://127.0.0.1:6325/roles
```

Expected: JSON showing the three tracked skills, their metadata, and the current role authorization state.

- [x] **Step 2: Fetch the three live skill bodies**

Run:

```bash
curl -fsS http://127.0.0.1:6325/skills/4c71404b-11f1-4feb-b514-404ae2bcad63/content && curl -fsS http://127.0.0.1:6325/skills/9d2aaab5-0530-48ba-b277-38bf9178df12/content && curl -fsS http://127.0.0.1:6325/skills/980efd7a-82c6-4406-b20a-c058e0c5287f/content
```

Expected: the current live `SKILL.md` bodies are returned.

- [x] **Step 3: Write `skills/browser-workflow/SKILL.md` from the live content**

The file must contain the exact current live content from skill `4c71404b-11f1-4feb-b514-404ae2bcad63`.

- [x] **Step 4: Write `skills/current-vps-environment/SKILL.md` from the live content**

The file must contain the exact current live content from skill `9d2aaab5-0530-48ba-b277-38bf9178df12`, including the corrected idle timeout `600000 ms`.

- [x] **Step 5: Write `skills/markdown-table-image-reply/SKILL.md` from the live content**

The file must contain the exact current live content from skill `980efd7a-82c6-4406-b20a-c058e0c5287f`.

- [x] **Step 6: Write `skills/index.json` with the current live registry state**

Write this exact file:

```json
[
  {
    "id": "4c71404b-11f1-4feb-b514-404ae2bcad63",
    "name": "Browser Workflow",
    "slug": "on-demand-browser-workflow",
    "description": "Detailed operating guidance for the current bot's assigned browser MCP tools.",
    "version": "2.0.0",
    "entryFile": "SKILL.md",
    "requiredTools": [],
    "roles": ["Shared Role", "Lolo Role", "Airly Role"],
    "sourceType": "manual",
    "path": "skills/browser-workflow/SKILL.md"
  },
  {
    "id": "9d2aaab5-0530-48ba-b277-38bf9178df12",
    "name": "Current VPS Environment",
    "slug": "current-vps-environment",
    "description": "Internal reference for the current VPS, ZakoBot deployment, bot instances, MCP setup, and common paths.",
    "version": "2.0.0",
    "entryFile": "SKILL.md",
    "requiredTools": [],
    "roles": ["Shared Role", "Lolo Role", "Airly Role"],
    "sourceType": "manual",
    "path": "skills/current-vps-environment/SKILL.md"
  },
  {
    "id": "980efd7a-82c6-4406-b20a-c058e0c5287f",
    "name": "Markdown Table Image Reply",
    "slug": "markdown-table-image-reply",
    "description": "Use the markdown table image tool when a Discord-friendly table image is needed.",
    "version": "2.0.0",
    "entryFile": "SKILL.md",
    "requiredTools": ["render_markdown_table_image"],
    "roles": ["Lolo Role", "Airly Role"],
    "sourceType": "manual",
    "path": "skills/markdown-table-image-reply/SKILL.md"
  }
]
```

- [x] **Step 7: Verify the exported files match the live runtime**

Run:

```bash
diff -u "/root/zako-bot-skills/skills/browser-workflow/SKILL.md" <(curl -fsS http://127.0.0.1:6325/skills/4c71404b-11f1-4feb-b514-404ae2bcad63/content | node --input-type=module -e "import { readFileSync } from 'node:fs'; const data = JSON.parse(readFileSync(0, 'utf8')); process.stdout.write(data.data.content)")
```

Expected: no diff output.

### Task 3: Implement Live Export Script

**Files:**
- Create: `/root/zako-bot-skills/scripts/export-live-skills.mjs`

- [x] **Step 1: Write the export script**

Write this exact file:

```js
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const CORE_API_URL = process.env.CORE_API_URL || 'http://127.0.0.1:6325'
const repoRoot = path.resolve(import.meta.dirname, '..')
const skillsDir = path.join(repoRoot, 'skills')

const trackedSkills = [
  { id: '4c71404b-11f1-4feb-b514-404ae2bcad63', dir: 'browser-workflow' },
  { id: '9d2aaab5-0530-48ba-b277-38bf9178df12', dir: 'current-vps-environment' },
  { id: '980efd7a-82c6-4406-b20a-c058e0c5287f', dir: 'markdown-table-image-reply' },
]

function expectOk(payload, label) {
  if (!payload?.ok)
    throw new Error(`${label} request failed`)
  return payload.data
}

function roleNamesForSkill(skillId, roles) {
  return roles
    .filter(role => role.enabledSkills.includes(skillId))
    .map(role => role.name)
}

const skills = expectOk(await fetch(`${CORE_API_URL}/skills`).then(res => res.json()), 'skills')
const roles = expectOk(await fetch(`${CORE_API_URL}/roles`).then(res => res.json()), 'roles')

const registry = []

for (const tracked of trackedSkills) {
  const skill = skills.find(item => item.id === tracked.id)
  if (!skill)
    throw new Error(`Tracked skill not found: ${tracked.id}`)

  const contentPayload = expectOk(await fetch(`${CORE_API_URL}/skills/${tracked.id}/content`).then(res => res.json()), `skill content ${tracked.id}`)
  const skillPath = path.join(skillsDir, tracked.dir, 'SKILL.md')

  await mkdir(path.dirname(skillPath), { recursive: true })
  await writeFile(skillPath, `${contentPayload.content.trimEnd()}\n`, 'utf8')

  registry.push({
    id: skill.id,
    name: skill.name,
    slug: skill.slug,
    description: skill.description,
    version: skill.version,
    entryFile: skill.entryFile,
    requiredTools: skill.requiredTools,
    roles: roleNamesForSkill(skill.id, roles),
    sourceType: skill.sourceType,
    path: `skills/${tracked.dir}/SKILL.md`,
  })
}

await writeFile(path.join(skillsDir, 'index.json'), `${JSON.stringify(registry, null, 2)}\n`, 'utf8')
console.log(`Exported ${registry.length} skills from ${CORE_API_URL}`)
```

- [x] **Step 2: Run the export script**

Run: `node scripts/export-live-skills.mjs`
Workdir: `/root/zako-bot-skills`
Expected: `Exported 3 skills from http://127.0.0.1:6325`

- [x] **Step 3: Verify the script output is stable**

Run: `git diff -- skills`
Workdir: `/root/zako-bot-skills`
Expected: no unexpected churn beyond the exported files already intended for the initial bootstrap.

### Task 4: Implement Runtime Sync Script

**Files:**
- Create: `/root/zako-bot-skills/scripts/sync-to-zakobot.mjs`

- [x] **Step 1: Write the sync script**

Write this exact file:

```js
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const CORE_API_URL = process.env.CORE_API_URL || 'http://127.0.0.1:6325'
const repoRoot = path.resolve(import.meta.dirname, '..')

function expectOk(payload, label) {
  if (!payload?.ok)
    throw new Error(`${label} request failed`)
  return payload.data
}

async function putJson(url, body) {
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json()
  if (!response.ok || !payload?.ok)
    throw new Error(`PUT ${url} failed: ${payload?.error || response.statusText}`)
  return payload.data
}

const registry = JSON.parse(await readFile(path.join(repoRoot, 'skills', 'index.json'), 'utf8'))
const liveRoles = expectOk(await fetch(`${CORE_API_URL}/roles`).then(res => res.json()), 'roles')

for (const skill of registry) {
  const content = await readFile(path.join(repoRoot, skill.path), 'utf8')
  await putJson(`${CORE_API_URL}/skills/${skill.id}`, {
    name: skill.name,
    description: skill.description,
    enabled: true,
    requiredTools: skill.requiredTools,
    content,
  })
}

for (const role of liveRoles) {
  const desiredSkills = registry.filter(skill => skill.roles.includes(role.name)).map(skill => skill.id)
  const desiredRequiredTools = registry
    .filter(skill => skill.roles.includes(role.name))
    .flatMap(skill => skill.requiredTools)
  const mergedTools = [...new Set([...role.enabledTools, ...desiredRequiredTools])]

  await putJson(`${CORE_API_URL}/roles/${role.id}`, {
    avatar: role.avatar,
    name: role.name,
    systemPrompt: role.systemPrompt,
    enabledTools: mergedTools,
    enabledSkills: desiredSkills,
  })
}

console.log(`Synced ${registry.length} skills to ${CORE_API_URL}`)
```

- [x] **Step 2: Run the sync script once against the live runtime**

Run: `node scripts/sync-to-zakobot.mjs`
Workdir: `/root/zako-bot-skills`
Expected: `Synced 3 skills to http://127.0.0.1:6325`

- [x] **Step 3: Verify the live runtime still matches repository state**

Run:

```bash
curl -fsS http://127.0.0.1:6325/skills && curl -fsS http://127.0.0.1:6325/roles && curl -fsS http://127.0.0.1:6325/status
```

Expected: the three skill ids remain enabled, `Lolo Role` and `Airly Role` keep `render_markdown_table_image`, `Shared Role` does not gain the image skill, and `/status` returns `{"ok":true,...}`.

### Task 5: Commit And Publish The New Repository

**Files:**
- Modify: `/root/zako-bot-skills/.git/`

- [x] **Step 1: Verify the new repository contents before commit**

Run: `git status --short && git diff -- skills scripts README.md package.json .gitignore`
Workdir: `/root/zako-bot-skills`
Expected: only the intended bootstrap files are present.

- [x] **Step 2: Create the initial commit**

Run:

```bash
git add . && git commit -m "feat: bootstrap zakobot runtime skills repo"
```

Workdir: `/root/zako-bot-skills`
Expected: a root commit containing the bootstrap repository state.

- [x] **Step 3: Create the GitHub repository as private**

Run:

```bash
gh repo create "zako-bot-skills" --private --source "/root/zako-bot-skills" --remote origin --push
```

Expected: GitHub repository creation succeeds and the initial commit is pushed.

- [x] **Step 4: Verify the published repository state**

## Final Notes

- The final `sync-to-zakobot.mjs` implementation validates its full role update plan before any `PUT` request.
- The final sync behavior prefers `roleIds`, but falls back to role names if those ids do not exist in the target environment.
- Live verification after sync confirmed that `Shared Role` did not gain the image skill and that `Lolo Role` / `Airly Role` retained `render_markdown_table_image` and their browser-tool isolation.

Run: `git remote -v && git status --short --branch`
Workdir: `/root/zako-bot-skills`
Expected: `origin` points at the new GitHub repository and the branch is clean after push.
