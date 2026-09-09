# Champions-first — Architecture Decisions

Mode: PM. Budget: startup.

### ADR-1: Stay on the existing modular monolith

- **Context:** Requirements span agent, ingest, Postgres, web, iOS, Android. Budget is startup; production already runs one Fly app + Postgres + Redis.
- **Options considered:**
  - Existing monolith — no new infra, fits three clients of one HTTP/SSE API
  - Extract a usage service — extra deploy, overkill for one community HTTP client
  - Rebuild as Champions-only greenfield — throws away accounts, history, teams
- **Decision:** Existing Next.js modular monolith + native clients.
- **Rationale:** CF-OPS-BR-4 (three clients together) and startup budget. Distinctive work is product cut + a few surfaces, not a new topology.
- **Consequences:** Phases must partition files; `formats.ts` / tool barrel / prompts are serialized shared files.
- **Links:** `overview.md`; CF-OPS-BR-4.

### ADR-2: Remove other-game tools from the model list (new prompt-cache prefix)

- **Context:** User chose option A. T14/T18/T19/T21 only exist for other games / Smogon OU. AGENTS.md historically says the tool barrel is append-only for cache stability.
- **Options considered:**
  - Remove from `tools[]` and prompt — smaller prefix, model cannot call them
  - Keep tools, hard-gate `not_available` — barrel bytes stable, prompt stays fat, model still tries
- **Decision:** Remove T14 `get_encounters`, T18 `run_sql`, T19 `search_wiki`, T21 `get_meta_usage` from `web/src/agent/tools/index.ts` `tools` array, delete (or stop exporting) their modules, strip their Zod/JSON schemas from the cached prefix, and rewrite `domain.ts` as a Champions-only body. **Accept a new prompt-cache prefix.**
- **Rationale:** CF-DATA-BR-3, CF-CHAT-US-2, CF-INT-BR-3. Teaching tools that always fail wastes tokens and invites leaks.
- **Consequences:** Dispatch of a hallucinated old name returns `{ error: "unknown_tool" }`. Voice gating no longer needs to exclude T18/T19 (they are gone). Eval cases that required wiki/SQL/Smogon are rewritten or dropped. Document the append-only exception in AGENTS.md in the docs phase.
- **Links:** CF-CHAT-US-2, CF-DATA-BR-3, CF-INT-BR-3.

### ADR-3: Keep `Format` as a stored-value union; runtime is always Champions

- **Context:** Archived teams and old conversations/turn_records still have `format` strings like `gen-7` / `national-dex`. Product forbids other-game **reference** data and pickers, but archive must round-trip those strings (CF-TEAM-US-5, CF-DATA-BR-12).
- **Options considered:**
  - Collapse `Format` to `"champions"` only — breaks decoding archived teams
  - Keep full union for **storage/decode**, restrict ingest/agent/UI to Champions
  - Add `archived_at` and rewrite every team to `champions` — mutates user sets
- **Decision:** Keep `Format` / `isFormat()` for reading historical rows. `DEFAULT_FORMATS` / ingest / `AgentContext.mode` / pickers / Dex / calc are **Champions only**. A living team is `team.format === "champions"`. An archived team is `team.format !== "champions"` (no new column).
- **Rationale:** Satisfies archive without a backfill that would pretend Gen 7 sets are Champions-legal.
- **Consequences:** iOS/Android `Format` enums stay for JSON decode; pickers only offer Champions. `detect-scope` is not used to route turns. `scope_seed` from old clients is ignored. `account.last_used_scope` is not allowed to reopen another game (CF-DATA-BR-21).
- **Links:** CF-DATA-BR-1, CF-DATA-BR-12, CF-TEAM-US-5, CF-CHAT-US-3.

### ADR-4: Delete non-Champions reference data in one migration + Champions-only ingest

- **Context:** CF-OPS-US-1 / CF-DATA-BR-3: after cutover the app must not contain other-generation indexes, wiki, natdex warehouse, encounters, PMD, or Smogon OU.
- **Options considered:**
  - Stop ingesting, leave rows — violates “must not contain”
  - DELETE/TRUNCATE unused tables, keep schema — data gone, dead tables remain
  - DELETE non-champions index rows **and DROP** wiki/natdex/encounters/pmd/meta tables
- **Decision:** One Drizzle migration: `DELETE` index rows where `format <> 'champions'`; `DROP` `wiki_page`, `wiki_chunk`, `natdex_species`, `natdex_machines`, `natdex_moves`, `classic_encounters`, `pmd_recruits`, `meta_snapshot`, `meta_usage` (and related indexes). Ingest `DEFAULT_FORMATS = ["champions"]` only. Do **not** delete `conversation*`, `team`, `turn_record`, `shared_answer`, `account*`, `champions_item_exclusion`.
- **Rationale:** Product data rule is absolute; dropped tables cannot leak via `run_sql` (tool removed). Startup budget: smaller DB, no extra machines.
- **Consequences:** Re-ingest production after migrate (`--formats=champions`). Eval fixture DBs must be Champions-seeded. `oak_readonly` grants for dropped tables go away with the tables.
- **Links:** CF-OPS-AC-1.1–1.5, CF-DATA-BR-3.

### ADR-5: Usage pages sit on the live T15 client, not Smogon tables

- **Context:** `/meta` is Smogon gen9ou. Champions usage is live T15 (`usage-client`, in-process 6h/24h TTL). Requirements: public Usage on three clients, Doubles default, Singles second view, replace `/meta`.
- **Options considered:**
  - Persist Champions usage into `meta_*` — new sync job, contradicts “live”
  - Redis cache — extra moving part, over startup budget
  - Extend in-process `usage-client` + public GET API + pages/screens
- **Decision:** Extend `usage-client` with `listLeaderboard(ladder)` (no N+1). Public `GET /api/usage` + `GET /api/usage/:slug`. Web `/usage` and `/usage/[slug]`. Redirect `/meta` and `/meta/gen9ou/**` to `/usage`. Native Usage screens call the same API. Keep in-process TTL. Fail-soft `available: false`.
- **Rationale:** CF-INT-BR-4–7, CF-AS-1, CF-USAGE-US-1, startup (no new store).
- **Consequences:** Leaderboard ranking must come from a **bulk** community payload (index percentages or a ranking endpoint). If the API cannot provide ranks without per-species fetches, return unavailable rather than 300 sequential requests. `set-template` and threat-board for Champions use this client (today they stub / use OU).
- **Links:** CF-USAGE-US-1, CF-TEAM-US-4, CF-TEAM-US-6, CF-INT-BR-4.

### ADR-6: Native Usage placement (tab vs Dex segment)

- **Context:** Web has rail space. iOS has 4 tabs (Calc is a cover). Android already has 5 tabs (Calc is a tab). Six Android tabs is worse than a Dex segment.
- **Decision:**
  - **Web:** `PRIMARY_NAV_ITEMS` includes Usage → `/usage`.
  - **iOS:** Usage is a **fifth tab** (Chat / Teams / Usage / Dex / Settings). Calc stays a cover.
  - **Android:** Usage is a **first-class Dex section** (alongside Pokémon / Moves / Abilities / Items), not a sixth bottom tab. Same API and screen contents as iOS Usage.
- **Rationale:** CF-UI-AC-6.4 first-class, without wrecking Android tab bar. Same capabilities; slightly different chrome.
- **Consequences:** Document in client READMEs. Do not add Android Voice mic here (CF-UI-BR-5).
- **Links:** CF-UI-AC-6.4, CF-UI-BR-5.

### ADR-7: Team JSON keeps `tera_type` / `ivs` / `level`; UI and apply-set ignore them

- **Context:** `teamMemberSchema` is the interchange contract (DB JSON, Showdown, `proposed_team`). Archived SV teams contain Tera/EVs/IVs. Living Champions teams must not *show* those knobs.
- **Decision:** Do not remove fields from Zod in this change. Living create/edit/apply-set **persist** `tera_type: null`, `level: 50`, IVs 31. Import **drops Tera** and treats EV numbers as Stat Points (`evs`). UI hides Tera/IV/level. Warn-but-allow on 66/32.
- **Rationale:** Avoid a JSON rewrite of every saved team; archive still renders stored Tera as irrelevant + off-roster labels.
- **Consequences:** Agent `proposed_team` with Tera is stripped on validate (existing legalize path + new Champions strip). Showdown export omits Tera and writes Stat Points in EV fields.
- **Links:** CF-TEAM-AC-1.2, CF-TEAM-US-3, CF-AS-3.

### ADR-8: Evolution and entity miss — no mainline fallback

- **Context:** Today `get_evolution_chain` falls back to Scarlet/Violet; several tools set `exists_in_standard`. G55 required answering Eevee evo off-roster. Product now **declines** off-roster (CF-CHAT-AC-2.1) and forbids other-game lookup (CF-DATA-BR-5).
- **Decision:** Remove `exists_in_standard`. Evolution is Champions-index only; miss → not found. Entity/Dex URLs for unknown slugs 404. Prompt teaches the decline sentence, not a fallback.
- **Rationale:** User 2A + CF-DATA-BR-5. After ADR-4 there is no SV index to fall back to.
- **Consequences:** Rewrite G55 and related evals to expect decline. `GET /api/entity` stops the national-dex secondary lookup.
- **Links:** CF-CHAT-US-2, CF-DEX-AC-1.4, CF-DATA-BR-5.
