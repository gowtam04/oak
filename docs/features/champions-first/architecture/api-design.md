# Champions-first — API Design

Auth, rate limits, and error envelope stay as today (`jsonError` codes, 401 `unauthorized` for signed-in-only). No API versioning.

## Conventions

- Base path: existing `/api/*`
- Auth: cookie + Bearer (unchanged)
- Public GETs: `PUBLIC_READ_CONFIG` rate limit
- In-domain misses: **200** with a status/available flag where that is already the pattern (`/api/entity`); Usage uses `available: false` on 200 rather than 5xx

## Endpoints

### Chat — `POST /api/chat` (SSE)

| | |
|--|--|
| Purpose | One Champions turn |
| Auth | guest or signed-in |
| Request | Existing body. **`scope_seed` and `champions_mode` are ignored.** `mentioned_team_ids` must be living Champions teams only (400 `unbound_mention` / not found if archived or other-format). |
| Response | Existing SSE. First `scope` event: `{ format: "champions", source: "default" }` always. |
| Errors | Unchanged (409 turn_in_progress, 429, 503, …) |
| Notes | `ctx.mode = "champions"` always. `detect-scope` is not consulted. Conversation sticky format may be updated to `champions` on the first new message (CF-CHAT-AC-3.3) but is not used to pick data. |

### Scope — `PUT /api/scope`

| | |
|--|--|
| Purpose | Old clients still call this after a chip pick |
| Auth | signed-in optional (existing) |
| Request | ignored format |
| Response | 200 `{ format: "champions", lastUsedScope: "champions", lastUsedScopes: ["champions"] }` |
| Notes | Must not persist National Dex / gen-N as a future default (CF-DATA-BR-21). |

### `GET /api/auth/me`

Return `lastUsedScope: "champions"` (never a stored gen-7). `lastUsedScopes` empty or `["champions"]`. Stops empty UIs from seeding National Dex.

### Teams list — `GET /api/teams`

| | |
|--|--|
| Purpose | Living Champions teams |
| Auth | signed-in |
| Query | **No `format=` picker.** Optional `archived=1` (or `archived=true`). |
| Response | `{ teams: TeamSummary[] }` living (`format === "champions"`) by default; archived (`format !== "champions"`) when `archived=1`. |
| Errors | 401 guest |
| Notes | `TeamSummary` keeps `format` so clients can label archived origin. Living summaries always `"champions"`. |

If a client still sends `?format=champions`, treat as living list. If it sends `?format=gen-7` (old), return that account’s archived teams with that format **or** the full archive — prefer **full archive when `archived=1` only**; unknown `format=` → 400 `invalid_request` after cutover so old gen filters do not look like a living Dex.

### Teams create — `POST /api/teams`

| | |
|--|--|
| Purpose | Create living team |
| Auth | signed-in |
| Request | `{ name?, members? }`. **`format` optional and ignored; always stored `champions`.** |
| Response | `{ team, validation }` warn-but-allow (66/32, roster, item clause, …) |
| Notes | Strip `tera_type` to null; force `level` 50; IVs 31 if missing. |

### Team get/patch/delete — existing `/api/teams/:id`

- GET living: full editor. GET archived: 200 read-only payload + `archived: true` (or client infers `format !== "champions"`). PATCH archived → **409** `team_archived`. DELETE archived allowed (confirm is client-side).
- Duplicate archived → **409** `team_archived`. Duplicate living OK, copy stays champions.

### Import — `POST /api/teams/import`

| | |
|--|--|
| Purpose | Showdown paste → living Champions team |
| Auth | signed-in |
| Request | `{ paste, name? }` — **do not require `format`**. Always champions. |
| Response | `{ team, validation }` |
| Side effects | Drop Tera; map EV numbers to Stat Points; flag off-roster names (CF-TEAM-AC-3.1–3.3). Save succeeds with warnings. |

### Set template — `POST /api/teams/set-template`

| | |
|--|--|
| Purpose | Live Champions usage set for one species |
| Auth | public read (existing); **applying** onto a team is a later PATCH by a signed-in user |
| Request | `{ species: string }` — **drop `format`** (always champions). Old `{ format, species }` : ignore format. |
| Response | `{ found: boolean, member?: TeamMember, attribution?: string, notes?: string[] }` |
| Errors | 200 `found: false` if usage down or no set (CF-TEAM-AC-6.5). 429 rate limit. |
| Notes | `member.evs` = Stat Points; `tera_type: null`; `level: 50`. Do not invent moves from another game. |

### Analyze — existing `POST /api/teams/analyze`

Threat board from **live Doubles** usage (default). Fail-soft empty threats + note when usage down (CF-TEAM-AC-4.2). Never attach Smogon OU.

### Usage leaderboard — `GET /api/usage`

| | |
|--|--|
| Purpose | Public live ladder |
| Auth | none |
| Query | `ladder=doubles` (default) \| `singles` |
| Response | `{ available: true, ladder, season, fetched_at, attribution, rows: [{ rank, name, slug, usage_pct, sprite? }] }` **or** `{ available: false, ladder, error: "upstream_unavailable" }` |
| Notes | 200 even when unavailable. Join `slug` via champions resolve; skip names not on roster. |

### Usage species — `GET /api/usage/:slug`

| | |
|--|--|
| Purpose | Drill-in + apply-set source |
| Auth | none |
| Query | `ladder=doubles` (default) \| `singles` |
| Response | `{ available: true, found: true, ...UsageData, slug }` or `{ available: true, found: false, suggestions }` or `{ available: false, error: "upstream_unavailable" }` |
| Notes | Same attribution/season/fetched_at as T15. |

### Redirects (web pages, not JSON)

- `/meta`, `/meta/:format`, `/meta/:format/:slug` → `/usage` or `/usage/:slug` when slug present (ignore old `gen9ou`). Permanent redirect.
- Non-roster `/pokedex/:slug` (and moves/abilities/items) → **404** page (CF-DEX-AC-1.4). No natdex fallback.

### Entity — `GET /api/entity`

| | |
|--|--|
| Purpose | Artifact / Dex detail |
| Query | `kind`, `q`, `format` optional — **default and only data `champions`**. Ignore other format values for lookup (do not 400 old clients; look up champions). |
| Response | Existing envelope. `not_found` if not on roster. **Remove** national-dex secondary lookup. |

### Search — `GET /api/search`

Champions index only.

### Calc — existing `POST /api/calc` (or equivalent)

Ignore format; L50 Stat Points. Species must resolve in champions.

## Internal interfaces

### `listTeams(accountId, { archived?: boolean })`

```ts
// archived true  → format !== 'champions'
// archived false/undefined → format === 'champions'
```

`list_teams` tool always uses living.

### `get_team` tool

If the id is archived or other-format: `{ found: false }` (or equivalent existing miss). Do not return the roster for the model to use.

### `usage-client`

```ts
type Ladder = "doubles" | "singles";

function listLeaderboard(
  ladder: Ladder,
  signal?: AbortSignal,
): Promise<
  | { available: true; season: string; fetched_at: number; rows: LeaderboardRow[] }
  | { available: false }
>;

// existing getUsage(name, format) stays; format is doubles|singles
```

**No N+1.** Builder verifies community `/api` shape; if ranks are absent, `available: false`.

### Prompt / decline (agent)

System body must include: Oak covers Pokémon Champions (current `CHAMPIONS_REGULATION`) only. If the user names a Pokémon/move/ability/item/game not on the current Champions roster, decline, **name the entity**, say it is **not in the Champions roster**, and do not use other-game facts. Same for Voice.

`compute_stat`: Stat Points in `ev`; IV/level ignored (existing Champions branch).

### Apply-set client contract

1. `POST /api/teams/set-template` `{ species }`
2. If `found` and slot empty → PATCH members.
3. If slot filled → **client confirm** then PATCH replace (CF-TEAM-AC-6.3).
4. Guest → existing sign-in gate before PATCH.

## External Providers

| Provider | Owned by | Failure handling | Secrets |
|----------|----------|------------------|---------|
| championsbattledata.com | UsageGateway / T15 | `available: false` / `{ error: "upstream_unavailable" }`; no Smogon fallback | none (keyless). `CHAMPIONSBATTLEDATA_BASE_URL` already in env |
| Showdown pin (`SHOWDOWN_PIN` / `web/vendor/pokemon-showdown/`) | ingest (offline) | ingest failure = empty champions index → tools `index_unavailable`. `@pkmn/dex` is Dex.mod engine only; npm `@pkmn/mods` is not the roster clock. | none |
| xAI / Anthropic / OpenAI | existing agent | unchanged | existing keys |

Removed: Tavily (already gone), Smogon chaos sync (`sync:meta` retired from ops), Fandom wiki fetch.
