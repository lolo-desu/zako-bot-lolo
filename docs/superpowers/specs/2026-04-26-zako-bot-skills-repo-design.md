# Zako Bot Skills Repository Design

## Goal

Create a separate repository named `zako-bot-skills` that becomes the source repository for ZakoBot runtime skills, starting with the current three live ZakoBot-owned skills.

This repository should make the skill content, metadata, role authorization, and synchronization workflow explicit so future skill additions do not depend on digging through the live runtime database.

## Implementation Status

Implemented on `2026-04-26`.

- GitHub repository: `https://github.com/lolo-desu/zako-bot-skills`
- Visibility: private
- Initial tracked skills: `Browser Workflow`, `Current VPS Environment`, `Markdown Table Image Reply`
- The repository now exists as the authoring source for these runtime skills; the live runtime is treated as deployed state.

This file is now an adopted design record, not a pending proposal. If any later section still reads like future tense, treat the implementation status and shipped repository state as authoritative.

## Scope

In scope:

- Create a new standalone repository named `zako-bot-skills`.
- Seed it with the current three live ZakoBot runtime skills.
- Store both human-readable skill content and machine-readable metadata.
- Include scripts for exporting from the live runtime and syncing repository state back into the live ZakoBot runtime.
- Design the repository so additional skills can be added later without restructuring it.

Out of scope for the initial repository:

- Migrating `.opencode/skills/zakobot-development` into this repository.
- Reworking ZakoBot core runtime semantics.
- Building a full bidirectional reconciliation service.
- Adding more skills than the current three live ZakoBot-owned skills.

## Initial Skill Set

The initial repository content should contain exactly these three live runtime skills:

1. `Browser Workflow`
2. `Current VPS Environment`
3. `Markdown Table Image Reply`

This is intentionally limited to the current live ZakoBot runtime skills, but the repository layout should leave room for more skills in the future.

## Repository Role

`zako-bot-skills` should be the independent source repository for ZakoBot runtime skills.

That means:

- Skill Markdown content is maintained in the new repository.
- Skill metadata and role authorization are maintained in the new repository.
- Synchronization from repository state into the live ZakoBot runtime is an explicit script-driven action.
- The live runtime becomes deployed state, not the long-term source of truth.

## Repository Structure

The shipped repository currently uses this structure:

```text
zako-bot-skills/
├── package.json
├── README.md
├── .gitignore
├── skills/
│   ├── index.json
│   ├── browser-workflow/
│   │   └── SKILL.md
│   ├── current-vps-environment/
│   │   └── SKILL.md
│   └── markdown-table-image-reply/
│       └── SKILL.md
└── scripts/
    ├── export-live-skills.mjs
    ├── sync-to-zakobot.mjs
    └── sync-to-zakobot.test.mjs
```

## Content Design

Each skill lives in its own directory with a `SKILL.md` file.

This keeps the content easy to browse and mirrors the way skills are already stored in the live runtime.

The repository will start with:

- `skills/browser-workflow/SKILL.md`
- `skills/current-vps-environment/SKILL.md`
- `skills/markdown-table-image-reply/SKILL.md`

## Metadata Design

The repository should include `skills/index.json` as the machine-readable registry for the tracked runtime skills.

Each entry should include at least:

- `id`
- `name`
- `slug`
- `description`
- `version`
- `entryFile`
- `requiredTools`
- `roles`
- `roleIds`
- `sourceType`
- `path`

Example shape:

```json
{
  "id": "4c71404b-11f1-4feb-b514-404ae2bcad63",
  "name": "Browser Workflow",
  "slug": "on-demand-browser-workflow",
  "description": "Detailed operating guidance for the current bot's assigned browser MCP tools.",
  "version": "2.0.0",
  "entryFile": "SKILL.md",
  "requiredTools": [],
  "roles": ["Shared Role", "Lolo Role", "Airly Role"],
  "roleIds": ["ed175b6c-8d7e-42a6-add9-bbff66f7ebbf", "8aeb0472-8011-40d3-9f83-9617b9b4ae8a", "1e67742e-1545-4d21-b4ae-22796b04410a"],
  "sourceType": "manual",
  "path": "skills/browser-workflow/SKILL.md"
}
```

## Role Authorization Model

The metadata registry should explicitly declare which roles should have each skill.

This avoids treating role authorization as hidden runtime state and makes it possible to review skill visibility directly in git.

For the current live state:

- `Browser Workflow` is authorized for `Shared Role`, `Lolo Role`, and `Airly Role`
- `Current VPS Environment` is authorized for `Shared Role`, `Lolo Role`, and `Airly Role`
- `Markdown Table Image Reply` is authorized for `Lolo Role` and `Airly Role`

The repository metadata should also preserve the fact that `Markdown Table Image Reply` requires `render_markdown_table_image`, and that `Lolo Role` and `Airly Role` must therefore authorize that tool if the skill is enabled for them.

`skills/index.json` should keep both human-readable `roles` and live-reference `roleIds`.

- `roleIds` are useful when syncing back into the same environment.
- Sync must not hard-fail solely because those ids do not exist in another environment.
- If a tracked `roleId` is missing, the sync flow should fall back to matching by role name.

## Sync Model

The shipped runtime interaction model uses two scripts plus one minimal test file.

### `scripts/export-live-skills.mjs`

Purpose:

- Export the current live ZakoBot runtime skill state into repository-shaped data.
- Support initial bootstrapping and future drift checks.

Expected responsibilities:

- Read live skill metadata from `http://127.0.0.1:6325/skills`
- Read live skill bodies from `http://127.0.0.1:6325/skills/:id/content`
- Read role state from `http://127.0.0.1:6325/roles`
- Materialize or refresh repository files and metadata from that live state

### `scripts/sync-to-zakobot.mjs`

Purpose:

- Push repository state back into the live ZakoBot runtime.

Expected responsibilities:

- Read `skills/index.json`
- Read each tracked `SKILL.md`
- Update live skill records through the ZakoBot core API
- Update role skill authorization through the ZakoBot core API
- Ensure required tool authorization remains consistent with enabled skills where needed
- Validate the full role update plan before sending any write request
- Prefer `roleIds` when they match live roles, but fall back to role names when they do not

### `scripts/sync-to-zakobot.test.mjs`

Purpose:

- Lock down the current role-sync behavior with a minimal regression suite.

Current coverage:

- `roleIds` priority when matching live roles
- fallback to role names when `roleIds` are absent or missing in the target environment
- no `PUT` requests before role-plan validation succeeds

## Source of Truth Rules

After this repository was introduced, the operational model is:

1. Edit skill content in `zako-bot-skills`
2. Update `skills/index.json` in the same repository
3. Run the sync script to deploy changes into the live runtime
4. Verify live runtime state through the core API

The live runtime should no longer be treated as the long-term authoring location for these skills except when doing an intentional export or recovery.

## Initialization Plan

This section records the original bootstrap intent that was later executed. The live repository may include small follow-up improvements beyond this initial checklist.

The initial repository bootstrap should:

1. Create the new git repository locally.
2. Add the directory structure described above.
3. Export the current three live skills into repository form.
4. Write `skills/index.json` with the live ids and current role mapping.
5. Add a README explaining purpose, structure, and sync workflow.
6. Commit the initial repository state.
7. Create and push the new GitHub repository.

## README Expectations

`README.md` should explain:

- What this repository is for
- Which skills it currently tracks
- How the directory structure works
- How to export live state into the repository
- How to sync repository state into ZakoBot
- That this repository is intended to be the independent source repository for runtime skills

## Risks

### Drift during transition

If runtime skills continue to be edited directly in the live system after the repository is introduced, the new source-of-truth model will break down. The README and sync workflow should make the intended editing path explicit.

### Authorization mismatch

A skill can be enabled for a role while its required tool is missing from that role. The repository metadata and sync logic must make that relationship visible and enforceable.

### Future expansion without metadata discipline

If new skills are added later without updating `skills/index.json`, the repository will stop being a reliable machine-readable source. The repository structure should make the registry central and expected.

## Success Criteria

This design is successful when:

1. A new repository named `zako-bot-skills` exists.
2. It contains the current three live ZakoBot runtime skills as tracked files.
3. It contains machine-readable metadata describing those skills and their role authorization.
4. It contains scripts for export and sync.
5. Its layout supports adding more skills later without structural changes.
6. It is suitable to become the long-term source repository for ZakoBot runtime skills.
