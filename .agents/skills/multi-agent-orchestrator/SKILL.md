---
name: multi-agent-orchestrator
description: >
  A highly intelligent skill that reverse-engineers a codebase, designs a
  typed multi-agent team to rebuild it, and emits a working Replit multi-agent
  workflow (handoff artifacts, acceptance criteria, orchestrator script).
  Grounded in the order-mgr / api-server / lib/* pattern observed in this
  workspace. Applicable to any TypeScript mono-repo that follows the same
  pnpm-workspace + OpenAPI-first + Drizzle-ORM + React-Native / Expo structure.
---

# Multi-Agent Orchestrator Skill

## Overview

This skill drives a **three-phase pipeline**:

1. **PHASE 1 — REVERSE-ENGINEER** the source codebase into a structured report.
2. **PHASE 2 — DEFINE THE AGENT TEAM** that would rebuild it.
3. **PHASE 3 — EXECUTE AS A REPLIT MULTI-AGENT WORKFLOW** with file-based handoffs.

Each phase is gated: the orchestrator **must not** proceed to the next phase until
the previous phase's acceptance criteria are verified.

---

## Conventions Observed in This Workspace

The patterns below were extracted from `artifacts/order-mgr` + `artifacts/api-server` +
`lib/*`. Every agent you spin up for a project in this workspace **must respect them**.

### Naming
- Package names follow `@workspace/<artifact>` (e.g. `@workspace/order-mgr`, `@workspace/api-server`).
- Files use kebab-case for directories, PascalCase for React components, camelCase for utilities.
- All exported React hooks are prefixed `use` (e.g. `useDatabase`, `useColors`).

### Error Handling
- Synchronous DB calls (expo-sqlite) are wrapped in `try {} catch {}` that return empty arrays — never throw.
  `DatabaseContext.tsx:79` -> `catch { return []; }`
- API server startup validates env vars eagerly and exits on failure.
  `api-server/src/index.ts:6-9` -> throws if `PORT` is undefined.
- React render errors are caught by a class-based `ErrorBoundary` at root level.
  `_layout.tsx:56` wraps the whole tree.

### Logging
- Backend uses **pino** with structured JSON in prod, `pino-pretty` in dev.
  `lib/logger.ts:5-20` — `LOG_LEVEL` env var controls verbosity; sensitive headers are redacted.
- Mobile uses `console.warn(...)` for non-fatal notification scheduling failures.
  `utils/notifications.ts:56`

### Config Management
- All env vars are validated at startup, never at call-site.
- `DATABASE_URL` and `PORT` must be present or the process throws immediately.
- The mobile app uses `AsyncStorage` (web) / `expo-sqlite` (native) with a
  `Platform.OS === 'web'` branch guard.

### Interface Contracts
- The OpenAPI spec at `lib/api-spec/openapi.yaml` is the **single source of truth**.
- **Orval** generates both the React-Query client (`lib/api-client-react`) and the
  Zod validators (`lib/api-zod`) from that spec — never hand-write these files.
- Zod schemas are used in routes to parse/validate (`HealthCheckResponse.parse(...)`)
  before returning any response.

### Testing Patterns
- No test files found in the codebase (gap — see Phase 1 section 5).
- Acceptance criteria rely on TypeScript `tsc --noEmit` + runtime smoke tests.

### State / Persistence
- Mobile state lives entirely in React Context (`DatabaseProvider`).
- No remote sync between the mobile app and the API server yet — the app is fully
  offline-capable (gap).
- ID generation: `Date.now().toString(36) + Math.random().toString(36).substr(2,6)`
  — non-cryptographic, collision-risk at scale (gap).

---

## PHASE 1 — Reverse-Engineer Template

When invoked, the orchestrator agent **must** produce a report with these sections:

```
## Architecture Map
<table: file | module | responsibility | agent-boundary>

## Build Order (Sequencing Evidence)
<ordered list with justification>

## Conventions & Standards
<convention | file:line evidence | status: ok / gap>

## Distributed-Systems Patterns
<pattern | location | correct? | risks>

## Gaps & Risks
<numbered list: missing feature | severity | recommendation>
```

### Specific checks for this workspace

| Check | Where to look |
|---|---|
| Health endpoint only returns `{ status }` — no DB ping | `api-server/src/routes/health.ts:6-8` |
| Schema file is empty (all commented out) | `lib/db/src/schema/index.ts:20` -> `export {}` |
| No migration history | `lib/db/` has no `migrations/` directory |
| No dead-letter / retry on notification scheduling | `utils/notifications.ts:55` — bare `console.warn` |
| No request timeout on Express | `api-server/src/app.ts` — no timeout middleware |
| Smart-paste is regex-only, no LLM | `utils/smartPaste.ts` — no API call |
| No idempotency key on `addOrder` | `DatabaseContext.tsx:130` — client-generated `genId()` |
| No auth on API server | `api-server/src/app.ts:28` — `cors()` but no JWT/session middleware |
| `lib/api-client-react` and `lib/api-zod` generated dirs are empty | `src/generated/` only has `api.ts` stub |

---

## PHASE 2 — Agent Team Definition

### Standard Team for This Architecture

#### Agent 0 — Orchestrator
- **Owns**: `orchestrator.ts` (root script), reads all handoff artifacts
- **Inputs**: user goal, source codebase path
- **Outputs**: run log, final integration report
- **Acceptance gate**: all downstream agents complete without error; integration smoke test passes

#### Agent 1 — Architect
- **Single responsibility**: define service boundaries, data contracts, tech choices
- **Inputs**: Phase-1 report
- **Outputs** (files):
  - `handoffs/architecture.json` — service list, boundaries, data flow
  - `handoffs/openapi.yaml` — complete OpenAPI 3.1 spec for all endpoints
  - `handoffs/db-schema.ts` — Drizzle table definitions (not empty!)
- **Acceptance criteria**:
  - `openapi.yaml` validates with `openapi-schema-validator`
  - `db-schema.ts` compiles with `tsc`
  - All entity types from `order-mgr/types/index.ts` are represented

#### Agent 2 — Data / Persistence
- **Single responsibility**: schema, migrations, seed data
- **Inputs**: `handoffs/db-schema.ts`
- **Outputs**:
  - `lib/db/src/schema/*.ts` — one file per entity (orders, products)
  - `lib/db/src/migrations/` — drizzle migration SQL files
  - `handoffs/db-ready.flag` — written only after `drizzle-kit push` succeeds
- **Acceptance criteria**:
  - `drizzle-kit push` exits 0
  - `SELECT 1` against the DB succeeds via the pool
  - All columns from `DatabaseContext.tsx` DDL match the Drizzle schema

#### Agent 3 — API Server
- **Single responsibility**: implement all REST routes defined in `handoffs/openapi.yaml`
- **Inputs**: `handoffs/openapi.yaml`, `handoffs/db-ready.flag`, `@workspace/db`, `@workspace/api-zod`
- **Outputs**:
  - `artifacts/api-server/src/routes/*.ts` — one router file per resource
  - `handoffs/api-server-ready.flag`
- **Acceptance criteria**:
  - TypeScript compiles (`tsc --noEmit`)
  - `GET /api/healthz` returns `200 { status: "ok" }`
  - `GET /api/orders` returns `200 []` on empty DB
  - `POST /api/orders` with valid body returns `201` with `id`
  - Zod parse error on invalid body returns `422`

#### Agent 4 — Messaging / Integration
- **Single responsibility**: scheduled notifications, CSV/JSON export, smart-paste parser
- **Inputs**: `handoffs/architecture.json`, domain types
- **Outputs**:
  - `artifacts/order-mgr/utils/notifications.ts` — upgraded with retry + idempotency key store
  - `artifacts/order-mgr/utils/smartPaste.ts` — optional LLM upgrade path documented
  - `handoffs/integration-ready.flag`
- **Acceptance criteria**:
  - `scheduleOrderReminder` is idempotent (calling twice for same orderId does not double-schedule)
  - `parseOrderText` unit tests pass (regex coverage for 5+ message formats)

#### Agent 5 — Mobile App
- **Single responsibility**: React Native / Expo screens, DatabaseContext, UI components
- **Inputs**: `handoffs/api-server-ready.flag`, `handoffs/openapi.yaml`, domain types
- **Outputs**:
  - `artifacts/order-mgr/context/DatabaseContext.tsx` — upgraded with remote sync option
  - All screen files updated to consume new endpoints via `@workspace/api-client-react`
  - `handoffs/mobile-ready.flag`
- **Acceptance criteria**:
  - `tsc --noEmit` in `artifacts/order-mgr/` exits 0
  - Expo web build succeeds (`expo export --platform web`)
  - All 5 tabs render without crash in web mode

#### Agent 6 — Testing / Verification
- **Single responsibility**: write and run integration tests across service boundaries
- **Inputs**: all `*.flag` handoffs
- **Outputs**:
  - `tests/integration/*.test.ts`
  - `handoffs/tests-passed.flag`
- **Acceptance criteria**:
  - All tests pass (`vitest run`)
  - Coverage >= 70% on route handlers
  - At least 1 cross-service test: mobile -> API -> DB -> response

#### Agent 7 — Reviewer
- **Single responsibility**: final gate; checks every handoff artifact against contracts
- **Inputs**: all `handoffs/*.flag` files + Phase-1 gap list
- **Outputs**: `handoffs/review-report.md`
- **Acceptance criteria**:
  - Every gap from Phase-1 section 5 is either fixed or has a documented deferral reason
  - No `TODO` or `FIXME` in any handoff-produced file
  - OpenAPI spec and Zod validators are in sync (generated, not hand-written)

---

## PHASE 3 — Replit Multi-Agent Workflow

### Directory Layout

```
.agents/
  skills/multi-agent-orchestrator/
    SKILL.md           <- this file
    scripts/
      orchestrate.ts   <- orchestrator runner
      verify-handoff.ts
    references/
      handoff-schema.json
handoffs/              <- file-based message bus between agents
  architecture.json
  openapi.yaml
  db-schema.ts
  db-ready.flag
  api-server-ready.flag
  integration-ready.flag
  mobile-ready.flag
  tests-passed.flag
  review-report.md
```

### Orchestrator Execution Order

```
[Agent 1: Architect]
    -> writes handoffs/architecture.json + openapi.yaml + db-schema.ts
    -> orchestrator runs: npx openapi-schema-validator handoffs/openapi.yaml
[Agent 2: Data/Persistence]
    -> reads handoffs/db-schema.ts
    -> writes lib/db/src/schema/, runs drizzle push
    -> writes handoffs/db-ready.flag
[Agent 3: API Server]  (reads db-ready.flag)
    -> writes routes, runs tsc + smoke tests
    -> writes handoffs/api-server-ready.flag
[Agent 4: Messaging]   (parallel with Agent 3 after Architect)
    -> writes notification + export utils
    -> writes handoffs/integration-ready.flag
[Agent 5: Mobile App]  (reads api-server-ready.flag + integration-ready.flag)
    -> writes screens + context
    -> writes handoffs/mobile-ready.flag
[Agent 6: Testing]     (reads all flags)
    -> writes + runs tests
    -> writes handoffs/tests-passed.flag
[Agent 7: Reviewer]    (reads tests-passed.flag)
    -> writes handoffs/review-report.md
```

### Handoff Contract Schema

Each agent **must** read the handoff files it depends on before writing any code.
If a required handoff file is missing, the agent **must** stop and report
`BLOCKED: missing <filename>` rather than proceeding with assumptions.

### Scoped Permissions per Agent

| Agent | May write to | May NOT touch |
|---|---|---|
| Architect | `handoffs/` | `artifacts/`, `lib/` |
| Data | `lib/db/src/`, `handoffs/` | `artifacts/`, other `lib/` |
| API Server | `artifacts/api-server/src/`, `handoffs/` | `artifacts/order-mgr/`, `lib/db/` |
| Messaging | `artifacts/order-mgr/utils/`, `handoffs/` | `artifacts/api-server/`, `lib/db/` |
| Mobile App | `artifacts/order-mgr/` (excl. utils/), `handoffs/` | `artifacts/api-server/`, `lib/db/` |
| Testing | `tests/`, `handoffs/` | all `src/` and `artifacts/` |
| Reviewer | `handoffs/review-report.md` | everything else |

### Tradeoff Flags — Surface to User Before Agent 1 Runs

1. **Who owns the canonical Order entity?**
   Currently: mobile app owns it locally (SQLite). Option A: keep local-first + sync.
   Option B: API server is source of truth, mobile is a thin client.
   *Default: A (local-first with sync) — flag if you want B.*

2. **Authentication strategy?**
   Currently: none. Option A: API key per device. Option B: JWT + refresh tokens.
   *Default: A (simpler for solo-seller use case) — flag if you want B.*

3. **Smart-paste: regex vs. LLM?**
   Currently: regex only. Option A: keep regex (no API key needed).
   Option B: call OpenAI / Gemini for extraction (needs key + cost).
   *Default: A — flag if you want B.*

---

## How to Invoke This Skill

In any conversation, trigger this skill by saying:

> "Run the multi-agent orchestrator on `<path/to/codebase>`"

The orchestrator will:
1. Traverse the codebase and emit a Phase-1 report artifact.
2. Present the agent team plan and tradeoff flags for user approval.
3. Upon approval, execute agents in dependency order, writing handoff files after each.
4. Emit a final `handoffs/review-report.md` summarizing all changes and gaps resolved.

**Never skip Phase 1.** Code generated without grounding in the actual patterns of
the source system will drift from what the user wants replicated.
