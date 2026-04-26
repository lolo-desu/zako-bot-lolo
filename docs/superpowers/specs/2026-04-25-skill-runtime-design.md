# Skill Runtime Redesign

## Goal

Make `zako-bot` skill behavior match the Claude Code / OpenCode model more closely:

- role-selected skills are an allowlist, not automatic prompt injection
- the model can only see authorized skills
- the model first sees skill metadata, then explicitly loads a skill before using its full content
- skill packaging and parsing accept standard skill frontmatter instead of the current line-based subset

## Non-Goals

- No backward-compatible dual runtime where enabled skills continue to inject full bodies every turn
- No semantic access to unauthorized skills
- No full marketplace or global auto-discovery outside the role allowlist
- No attempt to make skills self-enable tools automatically

## Current Problems

The current runtime treats `enabledSkills` as "inject these full skills into every request". That differs from Claude Code style behavior in three important ways:

1. The model does not choose whether to use a skill.
2. Unauthorized and authorized semantics are blurred because a selected skill is always active.
3. Skill files are parsed with ad hoc frontmatter extraction, so standard YAML skill packages can silently degrade.

This creates poor ergonomics, inflated prompt size, and skill documents that look valid but do not behave reliably.

## Target Semantics

### Authorization

- `enabledSkills` remains on the role model, but its meaning changes to `allowedSkillIds` in behavior.
- Only allowed skills are visible to the model.
- Unselected skills are fully invisible to the model:
  - not listed in available skill metadata
  - not eligible for loading
  - not eligible for reference selection
  - not part of prompt construction
- Runtime should still keep a defensive check in case an invalid skill load is requested, but that is not a normal path.

### Discovery and Load Flow

Each user turn follows this sequence:

1. Build the role's allowed skill set from `enabledSkills`.
2. Expose only metadata for those skills to the model in an `available_skills` block.
3. The model decides whether any skill is useful.
4. If needed, the model explicitly loads one or more visible skills.
5. The runtime returns the selected skill body and relevant references.
6. The model continues working with the loaded skill content.

This mirrors the "available skills first, full skill later" behavior used by Claude Code and this session's runtime.

### Prompt Contract

The initial request should contain:

- system prompt(s)
- memory prompt if applicable
- normal tool prompt
- `available_skills` metadata block for authorized skills only

It should not contain:

- full `SKILL.md` bodies by default
- bundled references by default
- unauthorized skill metadata

After a skill load, the conversation receives a structured result containing:

- skill name
- description
- required tools
- normalized body content
- selected reference content

Within one assistant turn, a previously loaded skill should not be reloaded unless the runtime state was cleared.

## Architecture

### 1. Skill Storage and Parsing

`SkillManager` should continue to own CRUD, import, packaging, reference enumeration, and prompt-facing skill retrieval. Its parsing behavior must change from regex-plus-single-line lookup to real YAML frontmatter parsing.

Required supported fields:

- `name`
- `description`
- `version`
- `requiredTools`, `required_tools`, or `tools`

Allowed but optional fields should parse without breaking import:

- `compatibility`
- `metadata`
- other top-level YAML keys

Unknown fields may be ignored by runtime semantics, but must not break parsing or silently strip the rest of frontmatter.

The parser should normalize:

- BOM-prefixed files
- single-line and multiline descriptions
- YAML lists for required tools
- quoted or unquoted scalar values

### 2. Skill Discovery Surface

Introduce a clear metadata representation for model-facing discovery, separate from full content loading.

Suggested shape:

- `id`
- `name`
- `description`
- `requiredTools`
- `referenceCount`

Optional derived fields may be added later, but the first version should stay minimal to control prompt size.

`SkillManager` should expose a method that returns only authorized, enabled, prompt-safe skill metadata in stable order.

### 3. Skill Load Surface

Add a dedicated runtime path for loading a specific authorized skill on demand.

This can be implemented in either of two equivalent internal forms:

- a first-class tool exposed to the model, such as `skill_load`
- a provider-level side channel if the LLM interface gains native skill-loading support

For the current codebase, a normal tool is the simplest fit because the agent already supports tool calling and round-tripping results.

Recommended tool contract:

- input: `skill_name` or `skill_id`
- authorization: must resolve only within the role allowlist
- output:
  - metadata
  - normalized skill body
  - selected references
  - required tool reminder

The tool result should be designed for direct model consumption, not for user display.

### 4. Reference Selection

References should remain lazy. They are selected only when a skill is loaded.

Selection rules:

- only files under the loaded skill package are considered
- only readable reference types are eligible
- selection may use the current user text plus the skill body
- truncation budgets remain enforced

Unlike today, references must not be selected or injected for skills that the model never loaded.

## Runtime Changes

### Agent Request Construction

`packages/core/src/llm/agent.ts` should stop calling the current "build full skill prompt" path before the first model response.

Instead it should:

1. parse role-allowed skill IDs
2. ask `SkillManager` for authorized metadata only
3. include an `available_skills` system block summarizing those skills
4. include the new skill-load tool in the allowed tools list when at least one skill is authorized

Once the model loads a skill, the tool result becomes part of the normal tool call transcript and therefore part of the reasoning context for later rounds.

### Ordering

Authorized skill order must be stable and follow the role's selected order.

This means the DB query path that fetches enabled skills by ID cannot rely on unspecified database ordering. The returned rows should be reordered to match the incoming allowed ID list before prompt formatting.

### Caching

Per-turn caching is sufficient for the first version:

- if the model loads the same skill twice in one request cycle, return the cached content
- a new user turn starts clean and re-evaluates skill needs

Cross-turn persistence is not required and risks stale context.

## Panel and UX Changes

### Role Editor

Role settings should describe selected skills as permission, not automatic behavior.

Current copy such as "enabled skills will be applied" should change to wording closer to:

- "允许模型在需要时使用这些技能"
- "未勾选的技能对模型不可见"

The missing tool dependency warning remains useful and should stay.

### Skill Settings

Skill management UI remains mostly the same, but validation and messaging should improve:

- import/create/update should reject invalid frontmatter with a clear error
- standard YAML skill packages should import successfully
- fields ignored by runtime should not crash the parser

## Error Handling

### Invalid Skill Package

- malformed frontmatter should fail validation during create/import/update with a clear API error
- invalid skill packages should not be partially accepted

### Unauthorized or Unknown Load Request

- treat as a defensive runtime error
- return a terse internal error string
- log the rejection for debugging

This should not happen in normal operation because unauthorized skills are invisible.

### Missing Required Tools

- skill discovery still works
- load result includes the declared required tools
- panel warning remains the main operator-facing signal
- no automatic tool enablement is performed

### Oversized References

- continue truncating to prompt budget
- log clipping for maintainers
- never fail the whole skill load solely because a reference exceeded budget

## Data Model Impact

No schema migration is required for the first phase.

- `enabledSkills` remains stored as-is
- semantic interpretation changes from "inject these" to "allow these"

If later needed, naming cleanup can happen at the code level without changing persisted payloads immediately.

## Testing Strategy

### SkillManager Tests

Add coverage for:

- YAML frontmatter parsing with multiline values and list syntax
- BOM-prefixed skill files
- metadata-only discovery for authorized skills
- stable ordering matching requested IDs
- load authorization checks
- reference selection occurring only after load
- reference truncation behavior

### Agent / Runtime Tests

Add coverage for:

- initial model request includes `available_skills` metadata but not full skill bodies
- skill-load tool is only exposed when authorized skills exist
- model can load an authorized skill and receive normalized body content
- unauthorized skills are absent from initial prompt and cannot be loaded
- same skill is not reloaded repeatedly within one turn

### Panel Tests or Targeted UI Verification

Verify:

- role editor copy reflects allowlist semantics
- missing tool dependency warning still appears
- invalid skill imports surface readable errors

## Rollout Notes

This is a behavioral breaking change by design.

Existing roles that selected skills will continue to have access to those skills, but the model will stop receiving all skill bodies automatically. That is the intended outcome.

Operationally, success means:

- prompt size drops for roles with many skills
- skill usage becomes explicit and inspectable through tool calls
- standard skill packages import and behave predictably

## Implementation Boundaries

The first implementation should stay minimal:

- do not build a global semantic skill search across every installed skill
- do not auto-enable tools from skill metadata
- do not introduce cross-turn skill memory
- do not redesign the panel beyond wording and validation needed for the new semantics

## Acceptance Criteria

The redesign is complete when all of the following are true:

1. A role-selected skill is visible to the model as metadata only before use.
2. An unselected skill is completely invisible to the model.
3. The model must explicitly load a visible skill before receiving its full body.
4. Full skill content is no longer injected automatically at turn start.
5. Standard YAML frontmatter skill files import and parse correctly.
6. Role-selected skill order is preserved in discovery output.
7. Panel wording reflects permission semantics instead of automatic application.
8. Required tool declarations remain informational and operator-visible, but do not auto-enable tools.
