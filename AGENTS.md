# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

Oak is a web chat agent that **coaches Pokémon Champions** for the **current
regulation**. It answers natural-language questions about the Champions roster
(filters, lookups, mechanics reasoning, battle math, live usage, Stat Points,
Mega Evolution). It is **not** a whole-franchise or multi-generation assistant:
other games (mainline titles, National Dex, Mystery Dungeon, catch locations)
and franchise media (anime, movies/films, TV, manga) are out of scope and
gracefully declined. Off-roster names are declined by **naming the entity and
saying it is not in the Champions roster**, with no other-game facts. Its
defining trait is that it **reasons on top of data**: tools supply raw facts
(move priority, ability effect text, type charts, base stats, live usage) and
the agent deduces how they interact. Every answer carries reasoning, cited
sources, explicit inference/uncertainty flags, and that it is based on
Champions.

It is usable as a **guest** (in-memory, per-session) and supports optional
**email/OTP accounts** that unlock durable chat history and the team builder
(see `docs/features/`). It is not a single-tenant app — auth, conversations,
and teams are all account-scoped.

The agent's internals (topology, original T1–T11 tools, prompts, the
`OakAnswer` output schema, eval spec) were **fixed by design** in
`docs/agent-design/`. Feature tools were appended after that contract. Then
**Champions-first (ADR-2)** **removed** T14 `get_encounters`, T18 `run_sql`,
T19 `search_wiki`, and T21 `get_meta_usage` from the model list and **accepted
a new prompt-cache prefix** — the historical append-only barrel rule does not
apply to that cut. Remaining tools, in architecture order: `resolve_entity`,
`query_pokedex`, `get_pokemon`, `get_move`, `get_ability`,
`get_type_matchups`, `get_evolution_chain`, `get_item`, `compute_stat`,
`estimate_damage`, `submit_answer`, `get_team`, `save_team`,
`get_usage_stats` (T15, live Champions usage), `list_teams`, `get_learnset`,
`lookup_box` — **17 tools** total. Dispatch of a hallucinated old name returns
`{ error: "unknown_tool" }`. (T20 `web_search` was already removed 2026-07-03.)
The surrounding system is specified in `docs/architecture/design.md`. Current
product requirements win from `docs/features/champions-first/`. When agent
internals and the architecture doc disagree, champions-first + this file win
on product identity; agent-design still describes historical tool contracts
except where ADR-2 superseded them; the architecture doc wins on
stack/storage/layout unless code disagrees.

> `README.md` is current and accurate — it tracks the implemented app. The
> architecture doc and older agent-design pages predate the `@pkmn`/Postgres
> move, multi-user accounts, and the Champions-first cut. Where docs disagree,
> trust the code, then `README.md`/`AGENTS.md`.

## Git workflow

Multiple agents work on this repo in parallel, so **`develop` is the shared
integration branch** — every agent's work lands there, never `main` (unless the
user explicitly asks for a `main` commit/release).

To avoid agents stepping on each other's uncommitted changes, **each agent must
create its own git worktree off `develop` before starting any work**, rather
than editing directly in a shared checkout:

```bash
git worktree add ../oak-<task> -b agent/<task> develop
```

Do all edits and commits inside that worktree, on its own branch. **Only once
the work is complete and verified** (the relevant `typecheck`/`lint`/`test`
commands passing per the Commands section) does the agent merge its branch back
into `develop`:

```bash
git checkout develop && git pull
git merge agent/<task>
git worktree remove ../oak-<task>
git branch -d agent/<task>
```

Never commit straight to a shared `develop` working copy while other agents may
also be active in it — always go through a worktree, and never leave finished
work stranded on an agent branch instead of merged into `develop`.

## Cross-platform bug fixes (web + iOS + Android)

Oak ships **three clients** that share one product surface: **`web/`**,
**`ios/`**, and **`android/`**. The natives are pure clients of the same
HTTP/SSE API and deliberately mirror web/iOS feature and UI behavior (answer
card, markdown, chat, teams, etc.).

**When a bug is reported or fixed on any one platform, check the other two and
fix them in the same change (or an immediately follow-up commit in the same
PR/branch) unless the defect is demonstrably platform-specific.**

- Do **not** stop after fixing only the platform where the bug was noticed. A
  web-only UI fix that leaves the same layout bug on iOS/Android (or the reverse)
  is incomplete.
- Before marking the work done, explicitly ask: *Does this bug class exist on
  web, iOS, and Android?* Map the analogous code (e.g. GFM table styling: `web`
  `Markdown`/`globals.css` ↔ `ios` `MarkdownBlockView` ↔ `android`
  `MarkdownBlockView`) and either fix all affected surfaces or document in the
  commit why a platform is exempt (true platform-only constraint, not “didn’t
  look”).
- Client UI/UX bugs, answer-card rendering, markdown presentation, chat chrome,
  and teams UX almost always need the three-way pass. Server-only / API / agent /
  DB bugs usually live once in `web/` and need no mobile code change — still
  confirm the clients don’t reimplement the bad behavior locally.
- Prefer one worktree/branch that lands all three platforms together so users
  never get a staggered half-fix.

This exists because a full-width blank GFM-table chrome bug was fixed on web
first and only later on mobile after a separate screenshot — the other platforms
should have been checked in the first pass.

## Repository layout

The app lives in **`web/`** — the Next.js app plus all of its config
(`package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`,
`drizzle.config.ts`), `src/`, `test/`, `eval/`, `drizzle/`, `scripts/`, and
deployment files (`Dockerfile*`, `docker-compose.dev.yml`, `fly.toml`,
`migrate.mjs`). The native mobile clients live in sibling folders: **`ios/`**
(Swift 6 / SwiftUI) and **`android/`** (Kotlin 2.1 / Jetpack Compose) — both
pure clients of `web/`'s HTTP/SSE API, holding no LLM keys or DB access of
their own. Only `docs/`, `README.md`, `AGENTS.md`, `ios/`, `android/`, and
`.git/` stay at the repo root. **All `src/…`, `test/…`, `eval/…`, and
`drizzle/` paths in this document are relative to `web/`**, and the `@/` alias
resolves to `web/src/`.

## Commands

Run every command below from **`web/`** (`cd web` first) — that's where
`package.json` lives. Deploy with `cd web && fly deploy`. The Redis state tier
(see Architecture below) is a separate Fly app, deployed from its own
directory: `cd web/deploy/redis && fly deploy -a oak-gowtam-redis`.

```bash
npm run dev          # next dev (local)
npm run build        # next build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint .
npm test             # vitest run (unit + integration + deterministic eval subset) — NEEDS Docker (Testcontainers Postgres)
npm run db:migrate   # tsx src/data/migrate.ts — apply Drizzle migrations to $DATABASE_URL
npm run ingest       # tsx src/ingest/run.ts — (re)build the Champions Postgres index from @pkmn (runs migrations first)
npm run eval         # tsx eval/run.ts — full LLM-judge golden suite (live model)
```

Run a single test file or test:

```bash
npx vitest run src/agent/formulas/compute-stat.test.ts   # one file
npx vitest run -t "Garchomp Speed"                        # by test-name pattern
npx vitest run --project node                             # only the node project
```

Ingest and eval modes are flag-driven:

```bash
npm run ingest -- --formats=champions   # default; DEFAULT_FORMATS is Champions-only
tsx eval/run.ts --deterministic         # offline CI subset (mocked model, fixture DB)
tsx eval/run.ts --rebuild               # post-ingest regression set (G1/G5/G6/G7/G25)
tsx eval/run.ts --case=G4,G11           # specific golden cases
```

`npm run sync:meta` is **retired** (Smogon OU is not a product integration).
Wiki / national-dex / encounter fetch CLIs are not part of ingest.

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

Node 20+ is required (`.nvmrc`). `typecheck`, `lint`, and the jsdom component
tests run with no Docker; **`npm test` (the node project) needs a running
Docker daemon** — Testcontainers spins up an ephemeral `postgres:16` for the
run. The full judged `eval` needs **both** a real `XAI_API_KEY` (the agent runs
on Grok) and a real `ANTHROPIC_API_KEY` (the judge runs on Claude). `@pkmn` is
a local package, so `ingest` never hits the network (but it does need a
reachable Postgres via `DATABASE_URL`). Live Champions usage (T15) is the
request-time network read — not a DB writer.

## Architecture

A single **TypeScript / Next.js (App Router) monolith**, rooted at `web/` (see
Repository layout). One language across frontend, API, agent loop, and the
ingest CLI. TS `strict`, ESM, path alias `@/` → `src/` (i.e. `web/src/` from
the repo root). Files kebab-case; types/components PascalCase; DB columns
snake_case (Drizzle maps to camelCase).

### Request flow

```
POST /api/chat (SSE)  →  runOak (tool-loop)  →  17 tools  →  repos  →  Postgres
   src/app/api/chat/route.ts      src/agent/runtime.ts   src/agent/tools/   src/data/repos/   node-postgres @ $DATABASE_URL
```

- **`route.ts`** validates the body `{ session_id, message, scope_seed?,
  champions_mode? (ignored), images? }`, applies the input-length cap +
  per-session rate limit *before* opening the stream, and **always** binds
  `ctx.mode = "champions"`. `scope_seed`, `detect-scope`,
  `account.last_used_scope`, and the deprecated `champions_mode` boolean do
  **not** route the turn to another game. SSE `scope` is always Champions. The
  runtime is **dynamically imported** inside the request so `next build`
  doesn't evaluate `env` (which throws on a missing API key) at build time.
  `runtime = "nodejs"`, `dynamic = "force-dynamic"`.
- **Background turns (durable turns).** A chat turn is a **first-class server
  object**, not a property of the SSE connection: the route registers it in the
  in-process **turn store** (`src/server/turn-store.ts`, `globalThis`-memoized;
  concurrency caps 1/conversation → 409 `turn_in_progress` w/ `turn_id`, 3/owner
  → 429, 64 global → 503) and detaches **`runTurn`** (`src/server/run-turn.ts`),
  whose only aborter is the turn's own `AbortController` — a client disconnect
  **never** cancels generation. Persistence (`appendTurnPair`/guest `appendTurn`
  + `recordTurn`) runs **unconditionally on completion, before** the terminal
  `answer` publishes. Clients reattach via `GET /api/chat/turns/:id/stream`.
  Stop is `POST /api/chat/turns/:id/stop` (stopped turns are discarded). Turns
  do NOT survive a process restart (accepted — single always-on Fly machine).
- **Image input (vision).** A turn can attach ≤4 images. `validateImages`
  (`src/server/image-upload.ts`) runs before the stream opens. Images bind onto
  **`AgentContext.images`** and are **consume-on-turn** — never stored in
  history. Interpreted as Champions (stats screen, team sheet). All three
  models are vision-capable.
- **`runtime.ts`** drives one **provider-agnostic** tool-loop turn. The
  default/primary model is **Grok 4.6**. It assembles a byte-stable,
  prompt-cached prefix (Champions system + few-shot + 17 tool defs), appends
  history + message, loops ≤ `MAX_ITERATIONS` (10), and validates the
  `submit_answer` payload against the `OakAnswer` Zod schema. It **never throws
  for in-domain failures**.
- **Tools** (`src/agent/tools/`, 17 remaining — ADR-2) wrap repos + formulas
  and return the exact structured shapes the model reasons about. They **never
  throw in-domain**. `index.ts` is the barrel exporting `tools` and `dispatch`.
  Voice excludes only `submit_answer` (`VOICE_EXCLUDED_TOOLS`).

### Data layer — built from `@pkmn`, not PokeAPI

The design's throttled PokeAPI crawler was **replaced by the `@pkmn`
ecosystem**. All index data is built offline from local npm packages.

- **`src/data/pkmn/gen-provider.ts`** is the *single* `@pkmn` integration point.
- **Ingest** (`src/ingest/run.ts`) builds **Champions only**
  (`DEFAULT_FORMATS = ["champions"]`), then replaces each table in one async
  transaction. Idempotent. It runs under `tsx` as its own process, opens its
  **own** `pg.Pool` over `DATABASE_URL`, and applies migrations before writing.
- **Postgres via Drizzle + node-postgres** (`src/data/schema.ts`,
  `src/data/db.ts`). `db.ts` is `server-only` and memoizes one `pg.Pool` +
  Drizzle handle on `globalThis`. Migrations are **not** run on connect —
  apply them out-of-band via `npm run db:migrate` (or the ingest CLI).
  Champions-first dropped `wiki_page`/`wiki_chunk`, `natdex_*`,
  `classic_encounters`, `pmd_recruits`, `meta_snapshot`/`meta_usage`. Do not
  resurrect them.
- **Repos** (`src/data/repos/`) are the *sole* Postgres readers, and they are
  **async**. The agent runtime knows only the tool layer.

### State tier — guest sessions, rate limiter, OTP throttle, turn store

Three modules hold state outside Postgres, each **dual-backend** via
`src/server/redis.ts` (`getRedisClient()`, reading `process.env.REDIS_URL` at
call time): `REDIS_URL` unset ⇒ in-process (`BoundedStore`); set ⇒ Redis. Failure
policies: guest session store **fail-soft**; rate limiter **fail-open**; OTP
throttle **fail-CLOSED**. The **turn store** is in-process only
(`globalThis`-memoized), with a fail-soft Redis terminal-snapshot mirror.
Production runs a small self-run Fly Redis machine (`web/deploy/redis/`).

### Formats & scope (Champions runtime; historical union for storage)

`src/data/formats.ts` still exports the full historical `Format` union so
archived teams and old conversations decode (`isFormat("gen-7")` etc.) —
**ADR-3**. `DEFAULT_FORMATS`, ingest, `AgentContext.mode` for new turns, Dex,
calc, living teams, and the header chip are **Champions only**. A living team
is `team.format === "champions"`; an archived team is
`team.format !== "champions"` (no extra column).

There is **no eleven-scope chip** and **no National Dex default**. The header
control is a display-only **regulation chip** (`ScopeChip.tsx` — shows
`CHAMPIONS_REGULATION`, not a format menu). `detect-scope` is not used to
route turns. `scope_seed` from old clients is ignored.

### Models & providers (Grok primary)

The agent loop is **provider-agnostic** behind the `LLMProvider` seam
(`src/agent/providers/`). The registry is **per-model**:
`ModelKey = "grok-4.6" | "grok-4.5" | "grok-4.3" | "claude-sonnet-5" |
"claude-sonnet-4.6" | "gpt-5.5"`. `DEFAULT_MODEL_KEY = "grok-4.6"`. The active
model is operator-controlled via `/admin/settings` (`app_setting` key
`"active_model"`), fail-soft to Grok 4.6. Any `model` field in the request body
is ignored.

**ONE canonical Champions prompt body** (`prompts/domain.ts`).
`domainForMode` ignores mode and always returns the Champions prefix (Stat
Points, Mega-only, T15, decline copy **not in the Champions roster**). No
warehouse DDL, no wiki/SQL/OU routing. Style wrappers stay thin
(`style-claude.ts` / `style-grok.ts` pass-through; `style-openai.ts` adds
contract segments).

### Voice mode (real-time spoken chat, signed-in only)

Real-time spoken conversation via `POST /api/voice/*` (`token`, `tool`,
`transcript`). The browser connects **directly** to xAI's Grok Voice Agent
realtime API. The **`grok-voice` model is its own brain**; it calls Oak's
existing tool layer minus `submit_answer` (T18/T19 no longer exist to exclude).
`src/agent/prompts/voice.ts` is its own prompt surface with the same Champions
decline. Signed-in only for v1.

### Admin panel

Private `/admin` route group + `/api/admin/*`. Gating: `ADMIN_EMAILS` at call
time; unset ⇒ zero admins. Recording: `turn_record` + `auth_event`,
non-blocking. Settings tab upserts `app_setting`. Cost is an estimate. Charts
are hand-rolled SVG. See `docs/features/admin-panel/`.

### Key conventions

- **Zod is the single source of truth** (`src/agent/schemas.ts`).
- **Remaining tool names and output field names are a contract.** Don't rename
  them. Removed tools stay unnamed in the barrel (ADR-2).
- **Error styles split at the runtime/route seam:** Result unions in
  tool+data; try/catch at the HTTP edge.
- **Frontend** (`src/components/`) renders a `OakAnswer` field-by-field
  (`AnswerCard` tree). Component tests must **never** import db/repos/runtime.

### Portable modules (mobile-readiness)

Pure, platform-agnostic modules a JS client could reuse:

- `src/agent/schemas.ts`
- `src/agent/formulas/*`
- `src/lib/sse/sse-types.ts`
- `src/data/teams/team-schema.ts`
- `src/data/formats.ts` — historical union + Champions defaults
- `src/agent/models.ts`

Everything else stays behind the API.

## Testing

Vitest with two projects (`vitest.config.ts`): a **node** project and a
**jsdom** project. Dummy `XAI_API_KEY` / `ANTHROPIC_API_KEY` are injected so
`src/env.ts` imports succeed. Test-file infixes: `*.oracle.test.ts`,
`*.integration.test.ts`, `*.fullstack.test.tsx`.

The **node project** starts ONE Postgres container per run via Testcontainers
`globalSetup` and (since the state-tier dual-backend) Redis as well. Each DB
test carves an isolated **schema** via `createPgSchema({ seed })`. Seeds:
`seed: "tools"`, `seed: "eval"` (Champions partition), `seed: "none"`. Tests
that exercise `resolve_entity` must `installAsSingleton()`. The **jsdom
project has no globalSetup**.

Eval goldens (`web/eval/cases.ts`) are Champions-only: Stat Points, T15, Mega,
off-roster decline. Wiki/SQL/OU/G55-fallback cases are dropped. The
deterministic subset lives in `eval/deterministic.ts` (no `RunSqlRows`).

## Gotchas (learned the hard way)

- **Dev runs in Docker; host `npm install` doesn't reach the container.** After
  adding a dependency, refresh the anonymous `node_modules` volume.
- **`npm test` needs a Docker daemon** (Testcontainers Postgres **and** Redis
  for the node project). `typecheck`, `lint`, and `npm run test:components`
  (jsdom) run without Docker.
- **Migrate + re-ingest after any schema change.** Migrations are no longer
  applied on connect. Run `npm run db:migrate` then `npm run ingest` (or
  `npm run docker:ingest`). Ingest default is Champions; a stale/empty DB
  reads as `index_unavailable`.
- **`resolve_entity` (resolve-index) reads the `@/data/db` singleton, not
  `ctx.db`.** Tests that exercise resolution must `installAsSingleton(fix)`.
- **Don't force `tool_choice` while thinking is on.** Thinking + a forced
  `tool_choice` is a hard 400 on Sonnet 4.6. The loop uses `tool_choice:
  "auto"` + adaptive thinking.
- **The native Grok provider speaks xAI's Responses API, not Chat Completions.**
  Tools use the flattened Responses shape; `reasoning:{effort:"low"}` is set
  explicitly; mid-turn tool rounds are stateful by default (`store:true` +
  `previous_response_id`). When sending `previous_response_id`, **omit
  `instructions`** (xAI 400s otherwise) but **still send `tools` +
  `tool_choice: "auto"`**.
- **`env` is validated at module load and throws on a missing `XAI_API_KEY`.**
  That's why the route dynamically imports the runtime.
- **ADR-2 new prompt-cache prefix.** Do not re-add T14/T18/T19/T21 to keep
  "append-only" bytes. The cache miss after deploy is accepted.

## iOS app (TestFlight releases)

The native client lives in **`ios/`** (Swift 6 / SwiftUI; `OakApp.xcodeproj` is
gitignored and generated from `ios/project.yml` via `xcodegen generate` — see
`ios/README.md`). **Usage is a fifth tab** (Chat / Teams / Usage / Dex /
Settings) per ADR-6; Calc stays a cover. The regulation chip is display-only.

To ship a new TestFlight build:

1. Bump `CURRENT_PROJECT_VERSION` in `ios/project.yml` — App Store Connect
   rejects a reused build number for the same `MARKETING_VERSION`.
2. `cd ios && xcodegen generate` to regenerate the project from the new
   settings.
3. Run the unit suite: `xcodebuild test -scheme OakApp -only-testing:OakAppTests -destination 'platform=iOS Simulator,name=iPhone 17'`.
4. Archive, export, and upload — **no fastlane and no App Store Connect API key
   needed.** Xcode's already-authenticated local account is enough, provided it
   has App Manager/Admin access on the team; `-allowProvisioningUpdates` lets
   `xcodebuild` mint/renew the Apple Distribution certificate and provisioning
   profile on the fly.

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

`destination: upload` makes `-exportArchive` upload straight to App Store
Connect in the same step. Find `<TEAM ID>` via
`security find-certificate -c "Apple Development: <your name>" -p | openssl x509 -noout -subject`
(the `OU=` field), or Xcode → Settings → Accounts → select the team.

App Store listing copy: `docs/app-store/ios.md` (Champions coach, CF-INT-BR-10).

## Android app

The native client lives in **`android/`** (Kotlin 2.1 / Jetpack Compose, single
`:app` Gradle module, package `ai.gowtam.oak`, minSdk 26 / target 36; the
Gradle 8.13 wrapper is committed — see `android/README.md`).

- **Parity rule.** Android mirrors the web/iOS feature set (chat, answer card,
  artifact viewer, auth OTP, account deletion, history, teams, Teams Assistant,
  guest + signed-in, image input) as a structural port of `ios/OakApp/`.
  **Usage is a first-class Dex section** (alongside Pokémon / Moves / Abilities
  / Items), not a sixth bottom tab (ADR-6). Same API and screen contents as iOS
  Usage. Do not add an Android Voice mic here (CF-UI-BR-5).
- **Build/test commands** (from `android/`, `JAVA_HOME` exported, `--no-daemon`
  recommended — the Gradle daemon hangs in sandboxed shells):

  ```bash
  cd android
  export JAVA_HOME=/opt/homebrew/opt/openjdk@17

  ./gradlew --no-daemon :app:compileDebugKotlin
  ./gradlew --no-daemon :app:testDebugUnitTest
  ./gradlew --no-daemon :app:lint
  ./gradlew --no-daemon :app:assembleDebug
  ```

- **BASE_URL** is a `BuildConfig` field pointed at production
  (`https://oak-gowtam.fly.dev`) for both build types.
- **Not in v1:** no admin-panel access, no Play Store listing/signing
  (debug-keystore signed release APK only).

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
