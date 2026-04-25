# Refactor Plan

This plan keeps production behavior stable while reducing single-file scope and making future feature work safer. Each phase should be small enough to build, commit, deploy, and roll back independently.

## Rules

- Prefer behavior-preserving extraction before feature changes.
- Keep API contracts, database schema, Discord behavior, and panel routes stable unless a phase explicitly says otherwise.
- After each phase, run the smallest affected build and update this file.
- Commit each completed phase before moving to the next phase.
- Do not include `.opencode/`, generated build output, logs, runtime DB files, or manual test artifacts in commits.

## Phase 1: Core API Foundation

Status: Completed

- [x] Move core API JSON/body/error helpers out of `packages/core/src/api/server.ts`.
- [x] Keep route behavior unchanged.
- [x] Build `@zakobot/core`.
- [x] Commit and deploy.

## Phase 2: Core API Routes

Status: Completed

- [x] Extract route handlers by domain: status/plugins, settings, bots, roles, conversations, MCP, skills.
- [x] Extract status/plugins routes.
- [x] Extract settings routes.
- [x] Extract skills routes.
- [x] Extract roles routes.
- [x] Extract bots routes.
- [x] Extract conversations routes.
- [x] Extract MCP routes.
- [x] Extract serializers for bot, role, conversation, MCP profiles.
- [x] Extract request validators/normalizers for editor payloads.
- [x] Keep `ApiServer` as a thin router/server coordinator.
- [x] Build `@zakobot/core`.
- [x] Commit and deploy.

## Phase 3: LLM Client Providers

Status: Completed

- [x] Split OpenAI-compatible request/stream logic from `packages/core/src/llm/client.ts`.
- [x] Split Vertex request/stream logic into a provider module.
- [x] Extract common tool execution and approval result formatting.
- [x] Keep public `LLMClient` behavior unchanged.
- [x] Build `@zakobot/core`.
- [x] Commit and deploy.

## Phase 4: Discord Adapter Boundaries

Status: Completed

- [x] Extract slash command registration and handlers.
- [x] Extract approval UI and approval state handling.
- [x] Extract thread/session routing helpers.
- [x] Keep Discord user-facing behavior unchanged.
- [x] Build `@zakobot/core`.
- [x] Commit and deploy.

## Phase 5: Memory Architecture

Status: Completed

- [x] Move memory extraction prompt/parsing out of `Agent`.
- [x] Move memory ranking/search terms out of `LocalMemoryService` if it grows further.
- [x] Add clear logs for memory save/list/delete and background extraction outcomes.
- [x] Decide panel visibility for stored memories is not needed yet; keep settings-only UI for now.
- [x] Build affected packages.
- [x] Commit and deploy.

## Phase 6: Panel Feature Structure

Status: Completed

- [x] Move panel API wrappers into feature composables under `composables/api/`.
- [x] Split large Vue pages into page shell + feature components.
- [x] Extract reusable form state/normalization into composables or utilities.
- [x] Preserve Nuxt routes and visual behavior.
- [x] Run `@zakobot/panel typecheck` and build.
- [x] Commit and deploy.

## Phase 7: Shared Runtime Contracts

Status: Pending

- [ ] Centralize shared payload parsing/validation where core and panel currently duplicate assumptions.
- [ ] Decide whether to introduce schema validation library only after duplication is visible from earlier phases.
- [ ] Build `shared`, affected packages, and panel typecheck.
- [ ] Commit and deploy.

## Phase 8: Cleanup And Runtime Hygiene

Status: Pending

- [ ] Remove manual test artifacts from the runtime workspace when safe.
- [ ] Review service restart/build workflow documentation.
- [ ] Review logs for noisy or missing operational events.
- [ ] Full `pnpm build`.
- [ ] Commit and deploy.
