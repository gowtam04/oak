# Oak v2 — Single-Agent Harness Redesign

Status: APPROVED, in implementation (fable-orchestrator; one worktree per phase agent).
Owner docs: this file is the single source of truth for all phase briefs. Read it fully before coding.

## 1. Problem

Oak routes each turn through a deterministic keyword lexicon (`web/src/lib/scope/detect-scope.ts`) that selects one of six format-scoped prompt bodies (champions vs. per-gen prefixes, × two provider bodies — Markdown `domain.ts`/`champions.ts` and XML `domain-grok.ts` — kept in fact-parity by hand). The prompt IS the scope and the scope IS the data. Anything outside the six competitive formats — anime/movie trivia, PMD, Gens 1–4, franchise meta, current events, Pokédex colors/catch rates/TM locations — has no data and no answer path.

Target: from the end user's perspective, ONE agent that answers ANY Pokémon question — competitive, mainline, trivia, lore, meta, current events — with citations, inference flags, and graceful failure. No routing.

## 2. Architecture

One agent, one system prompt, layered knowledge:

| Layer | Answers | Mechanism |
|---|---|---|
| Typed tools T1–T17 (existing) | Competitive lookups, battle math, teams | unchanged, fast path |
| **T18 `run_sql`** | Arbitrary aggregations (natdex==BST, catch rate vs pre-evo, unique type combos, dual→mono evolutions, signature-move counts) | read-only SQL over the whole warehouse |
| **T19 `search_wiki`** | Anime episodes/movies, Ash's Pokémon, PMD, lore, glitches, trivia | tsvector+GIN retrieval over self-built Fandom corpus |
| **T20 `web_search`** | Release dates (Winds/Waves 2027, Gen 10), current anime season, sales totals, live-service issues | Tavily API |
| Prompt policy | Opinions ("best legendary" → criteria-framed), false premises ("Fire Fang bug gen 3" → reject: move is Gen 4+), off-domain ("cake recipe" → graceful decline) | single prompt |

Unchanged invariants (violating any of these fails review):
- Provider-agnostic loop (`runtime.ts` / `LLMProvider` seam) untouched in shape; `OakAnswer` Zod contract and SSE streaming untouched.
- Tools NEVER throw in-domain — documented miss shapes only.
- Tool barrel `web/src/agent/tools/index.ts` is APPEND-ONLY (order = prompt-cache prefix). New tools: T18 `run_sql`, T19 `search_wiki`, T20 `web_search`, appended in that ID order as they land.
- `ctx.mode` / `ctx.model` / `ctx.images` stay server-controlled and never become LLM-visible tool inputs. (`run_sql` sees a `format` COLUMN in the data — that is read-only data visibility, not control, and is accepted by design.)
- Zod in `web/src/agent/schemas.ts` is the single schema source; `toJsonSchema()` derives provider schemas.
- Last system segment always carries the cache breakpoint.
- Kebab-case files, no FK constraints in schema, epoch-ms bigint pattern, `ilike` not `like`.

## 3. Scope: from prompt selector to context value

KEEP: `detect-scope.ts`, chip → `scope_seed`, sticky persistence (`updateConversationFormat`/`setSessionScope`), `scope` SSE event, `formats.ts` plumbing, format-scoped repos/WHERE-clauses. Scope still selects the DEFAULT data format for the typed tools.

CHANGE:
- `buildSystemSegments` no longer forks bodies on mode: one canonical body, with the active scope injected as a short templated context line ("The user's active competitive scope is {label}; competitive tools default to it").
- The Gen 1–4 `unsupported` short-circuit in `web/src/app/api/chat/route.ts` is REMOVED — Gens 1–4 are now answerable (PokeAPI tables via `run_sql`, wiki, web).
- Runtime fallbacks/roster checks that read `ctx.mode` keep working (mode still resolves).

## 4. New data

### 4.1 PokeAPI (offline, committed snapshot — permissive license)
Source: `PokeAPI/pokeapi` repo `data/v2/csv/` (veekun-derived CSVs). Pattern precedent: `scripts/fetch-pokeapi-encounters.ts` → committed `src/ingest/data/encounters.json` → `build-encounters.ts` (fs-read inside run.ts only, never bundled).

New GLOBAL tables (no Oak `format` column — keyed by species/version_group where applicable):
- `natdex_species`: species slug, natdex number, gen introduced, color, shape, capture_rate, base_stat_total, evolution stage/parent (from evolution chains), types per latest mainline.
- `natdex_machines`: version_group, machine (TM/HM/TR number), move slug, item slug.
- `natdex_moves`: move slug, gen introduced, type, class (covers Gens 1–4 gap; @pkmn covers 5–9 per format).
- `classic_encounters`: version, location slug, area, method, species, rate/levels — Gens 1–7 ONLY, best-effort (PokeAPI has no Gen 8–9 encounter data and known holes); every answer sourced from it must be flaggable as partial.
- `pmd_recruits` (from pa5sarinho/pmd_dataset CSV, committed): game, dungeon/location, species, recruit rate.

Snapshot script trims CSVs to the columns above before committing (keep the committed blob small, encounters.json-style JSON).

### 4.2 Fandom wiki corpus (fetched at ingest, NOT committed — CC BY-SA 4.0)
- Crawl `pokemon.fandom.com` MediaWiki API, polite (~1.5s delay, identified UA), curated category list v1: anime episodes, movies, main characters (incl. Ash's Pokémon), Mystery Dungeon, game locations/routes, glitches, lore/trivia.
- Cache dir gitignored (`web/.wiki-cache/`); ingest builder reads cache → `wiki_page` (title, url, revised_at, license attribution) + `wiki_chunk` (page id, section, text, `tsv tsvector` GENERATED, GIN index).
- Bulbapedia is CC BY-NC-SA: NEVER ingested (app will be monetized). Attribution for Fandom (BY-SA) stored per page and surfaced in citations.
- v1 retrieval: `websearch_to_tsquery` ranked (`ts_rank_cd`) — NO pgvector (unavailable on prod Fly Postgres). Hybrid/pgvector is an explicitly deferred follow-up.

## 5. New tools

### T18 `run_sql`
- Input: `{ query: string, purpose: string }`. Output: `{ columns, rows (≤200), row_count, truncated }` or `{ error, hint }` (raw pg error message as hint — the loop's ≤10 iterations is the retry mechanism).
- Safety (DB layer, not prompt layer): dedicated pool; single statement only (extended query protocol — no multi-statement); executed inside `BEGIN TRANSACTION READ ONLY … ROLLBACK`; `statement_timeout` ≈ 3000ms set per session; server-side wrap `SELECT * FROM (<query>) q LIMIT 200` when no LIMIT present; attempt a dedicated SELECT-only role in the migration (`oak_readonly`, GRANT SELECT on exposed tables) — if role creation fails on the Fly attach role, transaction-level read-only is the enforced floor. Keyword blocklists alone are NOT acceptable (known bypassable).
- Exposed tables: all index tables (pokemon, learnset, reference_cache, searchable_names + new natdex_*, classic_encounters, pmd_recruits, wiki_page metadata). NEVER account/auth/conversation/team/turn_record/auth_event tables — enforce via the role grant list AND a schema-qualified allowlist check.
- Prompt-side: new module `web/src/agent/prompts/warehouse-ddl.ts` exporting the byte-stable DDL + 2–3 sample rows per table string, included in the cached prefix (P3 wires it into the body; the module lands with P2).

### T19 `search_wiki`
- Input: `{ query: string, limit?: number≤8 }`. Output: `{ results: [{ title, section, snippet, url, revised_at }] }` or `{ results: [] }`. Agent may call repeatedly with reformulated queries (agentic retrieval).
- Backed by a new repo `wiki-repo.ts` (sole reader), `websearch_to_tsquery` + `ts_rank_cd`, snippet via `ts_headline`.

### T20 `web_search`
- Backend: **Tavily** (`TAVILY_API_KEY`, optional-at-boot env, validate-on-use like ANTHROPIC/OPENAI keys). 1,000 free searches/month; backend swappable to Serper behind the same tool contract if volume grows.
- Input: `{ query: string, recency?: "day"|"week"|"month"|"year" }`. Output: `{ results: [{ title, url, snippet, published_at? }] }`; missing key or upstream failure → `{ error: "search_unavailable" }` (mirrors `get_usage_stats` upstream-miss pattern).
- First network-I/O tool in the layer: 5s timeout, one retry, `ctx.signal` respected.

### Voice gating (lands with the FIRST new tool)
`web/src/app/api/voice/tool/route.ts` and `web/src/server/voice/voice-session.ts` build their tool list as `tools.filter(t => t.name !== "submit_answer")` — new tools would auto-appear on the client-driven realtime socket. Add one shared exclusion set (e.g. `VOICE_EXCLUDED_TOOLS = new Set(["submit_answer", "run_sql", "search_wiki", "web_search"])`) consumed by both sites; update `voice/token/route.test.ts` (currently hardcodes 16) to assert against the derived list, not a literal count.

## 6. Prompt collapse (P3 — most delicate phase)

- ONE canonical Markdown body for all three providers, assembled from: identity/goal, data & generation rules (gen-info.ts stays the per-gen fact source; champions regulation from `formats.ts`), tool routing incl. T18–T20 (typed tools first; `run_sql` only for aggregations/set-ops the typed tools can't express; `search_wiki` for anime/lore/spin-offs; `web_search` only for time-sensitive facts), scope-context line (templated value), answer policy (citations mandatory incl. wiki/web URLs; false-premise rejection; opinion framing; graceful decline for non-Pokémon; encounter-data partiality flag), the worked examples, warehouse DDL module.
- DELETE `domain-grok.ts` + `domain-grok.test.ts`; `style-grok.ts` becomes a thin pass-through over the canonical body (keep two-segment shape + last-segment breakpoint); `style-claude.ts` stays pass-through; `style-openai.ts` keeps AGENT_CONTRACT/OUTPUT_CONTRACT injection.
- REWRITE `style.test.ts` and `parity.test.ts` (parity now = per-gen facts appear in the single body; the cross-body parity rule is dead). Preserve pinned invariants: exactly one cache breakpoint on the last segment for every provider; submit_answer-terminates-turn text; `generation_basis` basisTag lock-step.
- `voice.ts` untouched. CLAUDE.md updated at the end (P3 removes the PARITY rule section; final docs pass).

## 7. Eval (P7)

- Append G26+ golden cases covering the 28 benchmark questions (see docs/features/oak-v2/benchmark-questions.md); judged cases for wiki/web; deterministic cases (mocked model + fixture rows) for run_sql aggregations. Update the hardcoded count/ID assertions (cases.test.ts, run.test.ts, deterministic.test.ts) and `JUDGE_SYSTEM_PROMPT` scope text (wiki/anime/meta answers are now in-scope — judge must not penalize them).
- Bake-off: full judged suite with `ACTIVE_MODEL=claude-sonnet-5` vs `grok-4.3`; decision input for final prod model (cost vs accuracy).

## 8. Phase order & gating

P1 (PokeAPI ingest) ∥ P5 (web_search + voice gating) → P2 (run_sql) → P4 (search_wiki) → P3 (prompt collapse) → P7 (eval + bake-off).
Migrations are sequential files — only one in-flight migration-adding phase at a time (P1: 0008, P2: 0009 role/grants if used, P4: next).
Each phase: own worktree off develop (`git worktree add ../oak-<phase> -b agent/<phase> develop`), commits early, merges to develop only with `npm run typecheck && npm run lint && npm test` green (Docker required for node project). Until P3 lands, new tools are live but un-prompted (tool descriptions carry usage guidance — acceptable interim).

## 9. Ops after code

- `fly secrets set TAVILY_API_KEY=…` ; `ACTIVE_MODEL=claude-sonnet-5` for the test period (cost was the reason for the July 2 revert — final model decided after the bake-off).
- Prod re-ingest (`npm run docker:ingest` locally; release ingest for prod) — new tables empty until then read as documented miss shapes, not crashes.
- Privacy page: no change needed (wiki/web content is public data; no new user-data collection).

## 10. Deferred follow-ups (not blocking the redesign)

- **wiki_page/wiki_chunk not yet exposed to run_sql.** §5 T18 listed "wiki_page metadata" as a run_sql-exposed table, but P4 (correctly, being outside its fence) did NOT add it to the `oak_readonly` grant (migration 0009) or the sql-sandbox allowlist + WAREHOUSE_DDL. `search_wiki` already covers full-text retrieval over the corpus; run_sql over wiki metadata (e.g. "count episodes") is a nice-to-have, not required for any benchmark question. If wanted later: add wiki_page/wiki_chunk to a new grant migration + WAREHOUSE_ALLOWLIST + WAREHOUSE_DDL. Deliberately NOT folded into P3 (keeps the delicate prompt phase off the migration/sandbox surface).
- **Fandom crawl category list is best-guess.** The v1 `fetch:wiki` category names are unverified against the live API (`Category:Episodes` returned 0; SEED_TITLES + graceful empty-skip keep a real crawl useful). Tuning needs live-API iteration at prod ingest time; not code- or test-blocking (tests seed rows directly).
- **pgvector hybrid retrieval** for search_wiki (design §4.2) — lexical-only v1 shipped; embeddings deferred until prod Postgres ships pgvector.
