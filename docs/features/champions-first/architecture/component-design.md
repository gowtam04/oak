# Champions-first — Component Design

All in-process except native clients and the community usage HTTP API.

## Components

### TurnScope

| Aspect | Detail |
|--------|--------|
| Responsibility | Bind every new turn to Champions; ignore chip/lexicon/legacy seeds |
| Owns | Chat-route scope resolution; `PUT /api/scope` no-op/ack champions; `GET /api/auth/me` lastUsedScope |
| Exposes | Always `{ format: "champions", source: "default" }` (SSE `scope` still emitted so old clients do not break) |
| Depends on | `CHAMPIONS_FORMAT`, `CHAMPIONS_REGULATION` |
| File location | `web/src/app/api/chat/route.ts`, `web/src/app/api/scope/route.ts`, `web/src/app/api/auth/me/route.ts` |
| Patterns | Server-controlled `ctx.mode` — never an LLM tool input |

Stop calling `detect-scope.ts` from the route. Leave the file until the docs/eval phase deletes it, or delete in P1 with its tests if no other importer remains.

### AgentToolsAndPrompt

| Aspect | Detail |
|--------|--------|
| Responsibility | Champions-only tool loop and prompt |
| Owns | `tools[]` barrel; domain/voice/teams-assistant prompts; remove T14/T18/T19/T21; strip `exists_in_standard` and evo fallback |
| Exposes | `tools`, `dispatch`; `domainForMode` may ignore mode and always return Champions body |
| Depends on | Repos (champions index), `usage-client` (T15), team repo (living only) |
| File location | `web/src/agent/tools/**`, `web/src/agent/prompts/**`, `web/src/agent/teams-assistant/prompts/**` |
| Patterns | Tools never throw in-domain; Zod in `schemas.ts` |

**Remaining tools (order, new cache prefix):**  
`resolve_entity`, `query_pokedex`, `get_pokemon`, `get_move`, `get_ability`, `get_type_matchups`, `get_evolution_chain`, `get_item`, `compute_stat`, `estimate_damage`, `submit_answer`, `get_team`, `save_team`, `get_usage_stats`, `list_teams`, `get_learnset`, `lookup_box`.

`list_teams` / `get_team` / `save_team`: living Champions teams only (archived never listed). Off-roster lookup_box names: structured miss, prompt says not in the Champions roster.

### ChampionsIndex

| Aspect | Detail |
|--------|--------|
| Responsibility | Offline `@pkmn` Champions ingest + repo reads |
| Owns | ingest default formats; gen-provider champions path; pokedex/learnset/reference repos (unchanged signatures, data is champions-only) |
| Exposes | Existing repo functions; `format` argument should be passed `"champions"` from callers |
| Depends on | `@pkmn/mods/champions`, Postgres |
| File location | `web/src/ingest/**`, `web/src/data/pkmn/gen-provider.ts`, `web/src/data/repos/pokedex-repo.ts` (etc.) |

### ReferenceCutover

| Aspect | Detail |
|--------|--------|
| Responsibility | Migration + schema drop of other-game tables; remove writers/readers |
| Owns | Drizzle 0023, `schema.ts` deletions, ingest wiki/natdex/meta/encounters builders removed, `sql-sandbox.ts` allowlist |
| Exposes | Migrated DB with champions index only |
| Depends on | Drizzle migrate |
| File location | `web/drizzle/`, `web/src/data/schema.ts`, `web/src/ingest/run.ts`, dropped `wiki-repo.ts` / `meta-repo.ts` |

### UsageGateway

| Aspect | Detail |
|--------|--------|
| Responsibility | Live Champions ladder for pages, apply-set, threat board, T15 |
| Owns | `usage-client` (add `listLeaderboard`), `GET /api/usage*`, web `/usage` pages, redirects from `/meta` |
| Exposes | See `api-design.md` |
| Depends on | championsbattledata.com; champions roster for slug join |
| File location | `web/src/server/champions-usage/**`, `web/src/app/api/usage/**`, `web/src/app/(reference)/usage/**` |
| Patterns | Fail-soft `available: false`; cite season + fetched_at; in-process TTL |

`listLeaderboard(ladder)` **must not N+1**. Use bulk index/ranking payload. If ranks cannot be obtained in one (or a handful of) requests, return unavailable.

### TeamLifecycle

| Aspect | Detail |
|--------|--------|
| Responsibility | Living vs archived lists; import as Champions; set-template from live usage; threat board from live usage |
| Owns | `team-repo` list filters, teams routes, import-export, validate-team (already has 66/32), set-template, threat-board, analyze-team wiring |
| Exposes | `GET /api/teams`, `?archived=1`, POST create always champions, set-template |
| Depends on | UsageGateway, ChampionsIndex, `champions_item_exclusion` |
| File location | `web/src/data/repos/team-repo.ts`, `web/src/app/api/teams/**`, `web/src/server/teams/**` |

**Apply-set:** `resolveSetTemplate(species)` with no format picker — always Champions live usage → `TeamMember` (SP in `evs`, `tera_type: null`, `level: 50`). Missing fields left empty + notes (CF-TEAM-AC-6.6).

**Threat board:** `metaFormatForTeam` currently returns null for champions. Replace with live leaderboard top threats; fail-soft empty + “usage unavailable” (CF-TEAM-AC-4.2).

### WebChrome

| Aspect | Detail |
|--------|--------|
| Responsibility | Regulation chip, empty chat, starters, landing, hide Tera/IV/level, archive UI, apply confirm, Dex/calc Champions-only, 404s |
| Owns | ScopeChip→RegulationChip, landing-content, example-prompts (+ `sync:starters`), teams page, TeamMemberPanel, calc page, reference explorers, entity route fallback removal, nav-items |
| Exposes | UI only |
| Depends on | TurnScope, TeamLifecycle, UsageGateway, ChampionsIndex |
| File location | `web/src/components/**`, `web/src/app/page.tsx`, `web/src/app/teams/**`, `web/src/app/calc/**`, `web/src/app/(reference)/**`, `web/src/lib/example-prompts.ts` |
| Patterns | Enamel & Paper; decline copy CF-UI-BR-2 |

### NativeClients

| Aspect | Detail |
|--------|--------|
| Responsibility | Same product on iOS and Android (ADR-6 placement) |
| Owns | Scope UI → regulation chip; teams archive; editor knobs; Usage screens; Dex format default; starters (generated — do not hand-edit after sync) |
| Exposes | Same HTTP/SSE |
| Depends on | API contracts in `api-design.md` |
| File location | `ios/OakApp/**`, `android/app/src/main/kotlin/ai/gowtam/oak/**` |
| Patterns | Class-for-class parity; wire `Format` still decodes old values |

### EvalAndDocs

| Aspect | Detail |
|--------|--------|
| Responsibility | Champions goldens; drop wiki/SQL/OU cases; README/AGENTS/app-store/landing truth |
| Owns | `web/eval/cases.ts`, AGENTS.md, CLAUDE.md, README.md, `docs/app-store/ios.md` |
| Depends on | AgentToolsAndPrompt, ChampionsIndex |

## Dependency Graph

```text
TurnScope → AgentToolsAndPrompt → ChampionsIndex
UsageGateway → ChampionsIndex
TeamLifecycle → UsageGateway + ChampionsIndex
WebChrome → TurnScope + TeamLifecycle + UsageGateway
NativeClients → (HTTP) TeamLifecycle + UsageGateway + TurnScope
ReferenceCutover → ChampionsIndex (data)
EvalAndDocs → AgentToolsAndPrompt
```

## Boundary Rules

- Native clients **do not** import web TS; they consume HTTP/SSE only.
- `usage-client` is the **only** Champions usage integration. `meta-repo` is deleted.
- Shared contracts: `formats.ts` (P1), `team-schema.ts` (P4 if touched), `schemas.ts` (P3), `usage-client.ts` (P5). Later phases must not rewrite those unless listed `shared`.
- Prompt files (`domain.ts`, `champions.ts`) are P3-only writes.
