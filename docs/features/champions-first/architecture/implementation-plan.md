# Champions-first — Implementation Plan

Mode: PM. Orchestrator: follow the Build Manifest; prose wins on conflict. Three clients ship together (CF-OPS-BR-4) — **do not merge web to `develop` until P7+P8 land on the same branch** (one agent branch / stacked PRs is fine).

Requirements: `docs/features/champions-first/requirements/`.

## File Structure (Ownership Map)

Legend: **M** modify · **C** create · **D** delete.

### P1 — TurnScope

| File | Purpose |
|------|---------|
| M `web/src/app/api/chat/route.ts` | Always `ctx.mode = "champions"`; ignore `scope_seed` / `champions_mode` / detect-scope / last_used_scope for routing; SSE scope always champions; mentioned teams living-only |
| M `web/src/app/api/chat/route.test.ts` | Pin ignore-seed + always champions |
| M `web/test/api-chat.integration.test.ts` | Replace natdex/champions_mode tests |
| M `web/src/app/api/scope/route.ts` | Ack champions only; do not persist other formats |
| M `web/src/app/api/scope/route.test.ts` | |
| M `web/src/app/api/auth/me/route.ts` | `lastUsedScope: "champions"` |
| M `web/src/app/api/auth/me/route.test.ts` | |
| D or unhook `web/src/lib/scope/detect-scope.ts` | Stop importing from chat route; delete file + `detect-scope.test.ts` if unused |

### P2 — ReferenceCutover

| File | Purpose |
|------|---------|
| C `web/drizzle/0023_champions_only.sql` | DELETE non-champions index rows; DROP wiki/natdex/encounters/pmd/meta tables |
| M `web/drizzle/meta/_journal.json` + snapshot json | Journal the migration |
| M `web/src/data/schema.ts` | Remove dropped table defs |
| M `web/src/data/schema.test.ts` | |
| M `web/src/data/formats.ts` | `DEFAULT_FORMATS = ["champions"]`; keep `FORMATS` union for stored rows; comments |
| M `web/src/data/formats.test.ts` | |
| M `web/src/ingest/run.ts` | Champions-only default; remove wiki/natdex/meta/encounter write paths |
| D ingest builders only used for dropped tables | e.g. wiki/natdex/meta/encounter builders under `web/src/ingest/` |
| D `web/src/data/repos/wiki-repo.ts` (+ tests) | |
| D `web/src/data/repos/meta-repo.ts` (+ tests) | |
| M `web/src/data/sql-sandbox.ts` | Allowlist = remaining index tables + item exclusion |
| M `web/test/fixtures/tools-fixture.ts` | Champions partition; drop extra-format seeds needed only for wiki/OU |
| M `web/eval/fixtures/seed-fixture-db.ts` | Champions seed |

### P3 — AgentToolsAndPrompt

| File | Purpose |
|------|---------|
| M `web/src/agent/tools/index.ts` | Barrel = remaining 17 tools (ADR-2) |
| D `web/src/agent/tools/get-encounters.ts` (+ tests) | |
| D `web/src/agent/tools/run-sql.ts` (+ oracle tests) | |
| D `web/src/agent/tools/search-wiki.ts` (+ tests) | |
| D `web/src/agent/tools/get-meta-usage.tool.ts` (+ tests) | |
| M `web/src/agent/tools/voice-gating.ts` | Drop T18/T19 names |
| M `web/src/agent/tools/get-pokemon.ts` `get-move.ts` `get-ability.ts` `get-item.ts` `resolve-entity.ts` `lookup-box.ts` | Remove `exists_in_standard` |
| M `web/src/agent/tools/get-evolution-chain.ts` | No SV fallback |
| M `web/src/agent/schemas.ts` | Remove input/output Zod for deleted tools |
| M `web/src/agent/prompts/domain.ts` | Champions-only body; decline copy; no warehouse DDL; no wiki/SQL/OU routing |
| M `web/src/agent/prompts/champions.ts` | Remove exists_in_standard / whole-games / wiki notes; keep Stat Points, Mega, T15, item pool |
| D `web/src/agent/prompts/gen-info.ts` `natdex.ts` `warehouse-ddl.ts` (+ tests) | |
| M `web/src/agent/prompts/voice.ts` `voice-compile.ts` | Champions coach + same decline |
| M `web/src/agent/teams-assistant/prompts/domain.ts` | Champions-only |
| M `web/src/agent/prompts/style.test.ts` `parity.test.ts` | Pin remaining tools + decline; drop eleven-format lock-step |

### P4 — TeamLifecycle (API)

| File | Purpose |
|------|---------|
| M `web/src/data/repos/team-repo.ts` | `listTeams(..., { archived })`; create always champions |
| M `web/src/data/repos/team-repo.test.ts` | |
| M `web/src/app/api/teams/route.ts` | GET living vs `?archived=1`; POST ignore format |
| M `web/src/app/api/teams/teams.route.test.ts` `teams.integration.test.ts` | |
| M `web/src/app/api/teams/[id]/route.ts` | PATCH 409 archived; GET includes format |
| M `web/src/app/api/teams/[id]/duplicate/route.ts` | 409 archived |
| M `web/src/app/api/teams/import/route.ts` | Always champions; Tera drop; EVs as SP |
| M `web/src/server/teams/import-export.ts` | Same rules |
| M `web/src/server/teams/validate-team.ts` | Already 66/32 for champions; ensure living path always that format |
| M `web/src/agent/tools/list-teams.tool.ts` | Living only |
| M `web/src/agent/tools/get-team.tool.ts` | Miss if archived |
| M `web/src/agent/tools/save-team.tool.ts` | Always champions |

### P5 — UsageGateway + apply-set + threat board + web Usage pages

| File | Purpose |
|------|---------|
| M `web/src/server/champions-usage/usage-client.ts` | `listLeaderboard(ladder)` bulk; no N+1 |
| C `web/src/server/champions-usage/usage-client.test.ts` | Mock bulk payload / unavailable |
| C `web/src/app/api/usage/route.ts` | GET leaderboard |
| C `web/src/app/api/usage/[slug]/route.ts` | GET species |
| C tests for those routes | |
| M `web/src/server/teams/set-template.ts` | Champions live usage → TeamMember |
| M `web/src/app/api/teams/set-template/route.ts` | `species` only |
| M `web/src/server/teams/threat-board.ts` | Live Doubles leaderboard; fail-soft |
| M `web/src/server/teams/analyze-team.ts` | Wire Champions threat path |
| C `web/src/app/(reference)/usage/page.tsx` | Leaderboard UI |
| C `web/src/app/(reference)/usage/[slug]/page.tsx` | Drill-in + Apply |
| M `web/src/app/(reference)/meta/**` | Redirect to `/usage` |
| M `web/src/components/nav/nav-items.ts` | Usage in primary nav |
| D or stop `web/src/data/meta-pages.ts` `meta-formats.ts` public use | After redirects |
| M `web/src/app/sitemap.ts` | Usage URLs; drop OU shards |

### P6a — Web chrome / copy / chip / starters

| File | Purpose |
|------|---------|
| M `web/src/components/controls/ScopeChip.tsx` | Become display-only **RegulationChip** (or replace). No format menu |
| M `web/src/components/controls/ScopeChip.test.tsx` | |
| M `web/src/app/page.tsx` | No scope picker; display regulation; default champions |
| M `web/src/components/chat/ChatThread.tsx` | Empty-state copy (CF-UI-AC-3.1) |
| M `web/src/components/landing/landing-content.ts` | Champions-only FAQ/features |
| M `web/src/lib/site.ts` | Title/description |
| M `web/src/lib/example-prompts.ts` | Champions starters only |
| M generated `ios/.../ExamplePrompts.swift` `android/.../ExamplePrompts.kt` | via `npm run sync:starters` — **P7/P8 must not hand-edit** |

### P6b — Web teams UI

| File | Purpose |
|------|---------|
| M `web/src/app/teams/page.tsx` | Living list; Archived section; create no format picker |
| M `web/src/components/teams/TeamMemberPanel.tsx` | Hide Tera, IV, level; Stat Point budget UI |
| M related team editor components | Apply-set + confirm replace (CF-TEAM-AC-6.3) |
| M `web/test/page-team-builder.fullstack.test.tsx` | |

### P6c — Web Dex / calc / entity

| File | Purpose |
|------|---------|
| M `web/src/app/(reference)/pokedex/**` `moves/**` `abilities/**` `items/**` | Champions roster only; no format chips; 404 unknown slugs |
| M `web/src/data/reference-pages.ts` `entity-profile.ts` | No other-format extras |
| M `web/src/app/api/entity/route.ts` | Default champions; remove natdex fallback |
| M `web/src/app/api/search/route.ts` | Champions only |
| M `web/src/app/calc/page.tsx` | No format picker; L50 SP |
| M `web/src/components/reference/**` UsageBlock | Point at live usage API not Smogon |

### P7 — iOS

| File | Purpose |
|------|---------|
| M `ios/OakApp/App/RootView.swift` | Fifth tab Usage (ADR-6) |
| M `ios/OakApp/Features/Chat/*` | Regulation chip; ignore scope_seed; empty copy |
| M `ios/OakApp/Features/Teams/*` | Archive section; hide Tera/IV/level; apply-set confirm; create champions |
| C `ios/OakApp/Features/Usage/*` | Leaderboard + drill-in (same API) |
| M `ios/OakApp/Features/Dex/*` | Champions default; no format picker |
| M `ios/OakApp/Features/Calc/*` | L50 SP |
| M `ios/OakApp/Models/Wire/Format.swift` `ChatWire.swift` | Keep enum for decode; stop sending other-format seeds |
| M `ios/OakAppTests/**` | Mirror above |
| *(not owned)* ExamplePrompts.swift | P6a generated |

### P8 — Android

| File | Purpose |
|------|---------|
| M `android/.../app/OakApp.kt` / Dex navigation | Usage as Dex section (ADR-6) |
| M `android/.../features/chat/*` | Regulation chip; empty copy |
| M `android/.../features/teams/*` | Archive; editor knobs; apply-set confirm |
| C `android/.../features/usage/*` or Dex Usage screens | Same API |
| M `android/.../features/dex/*` `calc/*` | Champions only; L50 SP |
| M `android/.../wire/Format.kt` `ChatWire.kt` | Decode old formats; don’t send seeds |
| M `android/.../test/**` | |
| *(not owned)* ExamplePrompts.kt | P6a generated |

### P9 — Eval, runbooks, store copy

| File | Purpose |
|------|---------|
| M `web/eval/cases.ts` | Champions goldens (Stat Points, T15, Mega, off-roster decline); drop wiki/SQL/OU/G55-fallback |
| M `README.md` `AGENTS.md` `CLAUDE.md` | Champions-first truth; append-only exception (ADR-2); ingest default |
| M `docs/app-store/ios.md` | CF-INT-BR-10 |
| M `web/src/app/privacy/page.tsx` | If it still says multi-game |
| M `docs/backlog.md` | Note superseded whole-games items (optional, do not invent new product) |

---

## Phase 1: Turn scope always Champions

- **What gets built:** Chat/scope/me always Champions; detect-scope unhooked.
- **Depends on:** none
- **Produces:** Every new turn `ctx.mode === "champions"` even if body sends `scope_seed: "gen-7"`.
- **Parallel opportunities:** none within phase. **Parallel with P2 and P3** (disjoint owns).
- **Test focus:** Chat integration: ignored seed; SSE `scope.format === "champions"`; me payload; mentioned archived team rejected.
- **Requirement refs:** CF-CHAT-AC-1.1 (server half), CF-CHAT-AC-3.2, CF-CHAT-AC-3.3, CF-CHAT-AC-3.4, CF-DATA-BR-1, CF-DATA-BR-7, CF-DATA-BR-21, CF-AUTH-AC-1.1 (chat works)

## Phase 2: Reference cutover

- **What gets built:** Migration + schema drop + ingest Champions-only + fixture seeds.
- **Depends on:** none (can start with P1). **Merge order:** migrate before prod ingest.
- **Produces:** DB with only `format='champions'` index rows; dropped wiki/natdex/meta/encounter tables.
- **Parallel opportunities:** none within. **Parallel with P1 and P3.**
- **Test focus:** schema tests; ingest unit; fixture install; a pokedex repo read for a non-champions slug is not found.
- **Requirement refs:** CF-DATA-BR-3, CF-OPS-US-1, CF-OPS-AC-1.1, CF-OPS-AC-1.2, CF-OPS-AC-1.5, CF-DEX-AC-1.3, CF-INT-BR-3

## Phase 3: Tools and prompt

- **What gets built:** 17-tool barrel; Champions prompt; decline policy; no exists_in_standard / evo fallback.
- **Depends on:** none strictly; **integrate after P2** so tools cannot read dropped tables even if hallucinated.
- **Produces:** Model cannot call T14/T18/T19/T21; prompt prefix is Champions-only.
- **Parallel opportunities:** none within. **Parallel with P1 and P2.**
- **Test focus:** barrel names; domain text contains decline phrase and Stat Points, not `run_sql`/`search_wiki`/`get_meta_usage`; evo miss; lookup_box miss shape; voice prompt.
- **Requirement refs:** CF-CHAT-US-2, CF-CHAT-AC-2.1–2.5, CF-VOICE-US-1, CF-BOX-AC-1.1, CF-DATA-BR-4, CF-DATA-BR-5, CF-INT-BR-1, ADR-2, ADR-8

## Phase 4: Teams API (living / archive / import)

- **What gets built:** List filters, create/import always champions, archive 409 on mutate, tools living-only.
- **Depends on:** P1, P2 (validation against champions index)
- **Produces:** HTTP contract in `api-design.md` for native + web UI.
- **Parallel opportunities:** none within. **Parallel with P5** after P1+P2.
- **Test focus:** GET default living; GET archived; POST ignores format; PATCH archived 409; import Tera dropped and SP warnings; get_team archived miss.
- **Requirement refs:** CF-TEAM-US-1, CF-TEAM-US-3, CF-TEAM-US-5, CF-TEAM-AC-1.1, CF-TEAM-AC-1.6, CF-TEAM-AC-3.1–3.4, CF-TEAM-AC-5.1–5.3, CF-DATA-BR-9–15, CF-AUTH-AC-2.1

## Phase 5: Usage API, apply-set, threat board, web Usage

- **What gets built:** `listLeaderboard`; GET `/api/usage*`; set-template live; threat-board live; `/usage` pages; `/meta` redirects; nav item.
- **Depends on:** P2, P3 (T15 remains)
- **Produces:** Public usage contract; apply-set payload; web Usage surface.
- **Parallel opportunities:** none within. **Parallel with P4.**
- **Test focus:** leaderboard available/unavailable; no N+1 (mock); set-template Champions member; threat-board fail-soft; redirect `/meta` → `/usage`.
- **Requirement refs:** CF-USAGE-US-1, CF-USAGE-AC-1.1–1.7, CF-TEAM-US-4, CF-TEAM-US-6, CF-TEAM-AC-6.5–6.6, CF-INT-BR-4–7, CF-AS-1, CF-AS-2, ADR-5

## Phase 6a: Web chrome, copy, regulation chip, starters

- **What gets built:** Regulation chip; empty chat; landing; site title; starter pool + `sync:starters`.
- **Depends on:** P1
- **Produces:** Generated iOS/Android starter files for P7/P8.
- **Parallel opportunities:** **Parallel with P6c** (disjoint). Not with P6b if both touch shared chat layout — they should not.
- **Test focus:** chip is not a menu of formats; starters have no Gen 5 / PMD / OU; landing FAQ Champions-only.
- **Requirement refs:** CF-CHAT-US-1, CF-CHAT-AC-1.2, CF-CHAT-AC-1.3, CF-UI-US-1–3, CF-UI-BR-1–4, CF-INT-BR-10 (web copy), CF-AS-8, CF-AS-9, CF-AS-12

## Phase 6b: Web teams UI

- **What gets built:** Archive section; Stat Point editor; hide Tera/IV/level; apply-set + confirm.
- **Depends on:** P4, P5
- **Produces:** Web teams meets CF-TEAM UI ACs.
- **Parallel opportunities:** none — sequential after P4+P5. **Parallel with P6a/P6c** if file globs stay disjoint (`app/teams/**` + `components/teams/**` only).
- **Test focus:** fullstack: archive view+delete, no edit; apply confirm replace; SP total visible; no Tera field.
- **Requirement refs:** CF-TEAM-AC-1.2–1.7, CF-TEAM-AC-5.4–5.5, CF-TEAM-AC-6.1–6.4, CF-UI-US-4, CF-UI-US-5, CF-AS-3, CF-AS-11, CF-AUTH-AC-1.2

## Phase 6c: Web Dex, calc, entity

- **What gets built:** Champions-only explorers; 404; calc L50; entity no fallback.
- **Depends on:** P2
- **Produces:** Reference island + calc match CF-DEX / CF-CALC.
- **Parallel opportunities:** **Parallel with P6a** (and P6b if disjoint).
- **Test focus:** pokedex index only champions slugs; unknown slug 404; entity natdex fallback gone; calc no format picker.
- **Requirement refs:** CF-DEX-US-1, CF-DEX-AC-1.1–1.6, CF-CALC-US-1, CF-UI-US-7, CF-UI-US-8

## Phase 7: iOS

- **What gets built:** Regulation chip, archive, editor, Usage tab, Dex/calc, tests.
- **Depends on:** P4, P5, P6a (starters)
- **Produces:** iOS parity (ADR-6 fifth tab).
- **Parallel opportunities:** **Parallel with P8.** none within unless UI slices split by folder (Chat vs Teams vs Usage) **and** no shared `AppState`/`RootView` — `RootView.swift` is **shared** inside P7 (one owner). Sequential inside P7.
- **Test focus:** unit: Format decode old gen-7 team as archived; Usage ViewModel; editor hides Tera; chip not a picker.
- **Requirement refs:** same CF-* as P6* + CF-OPS-BR-4, ADR-6, CF-VOICE-AC-1.1–1.4 (existing voice, Champions prompt from P3)

## Phase 8: Android

- **What gets built:** Same capabilities; Usage as Dex section (ADR-6).
- **Depends on:** P4, P5, P6a
- **Produces:** Android parity.
- **Parallel opportunities:** **Parallel with P7.** Sequential inside P8 (`OakApp.kt` shared).
- **Test focus:** JVM unit: archive, editor, usage VM, chip.
- **Requirement refs:** same as P7 except Voice mic not added (CF-UI-BR-5)

## Phase 9: Eval, docs, store listing

- **What gets built:** Golden rewrite; AGENTS/README/CLAUDE; App Store copy.
- **Depends on:** P3, P6a, P7, P8
- **Produces:** Truthful docs; eval that can fail the agent for off-roster leakage.
- **Parallel opportunities:** none
- **Test focus:** eval case list; docs mention Champions default not National Dex.
- **Requirement refs:** CF-SC-1–7, CF-INT-BR-10, CF-OPS launch bar

## Integration Seams

1. **After P1+P2+P3 — agent-stack:** one chat turn against migrated test DB: Champions answer; off-roster decline; `run_sql` unknown_tool if the model calls it.
2. **After P4+P5 — API-stack:** living/archive HTTP; usage available+unavailable; set-template; import paste.
3. **After P6* — web UI↔API:** empty chat, archive, usage page, 404, apply confirm (jsdom + optional browser).
4. **After P7+P8 — native↔API:** same contracts.
5. **After P9 — launch bar:** CF-SC-1–7 on all three clients; prod migrate+ingest.

## Build Manifest

```yaml
commands:
  test: "cd web && npm test"
  test_one: "cd web && npx vitest run"
  typecheck: "cd web && npm run typecheck"
  build: "cd web && npm run build"
  lint: "cd web && npm run lint"
phases:
  - id: p1
    name: Turn scope always Champions
    depends_on: []
    owns:
      - "web/src/app/api/chat/**"
      - "web/test/api-chat.integration.test.ts"
      - "web/src/app/api/scope/**"
      - "web/src/app/api/auth/me/**"
      - "web/src/lib/scope/detect-scope.ts"
      - "web/src/lib/scope/detect-scope.test.ts"
    shared: []
    requirement_refs:
      - CF-CHAT-AC-3.2
      - CF-CHAT-AC-3.3
      - CF-DATA-BR-1
      - CF-DATA-BR-7
      - CF-DATA-BR-21
    test_focus: "chat integration ignores scope_seed; SSE scope is champions"
  - id: p2
    name: Reference cutover
    depends_on: []
    owns:
      - "web/drizzle/0023_champions_only.sql"
      - "web/drizzle/meta/_journal.json"
      - "web/drizzle/meta/0023_*"
      - "web/src/data/schema.ts"
      - "web/src/data/schema.test.ts"
      - "web/src/data/formats.ts"
      - "web/src/data/formats.test.ts"
      - "web/src/ingest/**"
      - "web/src/data/repos/wiki-repo.ts"
      - "web/src/data/repos/meta-repo.ts"
      - "web/src/data/sql-sandbox.ts"
      - "web/test/fixtures/tools-fixture.ts"
      - "web/eval/fixtures/seed-fixture-db.ts"
    shared: []
    requirement_refs:
      - CF-DATA-BR-3
      - CF-OPS-US-1
      - CF-INT-BR-3
    test_focus: "migration+ingest leave only champions index rows"
  - id: p3
    name: Tools and prompt
    depends_on: []
    owns:
      - "web/src/agent/tools/index.ts"
      - "web/src/agent/tools/voice-gating.ts"
      - "web/src/agent/tools/get-encounters.ts"
      - "web/src/agent/tools/run-sql.ts"
      - "web/src/agent/tools/search-wiki.ts"
      - "web/src/agent/tools/get-meta-usage.tool.ts"
      - "web/src/agent/tools/get-pokemon.ts"
      - "web/src/agent/tools/get-move.ts"
      - "web/src/agent/tools/get-ability.ts"
      - "web/src/agent/tools/get-item.ts"
      - "web/src/agent/tools/resolve-entity.ts"
      - "web/src/agent/tools/lookup-box.ts"
      - "web/src/agent/tools/get-evolution-chain.ts"
      - "web/src/agent/schemas.ts"
      - "web/src/agent/prompts/**"
      - "web/src/agent/teams-assistant/prompts/**"
    shared: []
    requirement_refs:
      - CF-CHAT-US-2
      - CF-VOICE-US-1
      - CF-DATA-BR-5
    test_focus: "barrel omits T14/T18/T19/T21; prompt decline + Stat Points"
  - id: p4
    name: Teams API (living / archive / import)
    depends_on: [p1, p2]
    owns:
      - "web/src/data/repos/team-repo.ts"
      - "web/src/data/repos/team-repo.test.ts"
      - "web/src/app/api/teams/route.ts"
      - "web/src/app/api/teams/teams.route.test.ts"
      - "web/src/app/api/teams/teams.integration.test.ts"
      - "web/src/app/api/teams/[id]/**"
      - "web/src/app/api/teams/import/**"
      - "web/src/server/teams/import-export.ts"
      - "web/src/server/teams/validate-team.ts"
      - "web/src/agent/tools/list-teams.tool.ts"
      - "web/src/agent/tools/get-team.tool.ts"
      - "web/src/agent/tools/save-team.tool.ts"
    shared: []
    requirement_refs:
      - CF-TEAM-US-1
      - CF-TEAM-US-3
      - CF-TEAM-US-5
    test_focus: "living vs archived HTTP; import Tera/SP; tools skip archive"
  - id: p5
    name: Usage API, apply-set, threat board, web Usage
    depends_on: [p2, p3]
    owns:
      - "web/src/server/champions-usage/**"
      - "web/src/app/api/usage/**"
      - "web/src/server/teams/set-template.ts"
      - "web/src/app/api/teams/set-template/**"
      - "web/src/server/teams/threat-board.ts"
      - "web/src/server/teams/analyze-team.ts"
      - "web/src/app/(reference)/usage/**"
      - "web/src/app/(reference)/meta/**"
      - "web/src/components/nav/nav-items.ts"
      - "web/src/data/meta-pages.ts"
      - "web/src/data/meta-formats.ts"
      - "web/src/app/sitemap.ts"
    shared: []
    requirement_refs:
      - CF-USAGE-US-1
      - CF-TEAM-US-4
      - CF-TEAM-US-6
    test_focus: "usage available/unavailable; set-template; /meta redirect"
  - id: p6a
    name: Web chrome, copy, regulation chip, starters
    depends_on: [p1]
    owns:
      - "web/src/components/controls/ScopeChip.tsx"
      - "web/src/components/controls/ScopeChip.test.tsx"
      - "web/src/app/page.tsx"
      - "web/src/components/chat/ChatThread.tsx"
      - "web/src/components/landing/**"
      - "web/src/lib/site.ts"
      - "web/src/lib/example-prompts.ts"
      - "ios/OakApp/Features/Chat/ExamplePrompts.swift"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/chat/ExamplePrompts.kt"
    shared: []
    requirement_refs:
      - CF-CHAT-US-1
      - CF-UI-US-1
      - CF-UI-US-2
      - CF-UI-US-3
    test_focus: "regulation chip not a gen menu; Champions starters only"
  - id: p6b
    name: Web teams UI
    depends_on: [p4, p5]
    owns:
      - "web/src/app/teams/**"
      - "web/src/components/teams/**"
      - "web/test/page-team-builder.fullstack.test.tsx"
    shared: []
    requirement_refs:
      - CF-TEAM-AC-1.2
      - CF-TEAM-US-5
      - CF-TEAM-US-6
      - CF-UI-US-4
      - CF-UI-US-5
    test_focus: "archive UI; SP editor; apply confirm"
  - id: p6c
    name: Web Dex, calc, entity
    depends_on: [p2]
    owns:
      - "web/src/app/(reference)/pokedex/**"
      - "web/src/app/(reference)/moves/**"
      - "web/src/app/(reference)/abilities/**"
      - "web/src/app/(reference)/items/**"
      - "web/src/data/reference-pages.ts"
      - "web/src/data/entity-profile.ts"
      - "web/src/app/api/entity/**"
      - "web/src/app/api/search/**"
      - "web/src/app/calc/**"
      - "web/src/components/reference/**"
    shared: []
    requirement_refs:
      - CF-DEX-US-1
      - CF-CALC-US-1
    test_focus: "dex champions-only; 404; calc L50"
  - id: p7
    name: iOS
    depends_on: [p4, p5, p6a]
    owns:
      - "ios/OakApp/App/**"
      - "ios/OakApp/Features/Teams/**"
      - "ios/OakApp/Features/Usage/**"
      - "ios/OakApp/Features/Dex/**"
      - "ios/OakApp/Features/Calc/**"
      - "ios/OakApp/Features/Chat/**" # exclude ExamplePrompts.swift (P6a)
      - "ios/OakApp/Models/**"
      - "ios/OakApp/Services/**"
      - "ios/OakAppTests/**"
    shared:
      - "ios/OakApp/Features/Chat/ExamplePrompts.swift"
    requirement_refs:
      - CF-OPS-BR-4
      - CF-USAGE-US-1
      - CF-TEAM-US-5
    test_focus: "iOS unit: archive, usage VM, regulation chip, editor"
  - id: p8
    name: Android
    depends_on: [p4, p5, p6a]
    owns:
      - "android/app/src/main/kotlin/ai/gowtam/oak/app/**"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/teams/**"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/usage/**"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/dex/**"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/calc/**"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/chat/**"
      - "android/app/src/main/kotlin/ai/gowtam/oak/wire/**"
      - "android/app/src/test/**"
    shared:
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/chat/ExamplePrompts.kt"
    requirement_refs:
      - CF-OPS-BR-4
      - CF-UI-BR-5
    test_focus: "Android JVM unit: archive, usage, chip, editor"
  - id: p9
    name: Eval, docs, store listing
    depends_on: [p3, p6a, p7, p8]
    owns:
      - "web/eval/cases.ts"
      - "README.md"
      - "AGENTS.md"
      - "CLAUDE.md"
      - "docs/app-store/ios.md"
      - "web/src/app/privacy/page.tsx"
    shared: []
    requirement_refs:
      - CF-SC-1
      - CF-SC-7
      - CF-INT-BR-10
    test_focus: "eval case set; docs no longer claim National Dex default"
integration_checkpoints:
  - after: [p1, p2, p3]
    name: agent-stack
    verifies: "chat turn on champions DB; off-roster decline; removed tools unknown"
  - after: [p4, p5]
    name: api-stack
    verifies: "living/archive HTTP; usage; set-template; import"
  - after: [p6a, p6b, p6c]
    name: web-ui
    verifies: "empty chat, archive, usage page, dex 404, apply confirm"
  - after: [p7, p8]
    name: native-clients
    verifies: "iOS+Android compile/unit; same API contracts"
  - after: [p9]
    name: launch-bar
    verifies: "CF-SC-1–7; prod migrate+ingest runbook"
```

## Orchestrator Notes

- **P1, P2, P3** may run in **three worktrees** in parallel (disjoint `owns`).
- **P4 // P5** after P1+P2 (P5 also needs P3).
- **P6a // P6c**; **P6b** after P4+P5; P6b // P6a/P6c if globs respected.
- **P7 // P8** after P4+P5+P6a. Do not edit generated ExamplePrompts (listed `shared`).
- P3 does **not** own `list-teams.tool.ts` / `get-team.tool.ts` / `save-team.tool.ts` — P4 does. P3 may change `index.ts` imports only.
- P7/P8 must not edit `ExamplePrompts.swift` / `ExamplePrompts.kt` (P6a via `sync:starters`). Those paths are `shared` on P7/P8 as a collision warning, not a second writer.
- Pin tests with `requirement_refs` in worker prompts. Do not invent product behavior. Do not add infra.
- Work from a git worktree off `develop` (`agent/champions-first-*`); merge to `develop` only when typecheck/lint/tests for touched layers pass.
