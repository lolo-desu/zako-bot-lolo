# ZakoBot Skill Standardization Design

## Goal

Standardize the currently used ZakoBot runtime skills so they follow a more consistent Claude Code / OpenCode / superpowers-style `SKILL.md` structure, while also enabling the `Markdown Table Image Reply` skill for both `Lolo Role` and `Airly Role`.

This work is limited to ZakoBot's own runtime skills and role skill assignments.

## Scope

In scope:

- Rewrite the currently active ZakoBot runtime skills into a more consistent best-practice format.
- Allow behavior adjustments inside those skills when they improve safety, clarity, trigger quality, or execution quality.
- Keep browser isolation between `Lolo` and `Airly` intact.
- Add `Markdown Table Image Reply` to both `Lolo Role` and `Airly Role`.

Out of scope:

- Editing `.opencode/skills` or other external skill collections.
- Changing the general skill runtime semantics that were just shipped.
- Refactoring role system prompts as part of this task.
- Introducing a larger skill taxonomy or splitting one skill into many new runtime skills.

## Current Runtime Skills

The current runtime skill inventory is:

1. `Browser Workflow`
2. `Markdown Table Image Reply`
3. `Current VPS Environment`

Current role visibility:

- `Shared Role`: `Browser Workflow`, `Current VPS Environment`
- `Lolo Role`: `Browser Workflow`, `Current VPS Environment`
- `Airly Role`: `Browser Workflow`, `Current VPS Environment`

`Markdown Table Image Reply` exists and is enabled in the skill library, but it is not currently assigned to any role.

## Problems to Fix

### Inconsistent skill structure

The three skills do not share one consistent format.

- `Browser Workflow` already has frontmatter and good operational guidance, but it is mostly a flat rule list.
- `Current VPS Environment` is complete, but it reads more like an internal note dump than a strongly triggered reference skill.
- `Markdown Table Image Reply` is the least standardized one because it lacks YAML frontmatter and has a weaker trigger/constraint layout.

This inconsistency makes skill discovery and loading less predictable for the model.

### Uneven trigger quality

The current skills do not always make it equally clear:

- when the skill should be loaded
- when the skill should not be loaded
- what ordered workflow should be followed after loading
- what hard constraints must not be broken

### Role assignment gap

`Markdown Table Image Reply` is useful for both Discord-facing roles but is not authorized for either `Lolo Role` or `Airly Role`, so those roles cannot currently discover or load it.

## Design Principles

The standardized ZakoBot skills should follow these principles:

1. Use valid YAML frontmatter consistently.
2. State a crisp purpose and trigger condition.
3. Separate "when to use" from "how to execute".
4. Prefer ordered workflows over loose rule piles.
5. Keep hard constraints explicit.
6. Stay grounded in the current repository, VPS, and tool reality.
7. Avoid promising capabilities that the current role or runtime does not actually have.

## Target Skill Format

Each runtime skill should move toward this structure:

1. YAML frontmatter
2. Short title
3. "When to use"
4. "Do not use when" or equivalent exclusions when useful
5. "Workflow" or ordered execution steps
6. "Constraints" or hard rules
7. Optional environment-specific notes if the skill depends on current deployment facts

The exact wording can vary by skill, but the layout and intent should be consistent enough that the model gets a stable pattern across all ZakoBot-owned skills.

## Per-Skill Design

### Browser Workflow

This remains a workflow skill.

It should be standardized to:

- clearly state that local tools come first
- clearly state that it is only for live page interaction, login, or anti-bot-gated flows
- preserve the hard rule that a bot may only use its own assigned browser MCP tools
- preserve the rule that the status tool should be checked first
- preserve the escalation path from headless automation to manual takeover only when necessary
- preserve cleanup guidance to stop the browser when no longer needed

Behaviorally, this skill should remain strict, because it protects browser isolation and VPS resource usage.

### Markdown Table Image Reply

This should become a proper formatting/output skill with full frontmatter.

It should be standardized to:

- clearly state that it applies when Discord-friendly image output is requested or materially improves readability
- clearly state that normal Markdown output remains preferred when an image is unnecessary
- define the expected workflow: prepare compact table, set optional title, call `render_markdown_table_image`, keep surrounding text short
- define table-quality constraints: standard pipe table, sensible width, concise content

Behaviorally, this skill may become slightly more proactive than the current version, but only when image output clearly improves the result in the Discord context.

### Current VPS Environment

This should remain a reference skill, but it needs stronger trigger boundaries.

It should be standardized to:

- clearly state that it is for questions about the current host, deployment, paths, bot setup, browser environment, and operating facts
- distinguish static facts from real-time state that must be verified via tools
- preserve the rule that sensitive values should not be exposed unless the user explicitly asks
- preserve the current environment facts that are actually true for this VPS and deployment

Behaviorally, this skill should become more explicit about when to verify instead of answering from static knowledge.

## Browser Isolation Guarantee

This task must not weaken the current Lolo/Airly browser separation.

The guarantee comes from two layers:

1. `Browser Workflow` will continue to instruct the model to only use the browser tools assigned to the current bot.
2. Each role only has its own browser MCP tool names enabled:
   - `Lolo Role` only has `mcp__persistent_browser__lolo_*`
   - `Airly Role` only has `mcp__persistent_browser__airly_*`

Even if both roles see the same standardized `Browser Workflow` skill, they should still only be able to act through their own enabled tool set.

## Role Assignment Changes

After this work:

- `Lolo Role` should gain `Markdown Table Image Reply`
- `Airly Role` should gain `Markdown Table Image Reply`

No other role skill assignments need to change unless implementation reveals that `Shared Role` also needs the same authorization and that is explicitly approved later.

## Implementation Outline

Implementation should proceed in this order:

1. Read current skill contents and preserve any required facts/constraints.
2. Rewrite the three ZakoBot runtime skills into the standardized structure.
3. Update `Lolo Role` and `Airly Role` skill authorization to include `Markdown Table Image Reply`.
4. Verify through the core API that:
   - the updated skill contents are stored correctly
   - both roles now include the image skill
   - browser-related role tool assignments remain role-local

## Verification

Minimum verification for this work:

1. Fetch `/skills` and the updated `/skills/:id/content` payloads to confirm content changes.
2. Fetch `/roles` to confirm both target roles now include the image skill id.
3. Re-check that `Lolo Role` still only has `lolo_*` browser tools and `Airly Role` still only has `airly_*` browser tools.

If implementation touches runtime files instead of only stored skill content and role records, then package verification would also be required. If this remains a runtime-data/config update only, API verification is sufficient.

## Risks

### Over-standardizing reference skills

If `Current VPS Environment` is rewritten too aggressively, it may lose useful local facts or become too generic to help. The rewrite must preserve current deployment-specific truth.

### Over-expanding image usage

If `Markdown Table Image Reply` becomes too eager, the bot may start using images in cases where plain text would be better. The standardized version should still keep image output conditional on clear value.

### Hidden cross-role leakage concerns

The design intentionally relies on both skill guidance and tool allowlists for browser isolation. Verification must explicitly confirm the role tool sets remain separated after the role skill update.

## Success Criteria

This task is successful when:

1. All three ZakoBot runtime skills are rewritten into a consistent best-practice structure.
2. `Markdown Table Image Reply` has valid frontmatter and clear trigger/constraint language.
3. `Lolo Role` and `Airly Role` both have the image skill authorized.
4. Browser isolation between `Lolo` and `Airly` remains intact.
5. The stored skill library and role API responses reflect the expected new state.
