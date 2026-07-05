# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Oak is a web chat agent for the Pokémon **games** — it answers natural-language questions about the games (filters, lookups, mechanics reasoning, battle math, in-game locations/events/glitches), spanning mainline titles across every generation, Pokémon Champions, and spin-off games like Pokémon Mystery Dungeon. It is a GAMES assistant, **not** a whole-franchise one: the anime, movies/films, TV, and manga are out of scope and are gracefully declined (games-only pivot, `docs/features/oak-v2/design.md` §9b). Its defining trait is that it **reasons on top of data**: tools supply raw facts (move priority, ability effect text, type charts, base stats) and the agent deduces how they interact. Every answer carries reasoning, cited sources, explicit inference/uncertainty flags, and the generation/format it's based on.

It is usable as a **guest** (in-memory, per-session) and supports optional **email/OTP accounts** that unlock durable chat history and the team builder (see `docs/features/`). It is not a single-tenant app — auth, conversations, and teams are all account-scoped.

The agent's internals (topology, the original T1–T11 tools, prompts, the `OakAnswer` output schema, eval spec) are **fixed by design** in `docs/agent-design/`. Feature tools were appended after that contract — T12 `get_team` + T16 `list_teams` (read saved teams) and T13 `save_team` (team-builder, reconciled into agent-design), T14 `get_encounters` (PokeAPI catch data), T15 `get_usage_stats` (live Champions competitive usage), and T17 `get_learnset` (B-13 — a species' complete legal moveset, so the agent can verify team moves before proposing instead of guessing); then the **oak-v2** whole-games tools — T18 `run_sql` (guarded read-only SQL over the offline national-dex warehouse, for aggregations the typed tools can't express) and T19 `search_wiki` (full-text retrieval over a self-built Fandom corpus, re-scoped by §9b to GAME content only — in-game locations/mechanics/glitches/walkthroughs and Mystery Dungeon, NOT anime/movies) — for **19 tools** total. (T20 `web_search`, Oak's live-web Tavily tool, was removed 2026-07-03 — cost vs. marginal value; time-sensitive facts now degrade honestly via `search_wiki`/prompt policy instead.) These extend Oak from the six competitive formats to answering any GAMES question (mainline all-gens, Champions, spin-off games) with one agent and one prompt; franchise MEDIA (anime/movies/TV/manga) is out of scope and declined (see `docs/features/oak-v2/`, esp. §9b). The surrounding system (data store, ingest, tool wiring, web API, frontend, eval harness) is specified in `docs/architecture/design.md`. When agent internals and the architecture doc disagree, agent-design wins on internals; the architecture doc wins on stack/storage/layout.

> `README.md` is current and accurate — it tracks the implemented app. The architecture doc, by contrast, predates several choices (the `@pkmn`/Postgres move, the multi-user account/history/team features). Where docs disagree, trust the code, then `README.md`/`CLAUDE.md`.

## Git workflow

Multiple agents work on this repo in parallel, so **`develop` is the shared integration branch** — every agent's work lands there, never `main` (unless the user explicitly asks for a `main` commit/release).

To avoid agents stepping on each other's uncommitted changes, **each agent must create its own git worktree off `develop` before starting any work**, rather than editing directly in a shared checkout:

```bash
git worktree add ../oak-<task> -b agent/<task> develop
```

Do all edits and commits inside that worktree, on its own branch. **Only once the work is complete and verified** (the relevant `typecheck`/`lint`/`test` commands passing per the Commands section) does the agent merge its branch back into `develop`:

```bash
git checkout develop && git pull
git merge agent/<task>
git worktree remove ../oak-<task>
git branch -d agent/<task>
```

Never commit straight to a shared `develop` working copy while other agents may also be active in it — always go through a worktree, and never leave finished work stranded on an agent branch instead of merged into `develop`.

## Repository layout

The app lives in **`web/`** — the Next.js app plus all of its config (`package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `drizzle.config.ts`), `src/`, `test/`, `eval/`, `drizzle/`, `scripts/`, and deployment files (`Dockerfile*`, `docker-compose.dev.yml`, `fly.toml`, `migrate.mjs`). The native mobile clients live in sibling folders: **`ios/`** (Swift 6 / SwiftUI) and **`android/`** (Kotlin 2.1 / Jetpack Compose) — both pure clients of `web/`'s HTTP/SSE API, holding no LLM keys or DB access of their own. Only `docs/`, `README.md`, `CLAUDE.md`, `ios/`, `android/`, and `.git/` stay at the repo root. **All `src/…`, `test/…`, `eval/…`, and `drizzle/` paths in this document are relative to `web/`**, and the `@/` alias resolves to `web/src/`.

## Commands

Run every command below from **`web/`** (`cd web` first) — that's where `package.json` lives. Deploy with `cd web && fly deploy`. The Redis state tier (see Architecture below) is a separate Fly app, deployed from its own directory: `cd web/deploy/redis && fly deploy -a oak-gowtam-redis`.

```bash
npm run dev          # next dev (local)
npm run build        # next build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint .
npm test             # vitest run (unit + integration + deterministic eval subset) — NEEDS Docker (Testcontainers Postgres)
npm run db:migrate   # tsx src/data/migrate.ts — apply Drizzle migrations to $DATABASE_URL
npm run ingest       # tsx src/ingest/run.ts — (re)build the Postgres index from @pkmn (runs migrations first)
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
npm run ingest -- --formats=gen-7                  # build one format only (default: all six)
tsx eval/run.ts --deterministic                   # offline CI subset (mocked model, fixture DB)
tsx eval/run.ts --rebuild                          # post-ingest regression set (G1/G5/G6/G7/G17)
tsx eval/run.ts --case=G4,G11                      # specific golden cases
```

Docker dev (the intended dev environment — see Gotchas):

```bash
npm run docker:dev      # build + up (Postgres `db` + next dev on :3000)
npm run docker:migrate  # apply migrations inside the container
npm run docker:ingest   # run ingest inside the container (migrates first)
npm run docker:psql     # psql shell into the Postgres service
npm run docker:logs     # tail web logs
npm run docker:sh       # shell into the web container
npm run docker:down
```

Node 20+ is required (`.nvmrc`). `typecheck`, `lint`, and the jsdom component tests run with no Docker; **`npm test` (the node project) needs a running Docker daemon** — Testcontainers spins up an ephemeral `postgres:16` for the run. The full judged `eval` needs **both** a real `XAI_API_KEY` (the agent runs on Grok) and a real `ANTHROPIC_API_KEY` (the judge runs on Claude). `@pkmn` is a local package, so `ingest` never hits the network (but it does need a reachable Postgres via `DATABASE_URL`).

## Architecture

A single **TypeScript / Next.js (App Router) monolith**, rooted at `web/` (see Repository layout). One language across frontend, API, agent loop, and the ingest CLI. TS `strict`, ESM, path alias `@/` → `src/` (i.e. `web/src/` from the repo root). Files kebab-case; types/components PascalCase; DB columns snake_case (Drizzle maps to camelCase).

### Request flow

```
POST /api/chat (SSE)  →  runOak (tool-loop)  →  19 tools  →  repos  →  Postgres
   src/app/api/chat/route.ts      src/agent/runtime.ts   src/agent/tools/   src/data/repos/   node-postgres @ $DATABASE_URL
```

- **`route.ts`** validates the body `{ session_id, message, scope_seed?, champions_mode? (deprecated), images? }`, applies the input-length cap + per-session rate limit *before* opening the stream, resolves prior history from the in-memory session store, then streams SSE events: `tool_activity`\* (one per tool call) → `answer_start`/`answer_delta`\* (token-by-token `answer_markdown`) → exactly one terminal `answer`. Only a transport/API fault emits an `error` event — every in-domain failure rides a normal `answer` event with the appropriate `status`. `runtime = "nodejs"`, `dynamic = "force-dynamic"`; the runtime is **dynamically imported** inside the request so `next build` doesn't evaluate `env` (which throws on a missing API key) at build time.
- **Image input (vision).** A turn can attach ≤4 images (`images: { mimeType, data(base64) }[]`). `validateImages` (`src/server/image-upload.ts`) runs before the stream opens — count cap, **magic-byte MIME sniff** (the sniffed type is canonical; Anthropic 400s on a mismatched `media_type`), and per-image/total decoded-byte caps (413), plus a `Content-Length` pre-check. The canonical images bind onto **`AgentContext.images`** (server-controlled, like `mode`/`model`/`activeTeam`) and are read once at the `provider.createTranscript(history, message, ctx.images)` call — **consume-on-turn**: images ride only on the *current* user message and are **never** stored in history (`ChatMessage`/session store/DB are untouched). Each provider formats them natively (Anthropic base64 `image` block w/ ephemeral cache breakpoint; OpenAI `image_url` data URL; Grok Responses `input_image` data URL); a text-only turn keeps `content` a plain string for byte-stability. `message` may be empty when an image is attached. All three models are vision-capable, so there's no per-model gate. Prompt guidance lives in the "Interpreting attached images" section of the single `prompts/domain.ts` body (general reasoning, not just teams; flag illegible parts as uncertainty).
- **`runtime.ts`** drives one **provider-agnostic** tool-loop turn (`runWithProvider`). The default/primary model is **Grok 4.3** — the native xAI Responses provider (`src/agent/providers/grok-provider.ts`); Claude (`ANTHROPIC_MODEL`) and GPT-5.5 stay selectable per turn via `ctx.model`. It assembles a byte-stable, prompt-cached prefix (system + few-shot + tool defs; xAI caches a stable prefix automatically), appends history + message, loops ≤ `MAX_ITERATIONS` (10), and validates the `submit_answer` payload against the `OakAnswer` Zod schema (≤2 re-emits on failure, else synthesizes an `insufficient_data` answer). It **never throws for in-domain failures** — those return a valid `OakAnswer`; only transport faults propagate.
- **Tools** (`src/agent/tools/`, T1–T19; T1–T11 names fixed by `docs/agent-design/tools.md`, T12–T19 appended last — the barrel order is **append-only**, not T-id order — so the cached prefix is unchanged) wrap repos + formulas and return the exact structured shapes the model reasons about. They **never throw in-domain** — they return documented shapes like `{ found:false, suggestions }`, `{ unresolved:[…] }`, `{ error:"index_unavailable" }`. `index.ts` is the barrel exporting `tools` and `dispatch`. The two oak-v2 tools (`run_sql`/`search_wiki`) are gated OUT of voice mode via `VOICE_EXCLUDED_TOOLS`.

### Data layer — built from `@pkmn`, not PokeAPI

**Important divergence from `docs/architecture/design.md`:** the design describes a throttled PokeAPI crawler + read-through reference cache (`src/data/pokeapi-client.ts`, `warm-cache.ts`). That was **replaced by the `@pkmn` ecosystem** (`@pkmn/dex`, `@pkmn/data`, `@pkmn/mods`). Those files don't exist; there is no network call and no upstream-outage handling. All index data is built offline from local npm packages.

- **`src/data/pkmn/gen-provider.ts`** is the *single* `@pkmn` integration point. `loadFormat(format)` returns a `FormatSource` with the resolved dex, roster, moves/abilities/items/types, and `getLearnset`. Every `@pkmn` quirk (legality gates, Mega resolution, slugifying display names to legacy PokeAPI-style slugs) lives here — ingest builders never import `@pkmn` directly.
- **Ingest** (`src/ingest/run.ts`) builds every format fully in memory, then replaces each table in one async transaction (DELETE all + chunked INSERT, 500 rows/chunk — well under Postgres' 65535 bind-param cap). Idempotent. It runs under `tsx` as its own process, opens its **own** `pg.Pool` over `DATABASE_URL`, and applies migrations before writing (it cannot import `@/data/db`, which is `server-only`).
- **Postgres via Drizzle + node-postgres** (`src/data/schema.ts`, `src/data/db.ts`). `db.ts` is `server-only` and memoizes one `pg.Pool` + Drizzle handle on `globalThis` (survives Next hot-reload). The pool is lazy, so the `db` export stays synchronous; migrations are **not** run on connect — apply them out-of-band via `npm run db:migrate` (or the ingest CLI). All repo reads/writes are `async`. Schema notes: `fetched_at`/`last_success_at` are `bigint` (epoch-ms overflows int4); `count(*)`/`count(distinct)` read into JS need `.mapWith(Number)` (node-postgres returns bigint as a string); `like` → `ilike` (Postgres `LIKE` is case-sensitive). Migrations live in `drizzle/` (a single Postgres baseline; the old SQLite migrations were dropped).
- **Repos** (`src/data/repos/`) are the *sole* Postgres readers, and they are **async**. The agent runtime knows only the tool layer (`ToolDef[]`/`dispatch`), never repos; tools call repos.

### State tier — guest sessions, rate limiter, OTP throttle (dual-backend)

Three modules hold state outside Postgres, each behind a stable module API and each **dual-backend** via `src/server/redis.ts` (`getRedisClient()`, reading `process.env.REDIS_URL` at call time, memoized on `globalThis` like `db.ts`): `REDIS_URL` unset ⇒ in-process (`BoundedStore`, single-machine semantics; production logs a one-time warning); set ⇒ Redis, so any machine can serve any request. Each has its own failure policy for a reachable-then-down Redis: the **guest session store** (`src/server/session-store.ts`, history + sticky scope) is **fail-soft** (`getHistory` → `[]`, writes log-and-continue); the **rate limiter** (`src/server/rate-limit.ts`) is **fail-open** (a limiter outage must not block chat); the **OTP throttle** (`src/server/auth/otp-throttle.ts`) is **fail-CLOSED** (a security control — an outage blocks sign-ins, by design). Production runs a small self-run Fly Redis machine (`web/deploy/redis/`, private 6PN networking only, no volume — see README's Redis runbook); local/dev/test default to the in-process fallback.

### Formats & scope resolution (six formats; champions is the default)

The index stores one row-set **per format**, discriminated by a `format` column on every data table. There are **six** formats (`src/data/formats.ts` `FORMATS`, the pure/portable source of truth): `"scarlet-violet"` (Gen 9 / standard), `"champions"`, and mainline `"gen-5"`…`"gen-8"` (the generation-scope feature; Gens 1–4 are out of scope). `AgentMode` widens to match — `"standard"` stays the Gen 9 alias (all `mode === "champions"` guards and the `"standard"` default stay valid), and the gen scopes map 1:1. `src/data/formats.ts` holds the pure mode↔format mappings (`formatForMode`/`modeForFormat`/`genNumberForFormat`/`basisForFormat`) and the current Champions regulation string. Ingest builds **all six** formats (`DEFAULT_FORMATS = FORMATS`); `--formats=` filters. Since **oak-v2** (prompt collapse), scope is a CONTEXT VALUE, not a prompt selector: the ONE canonical body (`src/agent/prompts/domain.ts`) injects the active scope's facts — the Champions profile (`src/agent/prompts/champions.ts`) or a mainline per-gen profile from the single-source facts in `src/agent/prompts/gen-info.ts` — as a templated section. The competitive scope only sets the DEFAULT for the format-scoped typed tools; the rest of the GAMES (other gens incl. 1–4, in-game locations/glitches, spin-off games like Mystery Dungeon, game release dates/live-service) is answerable from the same body via `run_sql`/`search_wiki` (Oak has no live web tool — T20 `web_search` was removed 2026-07-03; time-sensitive facts degrade honestly instead). Franchise MEDIA (anime/movies/TV/manga) is out of scope and declined in-persona (§9b). The Gen 1–4 short-circuit is gone — a named-but-unindexed gen resolves to the STANDARD data scope and proceeds.

The active format still comes from `AgentMode`, which is **server-controlled** — bound onto `AgentContext.mode`, read by repos/runtime, and deliberately **never an LLM-visible tool input** (the model has no parameter to widen or change scope). The web Champions toggle is **removed**; a new conversation defaults to **champions** scope. The interactive header **scope chip** (`web/src/components/controls/ScopeChip.tsx`) lets a user tap to pick any of the six scopes, which sends `scope_seed` (one of the six `Format`s) on the next message. The chat route (`src/app/api/chat/route.ts`) resolves each turn's scope with precedence **explicit in-message signal > `scope_seed` (chip pick — fresh intent ranks above sticky) > conversation's sticky scope > deprecated `champions_mode` boolean (`true`→champions, `false`→scarlet-violet; ranks below sticky, preserving BR-H6 resume semantics) > default champions**, using a **deterministic lexicon — no LLM pre-pass** (`src/lib/scope/detect-scope.ts`, a pure module: high-precision game/region/mechanic keywords — including Gen 9 terms like koraidon, miraidon, terapagos, area zero, vgc, mainline — precision over recall; Gens 1–4 are detected as `unsupported` and answered honestly, not silently from Gen 9). A signal that switches a conversation's scope is **persisted** (BR-H6′: signed-in via `updateConversationFormat`, guest via `setSessionScope` — both fire-and-forget). A chip pick with no follow-up message is not persisted (accepted gap). The resolved scope is surfaced to the client via a new SSE **`scope`** event (`{ format, source }`, `source` one of `"message" | "conversation" | "seed" | "default"`, emitted once/turn) and the header scope chip (`src/lib/scope/scope-label.ts`). In **champions** scope only, a tool miss on `resolve_entity`/`get_pokemon`/`get_move`/`get_ability`/`get_item` gains an additive `exists_in_standard: boolean` flag — true when the missed entity exists in mainline Gen 9 — so the model can tell the user to try Scarlet/Violet scope instead of just saying "not found." `get_evolution_chain` instead **falls back** on a champions miss: because evolution is a whole-GAME fact the roster doesn't gate, it returns the mainline Scarlet/Violet chain marked `source_format: "scarlet-violet"` (only if mainline also misses does it carry `exists_in_standard: false`). Encounter data stays stored under `scarlet-violet` only (read via `STANDARD_FORMAT` in any mainline scope; GS-D4). See `docs/agent-design/generation-scope-addendum.md` + `docs/features/generation-scope/`.

### Models & providers (Grok primary)

The agent loop is **provider-agnostic** behind the `LLMProvider` seam (`src/agent/providers/`). Three providers plug in: **xAI Grok 4.3** — the primary/default, a *native* adapter on xAI's **Responses API** (`grok-provider.ts`); **Claude** (`anthropic-provider.ts`); and **OpenAI GPT-5.5** (`openai-compatible-provider.ts`, the Chat Completions shim). The split:

- **`models.ts`** — CLIENT-SAFE registry (no SDK / `@/env`): `ModelKey`, `MODELS` (display order — **Grok first**), `DEFAULT_MODEL_KEY = "grok-4.3"`, plus `modelLabel`/`isModelKey`. Adding a model is one line here + one `factory.ts` entry. (There is **no in-app model picker** — the registry just backs server-side resolution + labels.)
- **`factory.ts`** — SERVER-ONLY: maps a `ModelKey` to its wiring and constructs the provider, **validate-on-use** (a missing key throws `ProviderNotConfiguredError` → the route's clean 503, never at boot). Only `XAI_API_KEY` is required at boot; Anthropic/OpenAI keys are optional.
- **`types.ts`** — the pure contract (no SDK). The loop pushes an OPAQUE, provider-owned transcript it never inspects, and consumes NORMALIZED stream events — that's what lets one loop serve Anthropic content-blocks, OpenAI `{role,content,tool_calls}`, and Grok Responses `input` items identically.
- The active model is **operator-controlled**, NOT chosen per request: `factory.activeModelKey()` resolves the `ACTIVE_MODEL` secret (unset ⇒ `grok-4.3`) and the route binds it onto `AgentContext.model`. Any `model` field in the request body is ignored. Like `mode`, it is never an LLM-visible tool input; switching models is one secret change (`fly secrets set ACTIVE_MODEL=…`), no rebuild. The route fails fast with a clean 503 (`isModelConfigured`) if the selected model's provider key is absent. `buildSystemSegments` (`prompts/index.ts`) builds the ONE body for the turn's scope and wraps it per provider.
- **ONE canonical prompt body for all three providers** (oak-v2 prompt collapse — the per-model fork is GONE). `prompts/domain.ts` is the single Markdown body; `domainForMode(mode)` injects the active scope's facts as a `ScopeProfile` (mainline from `gen-info.ts`, Champions from `champions.ts`). The style wrappers are thin: `style-claude.ts` and `style-grok.ts` are byte-identical two-segment pass-throughs (system body + few-shot, one ephemeral cache breakpoint on the LAST segment); `style-openai.ts` adds its `AGENT_CONTRACT`/`OUTPUT_CONTRACT` segments (four segments, breakpoint still on the last). The body front-loads the submit_answer-terminates-turn + GFM contract, teaches routing to all 19 tools, and embeds the `run_sql` warehouse DDL (`prompts/warehouse-ddl.ts`) in the cached prefix.
- **No more cross-body PARITY rule** (there is only one body). `style.test.ts` pins the segment/breakpoint invariants + the new-tool routing + DDL; `parity.test.ts` now pins that the single body carries every per-gen fact (label + basisTag, lock-step with `formats.ts`) and names all six formats. `voice.ts` stays a separate, parity-exempt prompt surface (the voice model speaks rather than emitting the OakAnswer contract).

### Voice mode (real-time spoken chat, signed-in only)

Real-time, spoken conversation with Oak (a Pokédex persona) via three new `POST /api/voice/*` endpoints (`token`, `tool`, `transcript`; see `docs/features/voice-mode/`). The browser connects **directly** to xAI's Grok Voice Agent realtime API over WebSocket using a server-minted ephemeral token — there is no WebSocket proxy through Oak's own server. The **`grok-voice` model is its own brain**, not driven through `runtime.ts`'s tool loop; it calls Oak's existing tool layer minus `submit_answer` as realtime function calls (relayed per-call through `/api/voice/tool` into the same `dispatch()`), and speaks its answer directly instead of emitting a structured `OakAnswer`. Each finished voice turn is persisted into the signed-in conversation via `appendTurnPair` (a synthesized minimal `OakAnswer`, validated against the real schema) so voice and text chat share one unified history. **Signed-in users only** for v1 — the endpoints 401 a guest — though they're already Bearer-compatible for a future iOS client. `src/agent/prompts/voice.ts` is its OWN prompt surface, separate from the single canonical `domain.ts` text-chat body: the voice model speaks rather than emitting the OakAnswer output contract, so this prompt has no citation/output-contract machinery and may diverge in structure from the text-chat prompt (it still reuses the same single-source domain facts, so it never disagrees on substance).

### Admin panel (read-only operator dashboard)

A private, **read-only** owner dashboard, shipped as a protected `/admin` route group **inside this same Next app** (not a separate SPA) plus a `/api/admin/*` API. It reads the same Postgres through new cross-account repos and **mutates nothing** — the only writes the feature adds are two append-only records (see below). Requirements/design: `docs/features/admin-panel/`.

- **Gating.** `ADMIN_EMAILS` (comma-separated allowlist) is read from `process.env` **at call time** — like `logger.ts` reads `LOG_LEVEL`, NOT through the memoized `env` object — so the build-time env throw is sidestepped and the allowlist is re-stubbable per test. **Unset ⇒ zero admins ⇒ the panel is dark** (safe default). Two layers (AD-5): `requireAdminRequest` on every `/api/admin/*` route, and a server-component gate in `app/admin/layout.tsx` (redirects non-admins so they never receive admin HTML). `isAdmin`/`requireAdmin` live in `src/server/auth/admin.ts`; both reuse the existing `getCurrentAccount()` (cookie + Bearer). There is **no link to `/admin` from the main app** — the operator reaches it via the direct URL.
- **Recording enabler (two new append-only tables).** `turn_record` — **one row per chat turn, guest and signed-in** (the persisted form of the runtime's `TurnTrace` plus `prompt_text`/`answer_text`/`answer_json`, token counts, tool trace, status, mode, model, timing). `auth_event` — one row per auth event (`otp_requested`/`otp_verified`/`otp_email_failed`). These tables are the analytics store the panel reads; the existing `conversation`/`team` tables remain the source for signed-in saved threads/teams. `rate_limited` is a recorded `turn_record` status (a superset of the agent's `TurnStatus`, AD-4).
- **Recording is NON-BLOCKING (ADMIN-BR-3).** The runtime hands its already-built `TurnTrace` back via an optional `AgentContext.onTurnComplete` sink (one line in `runtime.ts` `finalize()`, next to `logTurn`); the **chat route** composes the record and fires `void recordTurn(...).catch(logOnly)` on the existing post-answer path (and a `rate_limited` row on the rate-limit branch), and the auth emit sites fire `void recordAuthEvent(...).catch(logOnly)`. Every recording call is fire-and-forget — **never awaited** on the user's critical path; a recorder failure never fails or slows a turn. `recordTurn`/`recordAuthEvent` (INSERT-only) live in `src/data/repos/usage-repo.ts`.
- **Retention is INDEFINITE** (no prune job). This means **guest** prompts/answers — previously ephemeral — are now persisted and readable by the operator, so `app/privacy/page.tsx` discloses operator read access + usage recording (ADMIN-BR-7, AD-3). The disclosure copy is a single source of truth in `src/components/admin/operator-access-disclosure.ts` (pinned by its `.test.tsx`).
- **Cost is an ESTIMATE** (ADMIN-BR-5/AD-6): a static in-code `MODEL_PRICING` table + `estimateCostUsd` (`src/server/admin/pricing.ts`); cost responses carry `estimated:true`. **Charts are hand-rolled inline SVG/CSS** — no charting dependency. Admin read repos (`admin-analytics-repo.ts`, `admin-content-repo.ts`) are cross-account/un-scoped (the only place repos aren't `account_id`-scoped) and read-only; client-safe wire types live in `src/lib/admin/admin-types.ts`. Every `/api/admin/*` route is `runtime="nodejs"` + `dynamic="force-dynamic"` and reaches its repo/guard via **dynamic import** inside the handler (same env-throw avoidance as `/api/chat`).

### Key conventions

- **Zod is the single source of truth** (`src/agent/schemas.ts`): runtime validation, inferred TS types, and the provider tool / `submit_answer` JSON Schemas (via `zod-to-json-schema`) all derive from one definition — the same JSON Schema feeds Anthropic, OpenAI, and the Grok Responses adapter. Don't hand-maintain a duplicate JSON Schema.
- **Tool names and tool output field names are a contract** the model depends on (`tools.md` / `output-formats.md`). Never rename them.
- **Error styles split at the runtime/route seam:** Result unions / structured shapes in the tool+data layer (never throw in-domain); try/catch → error mapping at the HTTP edge.
- **Frontend** (`src/components/`) renders a `OakAnswer` field-by-field (`AnswerCard` tree, under `src/components/answer-card/`). Component tests render fixture payloads only and must **never** import db/repos/runtime — they pull `server-only`/open a Postgres pool, and the jsdom project has no Testcontainers Postgres.

### Portable modules (mobile-readiness)

A future mobile client would talk to the same **`POST /api/chat` (SSE)** seam the web app uses; no LLM keys or DB access live on the client. If a JS/TS client (e.g. React Native) is ever built, these modules are already pure and platform-agnostic (no Node/Next/React/`server-only`/DB imports) and could be reused verbatim — or lifted into a shared package with no rewrite:

- `src/agent/schemas.ts` — Zod schemas + the `OakAnswer` output contract.
- `src/agent/formulas/*` — battle math (`compute-stat`, `estimate-damage`, `natures`, `type-chart`); pure, deterministic, test-guarded.
- `src/lib/sse/sse-types.ts` — the request body + SSE event types (the wire contract).
- `src/data/teams/team-schema.ts` — the team data model.
- `src/data/formats.ts` — the mode↔format mapping.
- `src/agent/models.ts` — the client-safe model registry.

Everything else (repos/`db.ts`, `src/server/auth/*`, `env.ts`, the React components) is server- or DOM-bound and stays behind the API. No shared package exists today — this is a map for when one is needed, not an existing boundary to maintain.

## Testing

Vitest with two projects (`vitest.config.ts`): a **node** project (`src/**`, `test/**`, `eval/**` `*.test.ts`) and a **jsdom** project (`*.test.tsx` component/full-stack tests). A dummy `XAI_API_KEY` (the now-required primary key) and a dummy `ANTHROPIC_API_KEY` are injected for all runs so `src/env.ts` imports succeed, Claude stays selectable, and tests can never reach the real API. Test-file infixes are human conventions, not separate runners: `*.oracle.test.ts` (deterministic tool checks vs. a fixture DB), `*.integration.test.ts`, `*.fullstack.test.tsx`.

The **node project** starts ONE Postgres container per run via a Testcontainers `globalSetup` (`test/support/pg-global-setup.ts`) and publishes its URI through Vitest `provide`/`inject`. Each DB test carves an isolated **schema** via `createPgSchema({ seed })` (`test/support/pg.ts`) and, when it exercises `resolve_entity`, installs that schema as the `@/data/db` singleton with `installAsSingleton()`. Two curated datasets exist: `seed: "tools"` (`test/fixtures/tools-fixture.ts`) and `seed: "eval"` (`eval/fixtures/seed-fixture-db.ts`); `seed: "none"` is migrated-but-empty. The **jsdom project has no globalSetup** and needs no Docker.

What's real vs. faked: Postgres (a real migrated+seeded schema), the tool layer, formulas, and Zod validation are **real**; `@pkmn` quirks and the provider clients (Anthropic / OpenAI / xAI) are **mocked/recorded** (each provider has a recorded-stream test, e.g. `grok-provider.test.ts`). Only the judged `eval` suite hits a live model. The deterministic eval subset (`eval/deterministic.ts`) is imported into Vitest so it gates every run.

## Gotchas (learned the hard way)

- **Dev runs in Docker; host `npm install` doesn't reach the container.** After adding a dependency, refresh the anonymous `node_modules` volume (it masks the host's macOS modules with the container's Linux build) — a plain restart won't pick up new packages.
- **`npm test` needs a Docker daemon** (Testcontainers Postgres **and** Redis for the node project — one more container since the state-tier dual-backend landed). `typecheck`, `lint`, and `npm run test:components` (jsdom) run without Docker.
- **Migrate + re-ingest after any schema change.** Migrations are no longer applied on connect. Run `npm run db:migrate` then `npm run ingest` (or just `npm run docker:ingest`, which migrates first); the ingest write path DELETEs + recreates table contents, so a stale/empty DB otherwise reads as `index_unavailable`. **Re-ingest is also required after adopting the generation-scope feature** — the four new mainline formats (`gen-5`…`gen-8`) don't exist in an older index, so a gen-scoped turn reads `index_unavailable` until `npm run ingest` (default builds all six) has run.
- **`resolve_entity` (resolve-index) reads the `@/data/db` singleton, not `ctx.db`.** Tests that exercise resolution must `installAsSingleton(fix)` (which sets `globalThis.__oakDb` + resets the resolve cache), not only bind `ctx.db`.
- **Don't force `tool_choice` while thinking is on.** Thinking + a forced `tool_choice` is a hard 400 on Sonnet 4.6. The loop uses `tool_choice: "auto"` + adaptive thinking and drives `submit_answer` via the system prompt and the max-iteration guard. If you change this, keep the iteration cap.
- **The native Grok provider speaks xAI's Responses API, not Chat Completions.** `grok-provider.ts` uses `client.responses.create` (the OpenAI SDK pointed at `XAI_BASE_URL` — no extra dependency). Quirks vs. the OpenAI shim: tools use the FLATTENED Responses shape (`{type:"function", name, …}`, *not* `{function:{…}}`); `reasoning:{effort:"high"}` is set EXPLICITLY (grok-4.3 defaults to `low`); the turn is stateless (`store:false`) and echoes the whole `response.output` (reasoning + message + function_call) back, flattening the opaque transcript at request time — so the loop stays untouched; reasoning round-trips via `include:["reasoning.encrypted_content"]` (set `echoReasoning:false` if xAI ever rejects reasoning-as-input); and xAI delivers tool-call args in ONE chunk, so `answer_markdown` arrives in a single `answer_delta` (the `function_call_arguments.done` fallback covers it). Prompt caching is automatic on a stable prefix — no `cache_control`.
- **`env` is validated at module load and throws on a missing `XAI_API_KEY`** (Grok is the primary provider — its key is the only required one; `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` are optional, validate-on-use). That's why the route dynamically imports the runtime and `drizzle.config.ts` reads `DATABASE_URL` directly instead of importing `src/env.ts`. (`DATABASE_URL` itself has a dev default, so it's not required to boot.)

## iOS app (TestFlight releases)

The native client lives in **`ios/`** (Swift 6 / SwiftUI; `OakApp.xcodeproj` is gitignored and generated from `ios/project.yml` via `xcodegen generate` — see `ios/README.md` for the full build/test walkthrough). To ship a new TestFlight build:

1. Bump `CURRENT_PROJECT_VERSION` in `ios/project.yml` — App Store Connect rejects a reused build number for the same `MARKETING_VERSION`.
2. `cd ios && xcodegen generate` to regenerate the project from the new settings.
3. Run the unit suite: `xcodebuild test -scheme OakApp -only-testing:OakAppTests -destination 'platform=iOS Simulator,name=iPhone 17'`.
4. Archive, export, and upload — **no fastlane and no App Store Connect API key needed.** Xcode's already-authenticated local account (Xcode → Settings → Accounts) is enough, provided it has App Manager/Admin access on the team; `-allowProvisioningUpdates` lets `xcodebuild` mint/renew the Apple Distribution certificate and provisioning profile on the fly, so having only an "Apple Development" identity in the keychain beforehand is fine.

```bash
cd ios
xcodebuild -scheme OakApp -configuration Release archive \
  -archivePath build/OakApp.xcarchive \
  -destination 'generic/platform=iOS' \
  DEVELOPMENT_TEAM=<team id> \
  -allowProvisioningUpdates

xcodebuild -exportArchive \
  -archivePath build/OakApp.xcarchive \
  -exportOptionsPlist build/ExportOptions.plist \
  -exportPath build/export \
  -allowProvisioningUpdates
```

`build/ExportOptions.plist` (create once — `ios/build/` is gitignored):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>teamID</key>
    <string><TEAM ID></string>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>destination</key>
    <string>upload</string>
</dict>
</plist>
```

`destination: upload` makes `-exportArchive` upload straight to App Store Connect in the same step — there's no separate `altool`/`xcrun` upload command to run. Find `<TEAM ID>` (a 10-char alphanumeric, e.g. `6HXCPT677B`) via `security find-certificate -c "Apple Development: <your name>" -p | openssl x509 -noout -subject` (the `OU=` field), or Xcode → Settings → Accounts → select the team. The build appears in App Store Connect → TestFlight after Apple finishes processing it (a few minutes) — no manual "distribute" step required once `destination: upload` is set.

## Android app

The native client lives in **`android/`** (Kotlin 2.1 / Jetpack Compose, single `:app`
Gradle module, package `ai.gowtam.oak`, minSdk 26 / target 36; the Gradle 8.13 wrapper is
committed — no system Gradle, no project-generation step. See `android/README.md` for the
full build/test walkthrough).

- **Parity rule.** Android mirrors the web/iOS feature set exactly (chat, answer card,
  artifact viewer, auth OTP, account deletion, history, teams, Teams Assistant, the
  six-scope model, guest + signed-in, image input) — it is a structural, class-for-class
  port of `ios/OakApp/`, not an independent design. The wire contract it speaks is the
  same one iOS speaks, derived from the **portable web modules** listed above
  (`src/lib/sse/sse-types.ts`, `src/agent/schemas.ts`, `src/data/teams/team-schema.ts`,
  `src/data/formats.ts`); no backend changes were needed for Android (the account-deletion
  and Bearer-auth enablers already shipped for iOS). Requirements/architecture:
  `docs/features/android-app/`.
- **Build/test commands** (from `android/`, `JAVA_HOME` exported, `--no-daemon`
  recommended — the Gradle daemon hangs in sandboxed shells):

  ```bash
  cd android
  export JAVA_HOME=/opt/homebrew/opt/openjdk@17

  ./gradlew --no-daemon :app:compileDebugKotlin          # typecheck-equivalent
  ./gradlew --no-daemon :app:testDebugUnitTest            # JVM unit suite (337 tests, no emulator)
  ./gradlew --no-daemon :app:lint
  ./gradlew --no-daemon :app:assembleDebug                # or :app:assembleRelease (R8-minified, debug-keystore signed)
  ```

- **Instrumentation** (`:app:connectedDebugAndroidTest`, 16 tests) needs a booted AVD —
  boot the committed `OakPixel` (Pixel 7, android-35) config headless before running:

  ```bash
  ~/Library/Android/sdk/emulator/emulator -avd OakPixel \
    -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect &
  ~/Library/Android/sdk/platform-tools/adb wait-for-device
  ./gradlew --no-daemon :app:connectedDebugAndroidTest
  ```

- **BASE_URL** is a `BuildConfig` field pointed at production (`https://oak-gowtam.fly.dev`)
  for both build types — no dedicated staging Fly app exists yet (same gap as iOS).
- **Not in v1:** no admin-panel access, no Play Store listing/signing (debug-keystore
  signed release APK only — see `android/README.md` and
  `docs/features/android-app/architecture/deployment.md` for what's deferred).

## TestFlight feedback tracking

TestFlight beta feedback (screenshots + crashes) is tracked in
`docs/testflight-feedback/ledger.md`, one entry per App Store Connect
submission ID, with downloaded assets alongside it under
`docs/testflight-feedback/assets/<submission-id>/`. Pull in new feedback with
`node ios/scripts/asc-feedback.mjs` (needs the `APP_STORE_CONNECT_API_KEY_*`
env vars set; see the script header). It's idempotent — existing entries are
never modified or re-downloaded.

A commit that fixes a feedback item **must** flip that item's ledger row to
`fixed (<commit>, build N)` in the same commit. Run the sync script promptly
when new feedback arrives — ASC's screenshot/crash-log asset URLs expire
(~30 days), so unsynced feedback loses its assets permanently.
