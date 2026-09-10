# Backlog

Forward-looking work not yet specified — or specified and waiting to be built.
Items here are **candidates**, not commitments; each still-open item needs a
requirements pass before it moves into a design doc.

Oak is a **multi-user Pokémon Champions coach** for the current regulation:
optional email-OTP accounts, durable signed-in history, living Champions teams,
artifact viewer, `/calc`, vision, voice, live usage, background turns. Guests
are in-memory per session. It is **not** a whole-franchise or multi-generation
assistant.

> Append new items; don't renumber existing ones. IDs are stable.
>
> Closed items keep a short status plus a pointer to the spec or the code.
> Resolved open questions are not restated as if they were still open.
>
> **Champions-first (2026-09):** whole-games items — National Dex default,
> eleven-scope, wiki / Mystery Dungeon / catch locations, `run_sql` warehouse,
> Smogon `/meta` + `sync:meta`, Gens 1–4 as a product mode — are **superseded**
> by `docs/features/champions-first/`. Do not treat them as current product.
>
> Broader idea catalog: `docs/product-ideas.md`. Many bullets there predate
> Champions-first; do not treat whole-games or eleven-scope ideas as current.

---

## Status register

| ID | Item | Status |
|---|---|---|
| B-1 | Account creation | **COMPLETE** |
| B-2 | Team building | **COMPLETE** |
| B-3 | Chat history | **COMPLETE** |
| B-4 | Artifact viewer | **COMPLETE** (later expanded by answer-cards-and-artifacts) |
| B-5 | Competitive battling page | **SUPERSEDED** (Champions-first). Layer 4 lives on as B-21 |
| B-6 | Clickable sources | **COMPLETE** (absorbed into B-4) |
| B-7 | Rename to Oak | **COMPLETE** (Phase 1). Phase 2 not pursued |
| B-8 | Image upload | **COMPLETE**. Images stay consume-on-turn |
| B-9 | Make Grok native | **COMPLETE**. Primary is Grok 4.6 |
| B-10 | Generations 1–4 support | **SUPERSEDED** (Champions-first) |
| B-11 | LLM classifier fallback for scope | **SUPERSEDED** (Champions-first) |
| B-12 | Per-generation encounter filtering | **SUPERSEDED** (Champions-first) |
| B-13 | Fix illegal proposed teams | **COMPLETE** |
| B-14 | Champions learnset completeness | **COMPLETE** — intended curation, not an ingest gap |
| B-15 | Voice flag on admin conversations | **OPEN** |
| B-16 | Interactive damage calculator | **COMPLETE** (`/calc`, three clients) |
| B-17 | Team analysis dashboard | **COMPLETE**. Residual: weather / terrain / dynamic items |
| B-18 | Showdown replay analysis | **OPEN** |
| B-19 | Shareable answers | **COMPLETE** (chat-qol) |
| B-20 | Playthrough companion / catch tracker | **SUPERSEDED** (Champions-first) |
| B-21 | Live competitive battle UI | **OPEN** |
| B-22 | Admin cost-sorting oracle tests | **COMPLETE** |
| B-23 | Prompt audit | **COMPLETE** (Champions-only prefix tightened in `6d89405`) |
| B-24 | Production email sender identity | **OPEN** (was a B-1 deferral) |
| B-25 | Account data export | **OPEN** (was a B-1 deferral; deletion already shipped) |
| B-26 | `turn_record` retention + stop dual-storing `OakAnswer` | **OPEN** |

Shipped in later feature packs, not given B-IDs: chat QoL (retry / edit / undo,
human copy, share, export, pin, fork, folders, `@mention`, command palette),
answer-card verbs (add-to-team, open in calc / Dex, compare, compact/full),
box-from-paste (`lookup_box`), spend controls, iOS and Android clients.

---

## Currently open

1. **B-15** — persist a voice signal on conversations and surface it in the
   admin conversations list (and, if cheap, a Voice filter in user history).
2. **B-17 residual** — model weather, terrain, and a larger dynamic-item table
   in team analysis. Champions threats already correctly come from live T15
   usage; that is not a leftover of the retired Smogon ladder.
3. **B-18** — Showdown replay analysis (paste a log or URL; reason over a
   parsed timeline).
4. **B-21** — live competitive battle co-pilot. Research:
   `docs/research/live-competitive-battle-ui.md`.
5. **B-24** — verified Resend domain + `EMAIL_FROM` so OTP mail delivers to
   real users, not only the operator.
6. **B-25** — signed-in data export (profile, conversations, teams). Account
   deletion already exists.
7. **B-26** — prune / strip unbounded `turn_record` blobs; stop storing the
   full `OakAnswer` twice. The Champions index is not the disk problem.

---

## B-1 — Account creation

> **Status: COMPLETE** — specified and implemented as **Account Creation
> (Email + OTP Auth)**. See
> `docs/features/account-creation/requirements/requirements.md` and
> `docs/features/account-creation/architecture/design.md`. Passwordless
> email-OTP, retained anonymous guest mode, DB-backed opaque cookie sessions
> (~30-day, per-device, revocable on sign-out), per-account data isolation,
> tiered chat rate limits (per-account signed-in, per-IP guests). Auth is
> orthogonal to the conversation `session_id`. Account deletion later shipped
> on web + iOS + Android (App Store / Play requirement). Guest sessions, the
> OTP throttle, and the rate limiter are dual-backend (in-process, or Redis
> when `REDIS_URL` is set).
>
> Leftovers split out so this item can close: **B-24** (production email
> sender), **B-25** (GDPR-style data export).

**Original why (history):** persist anything per-person (teams, chat history)
first required a notion of "who." This was the prerequisite for B-2 and B-3.

---

## B-2 — Team building

> **Status: COMPLETE** — implemented per
> `docs/features/team-builder/architecture/design.md` from
> `docs/features/team-builder/requirements/requirements.md`. Saved-team data
> model (one row + JSON `members`, per-account + format-bound), Teams page
> manual builder, warn-but-allow validation, Showdown paste import/export,
> `/api/teams/*`. The agent **proposes** via `proposed_team`; the user
> applies; the agent never writes a team (BR-T8). Read tools are `get_team`,
> `save_team`, `list_teams`.
>
> **Champions-first:** a living team is `format === "champions"` (Stat Points,
> no Tera, level 50). Other-format teams are archived, not living. Box paste
> later added `lookup_box`.

**Original why (history):** the agent could reason about teams but not save
one.

---

## B-3 — Chat history

> **Status: COMPLETE** — implemented per
> `docs/features/chat-history/architecture/design.md`. Tables `conversation`
> and `conversation_message` scoped by `account_id`; the client `session_id`
> is the conversation id; signed-in turns persist the full `OakAnswer`; guests
> stay ephemeral; guest→sign-in bulk-imports the on-screen thread. Chat QoL
> later added share, export, pin-a-turn, fork, folders, archive, and bulk
> actions (`docs/features/chat-qol/`).

**Original why (history):** history was in-memory only and evaporated on
restart.

---

## B-4 — Artifact viewer

> **Status: COMPLETE** — specified at
> `docs/features/artifact-viewer/requirements/requirements.md` and
> implemented (`GET /api/entity`, docked panel / mobile overlay, mini-browser
> back-stack, fresh index read on click). **B-6** (clickable sources) shipped
> as part of this: Sources entries open the cited entity with the datum in
> context.
>
> Later expanded by **answer-cards-and-artifacts**
> (`docs/features/answer-cards-and-artifacts/`, build COMPLETE): add-to-team,
> open-in-calc / Dex, compare, citation highlights, compact/full, voice origin
> glyph, pin strip. Artifacts remain session-scoped except where that pack
> added account pins.

**Original why (history):** some answers are richer than a chat bubble (team
sheet, calc, type grid, comparison) and used to scroll away.

---

## B-5 — Competitive battling page

> **Status: SUPERSEDED (Champions-first)** — Smogon OU `/meta`,
> `get_meta_usage` (T21), and `sync:meta` are retired. Live Champions usage is
> T15 `get_usage_stats` plus public `/usage` (ADR-5). `/meta` redirects to
> `/usage`.
>
> Layers 1–3 (stored Smogon snapshots, `/meta` pages, T21) did ship and were
> then cut. **Layer 4 — the live battle co-pilot — remains B-21.**

**Original why (history):** Oak had no metagame surface; `@pkmn` ingest
carries no usage stats.

---

## B-6 — Clickable sources → source-detail artifact

> **Status: COMPLETE** — absorbed into B-4 (AV-US-3). Sources are clickable
> in-app; the richer detail is a fresh index read for a full profile, not an
> enriched citation payload. External `↗` links remain alongside.

---

## B-7 — Rename "Oak" → "Oak"

> **Status: COMPLETE (Phase 1)** — the product identity is Oak (Professor Oak)
> everywhere a person sees it: UI copy, metadata, prompts, README, App Store
> listing. **Phase 2** (rename internal identifiers such as `OakAnswer` /
> `runOak`) was optional and is **not pursued** — those names are
> model-visible contract (`submit_answer` JSON Schema) and must stay.

---

## B-8 — Image upload

> **Status: COMPLETE** — up to 4 images per turn on `POST /api/chat`,
> validated before the stream opens (`src/server/image-upload.ts`), bound onto
> `AgentContext.images`, consume-on-turn (never stored in history).
> Interpreted as Champions (stats screen, team sheet). Web, iOS, and Android.
>
> **Not in this item:** persisting attached images on signed-in resume. That
> was explicitly out of scope for chat-qol and remains a product-ideas
> candidate, not a hole in B-8.

---

## B-9 — Make Grok native

> **Status: COMPLETE** — dedicated adapter
> (`src/agent/providers/grok-provider.ts`) on xAI's Responses API. Primary
> model is **Grok 4.6** (`DEFAULT_MODEL_KEY`); Grok 4.5 / 4.3 remain
> admin-selectable with Claude Sonnet 5 / 4.6 and GPT-5.5. Operator-controlled
> via `/admin/settings` (`app_setting` key `"active_model"`), fail-soft to
> Grok 4.6. Any `model` field on the request body is ignored.
>
> Follow-ups that also shipped: mid-turn Responses chaining
> (`store:true` + `previous_response_id`; omit `instructions` when chaining
> but keep `tools` + `tool_choice: "auto"`), client memoization,
> `cached_input_tokens` on turn traces.

---

## B-10 — Generations 1–4 support

> **Status: SUPERSEDED (Champions-first)** — other generations are not a
> product mode. Off-roster / other-game questions are declined by naming the
> entity and saying it is not in the Champions roster.

---

## B-11 — LLM classifier fallback for ambiguous scope signals

> **Status: SUPERSEDED (Champions-first)** — every new turn is Champions.
> `detect-scope` is not used to route.

---

## B-12 — Per-generation encounter (catch-location) filtering

> **Status: SUPERSEDED (Champions-first)** — `get_encounters` and encounter
> tables are removed; catch-location questions are declined. (A pre-cut
> annotate-and-foreground pass had shipped on T14; that tool is gone.)

---

## B-13 — Fix illegal proposed teams

> **Status: COMPLETE** — runtime salvage of the last schema-valid team at
> give-up; T17 `get_learnset` so the agent can check before proposing;
> self-healing rejection feedback with the legal move list; team-build
> playbook in the Champions prompt; `validateTeam` still warn-but-allow on
> save. The agent still only proposes (BR-T8).

---

## B-14 — Verify Champions learnset completeness (level-up moves missing?)

> **Status: COMPLETE** — investigated while fixing B-13. The Champions
> `learnset` table is ~99.9% `machine`-method because **Pokémon Champions
> curates/restricts movesets**, not because ingest drops level-up sources.
> Probed `@pkmn/mods/champions` directly (e.g. Incineroar lacks Knock Off /
> U-turn in the mod, matching the index). Prompts and `get_learnset` already
> steer the agent to verify against the index rather than VGC memory.

---

## B-15 — Track whether a conversation used voice mode (admin conversations list)

> **Status: OPEN**

**Why:** The admin conversations browser cannot tell which conversations
included a voice turn. `/api/voice/transcript` writes through the same
`appendTurnPair` path as text chat, with no channel/source argument, so a
voice-originated message row is indistinguishable from a text-chat row.
Voice routes also do not call `recordTurn`, so `turn_record` has no per-turn
voice signal either. Answer cards can stamp `origin: "voice"` (mic glyph on
the card); that does not give the admin list a filterable column.

**Scope:**
- Add a `used_voice` (or similar) column on `conversation`, set when
  `appendTurnPair` is invoked from the voice transcript route — the admin
  list already reads `conversation` via `listAllConversations()`.
- Decide granularity: per-conversation (fits the current admin table) vs.
  per-turn (`source` on `conversation_message`) if the panel later wants to
  mark spoken turns inside a thread.
- Surface it on `ConversationSummary` / `ConversationListOpts` and add a
  Voice column/filter to `ConversationsBrowser.tsx`.
- Optionally start writing `turn_record` from voice routes (broader: voice
  usage is invisible to admin analytics). Scope that separately if pursued.

**Touches:** `src/data/schema.ts` (column + migration),
`src/data/repos/conversation-repo.ts`, `src/app/api/voice/transcript/route.ts`,
`src/data/repos/admin-content-repo.ts`, `src/lib/admin/admin-types.ts`,
`src/components/admin/ConversationsBrowser.tsx`.

**Depends on:** Voice mode (shipped) and the admin panel (shipped).

---

## B-16 — Interactive damage calculator page

> **Status: COMPLETE** — first-class `/calc` on web, plus iOS/Android calc
> surfaces, shipped in answer-cards-and-artifacts. Champions only (Level 50,
> Stat Points). "Open in calculator" from a damage block and "Explain this
> calc" back into chat both exist. Formula subset is what `estimate-damage`
> models; full Smogon-calc modifier parity was never in scope.

---

## B-17 — Team analysis dashboard (coverage, speed tiers, threats)

> **Status: COMPLETE** — per-team analysis on web + iOS + Android:
> ability/item-aware defense (curated table), role/utility inventory,
> phys/spec balance, sample damage lines, analysis injection into Teams
> Assistant, archetype starters, team `win_condition`, Apply common set
> (`POST /api/teams/set-template`).
>
> **Residual (still open, not a new item):** weather, terrain, and dynamic
> items outside the curated matchup table are unmodeled. Champions threats
> correctly use live T15 usage — that is the Champions-first design, not a
> leftover of the retired Smogon stored ladder.

**Original why (history):** the Teams page stored and validated sets without
evaluating them.

---

## B-18 — Showdown replay analysis

> **Status: OPEN**

**Why:** Oak's defining trait is reasoning on top of data, and nothing
exercises it harder than a real battle: paste a Pokémon Showdown replay URL
(or raw battle log) and have Oak narrate the turning points — damage-roll
luck, missed lines, set inferences from observed damage. Showdown is already
the upstream ecosystem (`@pkmn`); `@pkmn/protocol` / `@pkmn/client` exist
for this.

**Scope:**
- Accept a replay URL or a pasted log in chat; fetch/parse server-side into a
  structured battle timeline (turns, moves, damage, switches, KOs).
- Surface the parsed timeline to the agent — as a new tool or a server
  pre-pass — which then reasons over it with the existing tools, so the
  analysis stays grounded, cited, and uncertainty-flagged.
- Render as a rich answer; a per-turn drill-down on the B-4 artifact surface
  is the natural deep-dive.

**Open questions:**
- Fetching a user-supplied URL is a live network call (T20 `web_search` was
  removed; T15 is a specific usage API, not an arbitrary fetch):
  SSRF/allowlist guardrails, or ship paste-the-log-only first?
- Tool vs. context: a new read tool returning the parsed timeline, or an
  `AgentContext`-bound consume-on-turn input like `images`?
- Token budget: full battle timelines are large — summarization/windowing,
  and how partial/old-protocol parses degrade honestly.
- Champions-first: which rulesets parse usefully first (Champions / current
  VGC doubles vs. older singles logs).

**Touches:** a new parser module (candidate `src/data/replays/`), a tool or
`AgentContext` binding + `route.ts` body field, prompt routing in
`src/agent/prompts/domain.ts`, answer/artifact rendering.

**Depends on:** Nothing hard; B-4 enriches rendering.

---

## B-19 — Shareable answers (public read-only links)

> **Status: COMPLETE** — shipped in chat-qol (`docs/features/chat-qol/`).
> Signed-in user snapshots one turn to an immutable public URL
> (`/api/shares`, public read + owner revoke + Shared-by-me). Viewer can
> import a `proposed_team`. Guests cannot share. Whole-conversation sharing
> stays out of scope.

---

## B-20 — Playthrough companion / catch tracker

> **Status: SUPERSEDED (Champions-first)** — wiki / encounters / other-game
> playthrough tracking are out of product scope. Do not invent a replacement.

---

## B-21 — Live competitive battle UI

> **Status: OPEN**

**Why:** B-5's original layer 4: a friendly, real-time battle co-pilot that
sits beside a live match. After each turn it explains what happened with the
numbers, recommends the next move, and maintains a scouting sheet of revealed
and inferred opponent info — all within Showdown's turn clock. Explicitly
**not** an autonomous bot; the human plays, the UI assists.

Standing exploration: `docs/research/live-competitive-battle-ui.md`. State
source is **`ps-local`** (self-hosted Pokémon Showdown) over its sim protocol
(`@pkmn/protocol` → `@pkmn/client`). Two independently-prototyped directions,
not yet compared:

- **Direction A — fully deterministic engine.** No model in the loop:
  protocol + client for state, a scouting engine, a `@smogon/calc` sweep,
  heuristic (then expectiminimax) recommendation, templated narration. Wins
  on latency, exactness, and zero per-turn marginal cost.
- **Direction B — per-turn LLM agent.** Deterministic state assembler →
  compact snapshot plus a pre-computed damage-calc table → a battle-specific
  tool subset emitting a `BattleTurnAnalysis` sibling of `OakAnswer`. Wins
  on natural-language judgment. Hard part is staying inside a live clock.

This item does **not** pre-select a direction. Next step in the research doc
is unchanged: prototype both against `ps-local`, then decide.

Champions-first note: stored Smogon `meta_usage` priors that the original
write-up wanted for set prediction are gone. Live T15 Champions usage (and
whatever the live protocol reveals) is the available prior. This surface
sits **outside** the chat agent's 17-tool contract.

**Open questions:** carried from the research doc — which `ps-local`
endpoints/streams are needed; how a self-hosted live server is reached at
runtime (ingest stays offline; a live battle socket is a different,
runtime-only concern); HUD for Singles and Doubles; which ruleset is wired
first; for Direction B, real p95 turn latency under Doubles clocks.

**Touches:** a server-side `ps-local` websocket bridge, new modules under
`src/battle/` (A) and/or a battle-agent mode + schema + HUD (B);
`@pkmn/protocol`, `@pkmn/client`, `@smogon/calc` as new dependencies.

**Depends on:** nothing in the current Champions product. B-5 layers 1–3 are
retired and are not a prerequisite.

---

## B-22 — Fix the two failing admin cost-sorting oracle tests on `develop`

> **Status: COMPLETE** — the two tests now pin order through
> `estimateCostUsd` against current `MODEL_PRICING` (misty gpt-5.5 > ash
> grok-4.3 > brock claude), rather than a stale hard-coded ranking from
> before the 2026-07 pricing reconciliation (`732171d`).
>
> Files: `src/data/repos/admin-analytics-repo.oracle.test.ts` ("ranks by
> estimated cost"), `src/data/repos/admin-content-repo.oracle.test.ts`
> ("sorts by the heavy-user metrics (turns, errors, cost)").

---

## B-23 — Prompt audit

> **Status: COMPLETE** — Champions-first already cut the body to
> `domain.ts` (17 tools, no warehouse / wiki / eleven-scope routing). The
> remaining audit-and-patch landed in `6d89405` ("Tighten Champions prompts:
> drop residue, say each rule once"): text-chat body, few-shot, voice, judge,
> and a few tool/schema descriptions compressed; Gen 9 / wild-held / SQL /
> Pokédex-generation leftovers removed from model-facing text. Prefix cache
> miss on the next deploy is expected (ADR-2).
>
> A structural rewrite of `domain.ts` is not this item. Do not re-expand
> whole-games routing.

---

## B-24 — Production email sender identity

> **Status: OPEN** — split out of B-1 so account creation can close.

**Why:** OTP sign-in is the only login. Dev/test can use a console
transport. The default `EMAIL_FROM` (`Oak <onboarding@resend.dev>` in
`web/src/env.ts` and `web/.env.example`) only delivers to the Resend
account owner. Real multi-user delivery needs a verified domain and a
from-address on it. This is a launch blocker for anyone who is not the
operator.

**Scope:**
- Verify a sending domain on Resend.
- Set `EMAIL_FROM` in production to that identity.
- Confirm OTP mail delivers to an address that is not the operator.

**Touches:** Resend dashboard (ops), Fly secrets / `EMAIL_FROM`, possibly
copy on the auth screen if the from-name should match the product brand.

**Depends on:** B-1 (COMPLETE).

---

## B-25 — Account data export

> **Status: OPEN** — split out of B-1 so account creation can close.
> **Account deletion already shipped** (cascade in `accounts-repo`, in-app
> confirm on web / iOS / Android). This item is the remaining GDPR-style
> export.

**Why:** Signed-in users can delete an account. They cannot download what
Oak holds on them. Before a genuinely public launch, a signed-in export
(profile, conversations with structured answers, teams) should exist.

**Scope:**
- On-request export for the signed-in account: profile, conversations
  (questions + `OakAnswer` payloads), living and archived teams.
- Generate on request; deliver as a download or a short-lived link.
- Images stay out until (if) consume-on-turn is reversed — do not invent
  an image archive here.
- Guest sessions have nothing durable to export.

**Open questions:**
- Zip vs. JSON vs. Markdown+JSON.
- Synchronous download vs. emailed link (the latter wants B-24).
- Whether admin-visible `turn_record` rows are in or out (operator
  analytics vs. user data).

**Touches:** new export route under `/api/account/`, a Settings/Account
affordance on web + iOS + Android, privacy-page copy.

**Depends on:** B-1 (COMPLETE). Benefits from B-24 if delivery is email.

---

## B-26 — `turn_record` retention (and stop dual-storing `OakAnswer`)

> **Status: OPEN** — ops/data-hygiene, not a product surface. The Champions
> index is **not** the size problem: `pokemon` / `learnset` /
> `searchable_names` / `reference_cache` are a fixed, rebuildable snapshot
> (likely tens of MB, including indexes). Do not shrink, shard, or relocate
> the dex to "fix disk."

**Why:** Two append-only blobs grow without bound on the hottest Postgres:

- `turn_record` — one row per chat turn, **guest and signed-in**, including
  `prompt_text`, `answer_text`, full `answer_json`, and `tool_trace`. No
  prune job. Guest prompts that used to be ephemeral are now durable.
- `conversation_message.answer_json` — the signed-in re-render copy of the
  same `OakAnswer`. Needed. The copy on `turn_record` is only for admin
  drill-down.

A signed-in turn therefore stores the card twice. Ingest
(`writeIndex` delete-then-insert in one transaction) also leaves dead
tuples until VACUUM; that peak is still small next to unbounded telemetry.
Flagged in `docs/review/tech-debt-audit.md` §3.4 and
`docs/scaling-plan.md` Phase 3b. Matters on the current unmanaged Fly
volume and on any later host (Supabase Pro 8 GB included, etc.).

**Scope:**
- Measure first on prod (`pg_total_relation_size` per table). Confirm the
  dex tables are not the top consumers before changing ingest.
- Nightly (or similar) retention on `turn_record`: keep **full** rows for a
  short window so `/admin` drill-down still works; after that **delete** or
  **null** `answer_json` / `tool_trace` / long `answer_text` and keep the
  numeric columns (tokens, model, status, latency). Guest rows: **shorter**
  window than signed-in.
- Stop writing a second full `OakAnswer` onto new `turn_record` rows when
  `conversation_message` already has it; admin drill-down can join. Optional
  backfill: null the duplicate on old signed-in rows.
- `VACUUM ANALYZE` the four index tables after ingest (recovers
  delete+insert bloat; no product change).
- Do **not** partition `turn_record` until a prune is actually slow. Do not
  split dex and user data into two databases.

**Out of scope:** shrinking `reference_cache`, live-computing dex from
`@pkmn` at request time, compressing JSON in Postgres, a second
`DATABASE_URL`. `conversation_message` is user history — no retention
policy there unless a later privacy/export spec says so (see B-25).

**Open questions:**
- Full-row window (30 vs 90 days) and guest window (e.g. 14 days).
- Delete old rows vs. strip bulky columns (analytics rollups vs. disk).
- Scheduler: Fly cron/machine vs. in-app interval vs. operator-run CLI.
  `release_command` (`node migrate.mjs`) is the wrong place.

**Touches:** `src/data/repos/` (usage / admin content insert + getTurn), a
prune module + tests, ingest CLI (post-write VACUUM), possibly a small
Fly-side schedule. No client UI required. Privacy-page copy if guest
retention changes.

**Depends on:** admin panel (shipped) — drill-down and cost rollups must
keep working on stripped/old rows. Related to B-25's open question of
whether `turn_record` is in the user export (operator analytics vs. user
data).
