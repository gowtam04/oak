# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Pokebot is a single-user web chat agent that answers natural-language Pokémon questions (filters, lookups, mechanics reasoning, battle math). Its defining trait is that it **reasons on top of data**: tools supply raw facts (move priority, ability effect text, type charts, base stats) and the agent deduces how they interact. Every answer carries reasoning, cited sources, explicit inference/uncertainty flags, and the generation/format it's based on.

The agent's internals (topology, the 11 tools, prompts, the `PokebotAnswer` output schema, eval spec) are **fixed by design** in `docs/agent-design/`. The surrounding system (data store, ingest, tool wiring, web API, frontend, eval harness) is specified in `docs/architecture/design.md`. When agent internals and the architecture doc disagree, agent-design wins on internals; the architecture doc wins on stack/storage/layout.

> Note: `README.md` is stale — it claims "design phase, no code yet." The app is fully implemented. Trust the code and `docs/`, not the README's status line.

## Commands

```bash
npm run dev          # next dev (local)
npm run build        # next build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint .
npm test             # vitest run (unit + integration + deterministic eval subset)
npm run ingest       # tsx src/ingest/run.ts — (re)build data/pokebot.sqlite from @pkmn
npm run eval         # tsx eval/run.ts — full LLM-judge golden suite (live model)
```

Run a single test file or test:

```bash
npx vitest run src/agent/formulas/compute-stat.test.ts   # one file
npx vitest run -t "Garchomp Speed"                        # by test-name pattern
npx vitest run --project node                             # only the node project
```

Ingest variants and eval modes are flag-driven:

```bash
npm run ingest -- --formats=scarlet-violet        # build one format only (default: both)
tsx eval/run.ts --deterministic                   # offline CI subset (mocked model, fixture DB)
tsx eval/run.ts --rebuild                          # post-ingest regression set (G1/G5/G6/G7/G17)
tsx eval/run.ts --case=G4,G11                      # specific golden cases
```

Docker dev (the intended dev environment — see Gotchas):

```bash
npm run docker:dev      # build + up (next dev on :3000)
npm run docker:ingest   # run ingest inside the container
npm run docker:logs     # tail web logs
npm run docker:sh       # shell into the container
npm run docker:down
```

Node 20+ is required (`.nvmrc`). The full judged `eval` and the live model need a real `ANTHROPIC_API_KEY`; everything else (tests, typecheck, ingest) runs offline — `@pkmn` is a local package, so ingest never hits the network.

## Architecture

A single **TypeScript / Next.js (App Router) monolith**. One language across frontend, API, agent loop, and the ingest CLI. TS `strict`, ESM, path alias `@/` → `src/`. Files kebab-case; types/components PascalCase; DB columns snake_case (Drizzle maps to camelCase).

### Request flow

```
POST /api/chat (SSE)  →  runPokebot (tool-loop)  →  11 tools  →  repos  →  SQLite
   src/app/api/chat/route.ts      src/agent/runtime.ts   src/agent/tools/   src/data/repos/   data/pokebot.sqlite
```

- **`route.ts`** validates the body `{ session_id, message, champions_mode }`, applies the input-length cap + per-session rate limit *before* opening the stream, resolves prior history from the in-memory session store, then streams SSE events: `tool_activity`\* (one per tool call) → `answer_start`/`answer_delta`\* (token-by-token `answer_markdown`) → exactly one terminal `answer`. Only a transport/API fault emits an `error` event — every in-domain failure rides a normal `answer` event with the appropriate `status`. `runtime = "nodejs"`, `dynamic = "force-dynamic"`; the runtime is **dynamically imported** inside the request so `next build` doesn't evaluate `env` (which throws on a missing API key) at build time.
- **`runtime.ts`** drives one Claude tool-loop turn (model is `ANTHROPIC_MODEL`, default Sonnet 4.6). It assembles a byte-identical, prompt-cached prefix (system + few-shot + 11 tool defs), appends history + message, loops ≤ `MAX_ITERATIONS` (10), and validates the `submit_answer` payload against the `PokebotAnswer` Zod schema (≤2 re-emits on failure, else synthesizes an `insufficient_data` answer). It **never throws for in-domain failures** — those return a valid `PokebotAnswer`; only transport faults propagate.
- **Tools** (`src/agent/tools/`, T1–T11, names fixed by `docs/agent-design/tools.md`) wrap repos + formulas and return the exact structured shapes the model reasons about. They **never throw in-domain** — they return documented shapes like `{ found:false, suggestions }`, `{ unresolved:[…] }`, `{ error:"index_unavailable" }`. `index.ts` is the barrel exporting `tools` and `dispatch`.

### Data layer — built from `@pkmn`, not PokeAPI

**Important divergence from `docs/architecture/design.md`:** the design describes a throttled PokeAPI crawler + read-through reference cache (`src/data/pokeapi-client.ts`, `warm-cache.ts`). That was **replaced by the `@pkmn` ecosystem** (`@pkmn/dex`, `@pkmn/data`, `@pkmn/mods`). Those files don't exist; there is no network call and no upstream-outage handling. All index data is built offline from local npm packages.

- **`src/data/pkmn/gen-provider.ts`** is the *single* `@pkmn` integration point. `loadFormat(format)` returns a `FormatSource` with the resolved dex, roster, moves/abilities/items/types, and `getLearnset`. Every `@pkmn` quirk (legality gates, Mega resolution, slugifying display names to legacy PokeAPI-style slugs) lives here — ingest builders never import `@pkmn` directly.
- **Ingest** (`src/ingest/run.ts`) builds every format fully in memory, then replaces each table in one synchronous transaction (DELETE all + chunked INSERT). Idempotent. It runs under `tsx` as its own process and opens its **own** better-sqlite3 handle (it cannot import `@/data/db`, which is `server-only`).
- **SQLite via Drizzle** (`src/data/schema.ts`, `src/data/db.ts`). `db.ts` is `server-only`, memoizes one connection on `globalThis` (survives Next hot-reload), resolves `POKEBOT_DB_PATH` to an absolute path independent of `cwd`, runs WAL, and applies migrations on first connect.
- **Repos** (`src/data/repos/`) are the *sole* SQLite readers. The agent runtime knows only the tool layer (`ToolDef[]`/`dispatch`), never repos; tools call repos.

### Two formats (standard + Champions)

The index stores one row-set **per format**, discriminated by a `format` column on every data table (`"scarlet-violet"` | `"champions"`). The active format comes from `AgentMode`, which is **server-controlled** — derived from the request body's `champions_mode`, bound onto `AgentContext.mode`, and read by repos/runtime. It is deliberately **never an LLM-visible tool input**, so when the Champions toggle is on, the model has no parameter to widen scope. `src/data/formats.ts` holds the pure mode↔format mapping and the current Champions regulation string; `runtime.ts` selects a parallel Champions system-prompt prefix (`src/agent/prompts/champions.ts`).

### Key conventions

- **Zod is the single source of truth** (`src/agent/schemas.ts`): runtime validation, inferred TS types, and the Anthropic tool / `submit_answer` JSON Schemas (via `zod-to-json-schema`) all derive from one definition. Don't hand-maintain a duplicate JSON Schema.
- **Tool names and tool output field names are a contract** the model depends on (`tools.md` / `output-formats.md`). Never rename them.
- **Error styles split at the runtime/route seam:** Result unions / structured shapes in the tool+data layer (never throw in-domain); try/catch → error mapping at the HTTP edge.
- **Frontend** (`src/components/`) renders a `PokebotAnswer` field-by-field (`AnswerCard` tree). Component tests render fixture payloads only and must **never** import db/repos/runtime — native better-sqlite3 fails under jsdom.

## Testing

Vitest with two projects (`vitest.config.ts`): a **node** project (`src/**`, `test/**`, `eval/**` `*.test.ts`) and a **jsdom** project (`*.test.tsx` component/full-stack tests). A dummy `ANTHROPIC_API_KEY` is injected for all runs so `src/env.ts` imports succeed and tests can never reach the real API. Test-file infixes are human conventions, not separate runners: `*.oracle.test.ts` (deterministic tool checks vs. a fixture DB), `*.integration.test.ts`, `*.fullstack.test.tsx`.

What's real vs. faked: SQLite (a real fixture DB from `eval/fixtures/seed-fixture-db.ts`), the tool layer, formulas, and Zod validation are **real**; PokeAPI/`@pkmn` quirks and the Anthropic client are **mocked/recorded**. Only the judged `eval` suite hits a live model. The deterministic eval subset (`eval/deterministic.ts`) is imported into Vitest so it gates every run.

## Gotchas (learned the hard way)

- **Dev runs in Docker; host `npm install` doesn't reach the container.** After adding a dependency, refresh the anonymous `node_modules` volume (it masks the host's macOS modules with the container's Linux build) — a plain restart won't pick up new packages.
- **Re-ingest after any migration.** The ingest write path DELETEs + recreates table contents, and Drizzle migrations can drop/recreate tables, leaving an empty DB. Re-run `npm run ingest` (or `npm run docker:ingest`) or the app/tests see empty tables.
- **`resolve_entity` (resolve-index) reads the `@/data/db` singleton, not `ctx.db`.** Eval/oracle tests that exercise resolution must seed `POKEBOT_DB_PATH` to the fixture, not only inject `ctx.db`.
- **Don't force `tool_choice` while thinking is on.** Thinking + a forced `tool_choice` is a hard 400 on Sonnet 4.6. The loop uses `tool_choice: "auto"` + adaptive thinking and drives `submit_answer` via the system prompt and the max-iteration guard. If you change this, keep the iteration cap.
- **`env` is validated at module load and throws on a missing `ANTHROPIC_API_KEY`.** That's why the route dynamically imports the runtime and `drizzle.config.ts` reads `POKEBOT_DB_PATH` directly instead of importing `src/env.ts`.
