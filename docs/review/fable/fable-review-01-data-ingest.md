# 01 · Data layer: schema, repos, ingest & migrations

[← back to index](fable-review.md) · **Date:** 2026-07-02 · **Commit:** 17adece · **Auditor:** Claude Fable 5

**Scope:** `web/src/data/schema.ts`, `db.ts`, `formats.ts`, `migrate.ts`, `web/src/data/repos/**` (excluding the admin repos — see [area 03](fable-review-03-admin-privacy.md)), `web/src/data/pkmn/gen-provider.ts`, `web/src/data/teams/team-schema.ts`, `web/src/ingest/**`, `web/drizzle/**` (generated `meta/` snapshots skipped), `migrate.mjs`, `drizzle.config.ts`.

**Area health:** This area holds the audit's only **Critical** and one of its **Highs**, both in the ingest write path — a documented CLI flag silently destroys five of six data scopes, and the multi-table write isn't atomic. Everything *around* the ingest write is genuinely solid: the account-deletion cascade, `appendTurnPair`, `importConversation`, and `deleteConversation` are correctly single-transaction with FK-safe ordering and row-locking; schema matches migrations 0000–0007; the documented Postgres gotchas (bigint epoch-ms, `.mapWith(Number)`, `ilike`) are applied consistently. Fix the two ingest findings together — wrapping the whole write phase in one format-scoped transaction resolves both — and this becomes a healthy area.

**Findings in this area:** 6 (Critical 1 · High 1 · Medium 1 · Low 1 · Info 2)

## Findings

### DATA-01 · Critical · Partial-format ingest (`--formats=X`) deletes ALL formats' data

- **Dimension:** correctness (+ data integrity)
- **Location:** `web/src/ingest/run.ts:119` (and `:136`), reached from `runIngest` at `web/src/ingest/run.ts:236-245`
- **What's wrong:** `replaceTable()` runs `await tx.delete(table)` with **no `WHERE` clause** — it truncates every row in `pokemon`/`learnset`/`searchable_names`/`reference_cache` regardless of which formats were built this run. `writeIngestMeta()` does the same unconditional `tx.delete(ingest_meta)`. But `runIngest` only builds in-memory rows for `opts.formats` (`formats = opts.formats ?? [...DEFAULT_FORMATS]`), which the documented `--formats=` CLI flag narrows.
- **How it fails:** An operator runs the documented `npm run ingest -- --formats=champions` to refresh just Champions after a regulation bump. Only Champions rows are built; `replaceTable` then deletes all rows for all six formats and reinserts only Champions. `scarlet-violet` and `gen-5`…`gen-8` — and their `ingest_meta` rows — are gone. Every tool reading those five scopes returns `index_unavailable` until a full re-ingest.
- **Why it matters:** Immediate, unrecoverable-without-rebuild data loss on a documented, easily-reached command. The index *is* the product's data. Mitigating fact: the data is rebuildable offline from the local `@pkmn` packages (no user data is lost), but a full `npm run ingest` is required and production serves errors for five of six scopes in the interim.
- **Recommendation:** Scope every delete to the built formats — `tx.delete(table).where(inArray(table.format, formats))` and the same for `ingest_meta`. Add an integration test that ingests two formats, re-ingests one, and asserts the untouched format's row counts and `ingest_meta` survive.
- **Confidence:** high · **Verified:** yes — Fable re-read `run.ts:108-178`; both deletes confirmed unconditional while in-memory rows build only `for (const format of formats)`.

### DATA-02 · High · Ingest write phase is five separate transactions, not one atomic swap

- **Dimension:** correctness (+ data integrity)
- **Location:** `web/src/ingest/run.ts:232-245` (calls `replaceTable` ×4 then `writeIngestMeta`, each its own `db.transaction`)
- **What's wrong:** The write phase commits `pokemon`, then `learnset`, then `searchable_names`, then `reference_cache`, then `ingest_meta` — five independent transactions with no outer wrapper.
- **How it fails:** Between the `pokemon` commit and the `learnset` commit (thousands of rows, real wall-clock time on a full six-format build), a concurrent request sees **new** `pokemon` rows joined against **old** `learnset`/`searchable_names`/`reference_cache`. A crash between any two of the five leaves the index permanently split: `pokemon` reflects the new build but `ingest_meta.last_success_at`/counts still describe the previous run, so the operator gets no signal a re-ingest is needed.
- **Why it matters:** "Crash mid-ingest → inconsistent state" is worse than "empty table" — an empty table fails loudly (`index_unavailable`), a half-updated index fails *silently* with wrong/missing data for specific queries, and the completion marker lies about it.
- **Recommendation:** Wrap the whole write phase (all four `replaceTable` calls + `writeIngestMeta`) in one `db.transaction(...)`, threading the same `tx` into `replaceTable`. Combined with format-scoped deletes (DATA-01), the entire rebuild becomes one atomic, per-format swap.
- **Confidence:** high · **Verified:** yes — Fable confirmed each `replaceTable`/`writeIngestMeta` opens its own transaction with no enclosing one.

### DATA-03 · Medium · `resolve_entity`'s in-memory fuzzy index is never invalidated after an ingest rebuild

- **Dimension:** architecture (+ correctness)
- **Location:** `web/src/data/repos/resolve-index.ts:156-231`; the only production `resetResolveIndex()` caller is `web/src/data/repos/champions-items-repo.ts:129,174`
- **What's wrong:** `resolveEntity`/`listEntities` cache one `ResolveIndex` per format in a process-wide `byFormat` Map, built lazily and never re-read from `searchable_names`. Nothing in the ingest path, the chat route, or a startup hook calls `resetResolveIndex()` after `runIngest`.
- **How it fails:** In any topology where the Next server keeps running while ingest executes against the same DB — the documented `npm run docker:ingest` against a live `docker:dev` container, or a Fly release that re-ingests without recycling the app — the live server keeps serving the **pre-ingest** name snapshot for fuzzy resolution until the process restarts, even though every other repo reads Postgres fresh per call.
- **Why it matters:** Bounded (self-heals on restart, only the fuzzy-name surface) but reachable given the ingest CLI is explicitly designed to run against a live Postgres.
- **Recommendation:** Version-stamp the cache off `ingest_meta.last_success_at` (rebuild when it changes), or have the ingest CLI hit a reset endpoint on the running app, or at minimum document that a production ingest requires an app restart.
- **Confidence:** medium

### DATA-04 · Low · Inconsistent ILIKE metacharacter escaping across suggestion helpers

- **Dimension:** correctness
- **Location:** `web/src/data/repos/pokedex-repo.ts:415-417` · related: `encounter-repo.ts:87-89`, `reference-cache.ts:100-103`
- **What's wrong:** `conversation-repo.ts:80-82` has a `likePattern()` helper that escapes `%`/`_`/`\` before an ILIKE wildcard wrap. The suggestion helpers in `pokedex-repo`, `encounter-repo`, and `reference-cache` build the pattern as a raw template literal with no escaping. This is the same root cause as [TOOL-02](fable-review-05-tools-formulas.md#tool-02).
- **How it fails:** A query containing a literal `%` or `_` is treated as a wildcard, silently returning a broader/narrower suggestion set. **Not** SQL injection — all three sites bind the pattern via Drizzle's `ilike()`; only LIKE semantics drift.
- **Why it matters:** Low in practice — these feed typo-suggestions over Pokémon/move/ability names that essentially never contain those characters.
- **Recommendation:** Extract `likePattern()` into a shared helper and use it at all four call sites.
- **Confidence:** high

### DATA-05 · Info · No index on `pokemon.species_name` despite a per-form lookup filtering on it

- **Dimension:** architecture
- **Location:** `web/src/data/schema.ts:47-111` · related: `pokedex-repo.ts:461-473`
- **What's wrong:** `getPokemon`'s "all forms of this species" query filters on `species_name` + `format`, but the `pokemon` table indexes only dex number, types, and stats (PK is `(format, id)`).
- **Why it matters:** Not a bug — one extra scan bounded to a ~1,000-row roster per `get_pokemon`. A scalability note for if rosters grow.
- **Recommendation:** Add `(format, species_name)` index if it appears in query latency.
- **Confidence:** high

### DATA-06 · Info · node-postgres Pool constructed with no explicit `max`

- **Dimension:** architecture
- **Location:** `web/src/data/db.ts:62-68`
- **What's wrong:** The Pool is built with only `connectionString`, so it falls back to node-postgres's default of 10 connections for the whole process — now shared with the admin-panel recording write path.
- **Why it matters:** Capacity-planning note. This default is what makes [EDGE-02](fable-review-04-http-edge.md#edge-02) (pool exhaustion via unthrottled public routes) reachable.
- **Recommendation:** Set an explicit `max` (and `idleTimeoutMillis`/`connectionTimeoutMillis`) sized to the Postgres plan's connection limit.
- **Confidence:** medium

## Also worth knowing

The ingest builders correctly never import `@pkmn` directly (they go through `gen-provider.ts`), and chunked inserts stay under the 65535 bind-param cap. The two ingest findings are the whole story here — both fixed by one atomic, format-scoped transaction.
