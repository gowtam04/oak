# Answer cards and artifacts — Architecture Decisions

## ADR-1 — Stay in the existing Next.js monolith

- **Decision:** All APIs, pages, and persistence live in `web/`. Natives remain HTTP clients of the same contract.
- **Alternatives:** extract a calc service; new Fly worker for voice compile.
- **Why:** Hobby budget, one Fly machine, matches every prior Oak feature.
- **Tradeoff:** Voice compile shares the chat machine. Acceptable: one compile per voice turn, preempted by a real send.

## ADR-2 — Optional `citation.anchor` + strip-on-invalid

- **Decision:** Extend `citationSchema` with optional
  `anchor?: { target: "answer_span" | "fact_row"; id: string }`.
  Before `oakAnswerSchema.safeParse` (and again on persist),
  `sanitizeCitationAnchors(answer)` **deletes** any missing, extra, or
  malformed `anchor`. A bad anchor can never fail `submit_answer` or
  burn retries (**CIT-BR-3**).
- **Prompt:** `domain.ts` teaches the model to emit anchors when it
  can, and to mark the matching sentence with an HTML comment or a
  stable `{#cN}` id the client can scroll to. Fact-table rows use
  `fact_row` + the row’s `name` (candidate) or a documented field key.
- **Old answers:** no field → no highlight (**CIT-AC-1.2**).
- **Alternatives:** markdown `[[c:0]]` markers; sidecar column.
- **Why:** Durable in `answer_json`, typed on all three clients, no
  validity gate.
- **Tradeoff:** `OakAnswer` changes. Chat QoL said “no schema change”
  for *that* pack; this pack owns the additive optional field. Stored
  answers without `anchor` stay valid under `.strict()` (key absent).

## ADR-3 — Calculator is `POST /api/calc`, not a 21st tool

- **Decision:** One public, no-auth estimate endpoint. Server loads
  species/move from the existing index, runs `computeStat` /
  `estimateDamage`, and applies a **documented modifier catalog**
  (weather, Reflect/Light Screen, Life Orb, Choice Band/Specs, Expert
  Belt). Everything else is returned in `unsupported[]` and is **not**
  folded into `other_modifier` as 1.0-pretending-it-applied
  (**CALC-BR-3**).
- **Clients never port the formula.** Overlay and full screen POST on
  change (debounce 100 ms on sliders; immediate on discrete knobs).
- **Alternatives:** three-client formula ports; web-local + native API.
- **Why:** One test surface, hobby, natives cannot import the TS
  formulas. Debounced POST is still not a model turn (**CALC-BR-1**).
- **Tradeoff:** Slider is not 0 ms. Acceptable.

## ADR-4 — `/calc` is a handled slash (supersedes Chat QoL)

- **Decision:** Extend `parseSlashCommand` with
  `{ type: "calc"; rest: string }`. `/calc` and `/calc …` **do not**
  POST `/api/chat`. The client opens the calculator overlay and
  optionally prefills via `/api/search` + `/api/calc`.
- **Chat QoL** `SLASH-BR-1` treated `/calc` as unknown text. **This
  pack wins.** Update those tests when P5 ships.
- **`/compare` stays unknown text.** No standalone Compare page
  (**CMP-BR-3**).

## ADR-5 — Add-to-team is read-modify-write on existing `PUT /api/teams/:id`

- **Decision:** No slot PATCH. Portable
  `placeSpeciesOnTeam(members, incoming, target)` writes the first
  empty slot or a chosen replace index. Client: `listTeams` → pick →
  `getTeam` → place → `updateTeam({ members })` → navigate to editor.
- **Create new:** existing `createTeam({ format: currentScope, members: [placed] })`.
- **Why:** `members` is already a JSON document; warn-but-allow lives
  on `updateTeam`. A new slot API would duplicate validation.
- **Tradeoff:** Two-tab race can clobber. Last write wins — same as
  today’s editor. Acceptable at personal scale.

## ADR-6 — Pins are a new table of snapshots, not `conversation_message.pinned`

- **Decision:** `conversation_artifact_pin` (max 5 per conversation).
  Payload is a versioned JSON snapshot (`team_sheet` | `comparison` |
  `calc`). Distinct from Chat QoL’s **turn** pin column.
- **Alternatives:** JSON column on `conversation`; reuse message pins.
- **Why:** Cap + cascade delete are row constraints. Turn pins are a
  different object. Snapshots must not re-read the index (**PIN-BR-1**).

## ADR-7 — Voice hydrate is a bounded compile on the same assistant row

- **Decision:** `POST /api/voice/transcript` still persists the thin
  card immediately (**VOICE-BR-1**). It then **fire-and-forgets**
  `runVoiceCompile`:
  - prompt: `voice-compile.ts` (not `domain.ts`)
  - tools: **`submit_answer` only**
  - input: spoken user + assistant text + in-process tool-trace for
    that `session_id`
  - thinking: **off** (single tool; avoid thinking+forced-choice 400)
  - on success: `updateAssistantAnswer` overwrites that row’s
    `answer_json` / `text_content` (same ids, same `seq`)
  - on failure: leave the thin card; expose `hydrate.status = "failed"`
- **Not** the turn-store 409 lock. A real `POST /api/chat` on that
  conversation **aborts** the compile (**VOICE-BR-5**).
- **Retry:** `POST /api/voice/hydrate` with the assistant message id
  re-runs compile. Not a new user/assistant pair.
- **Costing:** not a second history ask. `recordTurn` may write a
  compile row for the operator; the user-visible rate-limit does not
  increment.
- **Alternatives:** deterministic no-model compile; full new text turn.
- **Why:** Product required a real `OakAnswer`. Same-row replace
  avoids a second bubble.

## ADR-8 — Voice tool-trace is in-process only

- **Decision:** `globalThis` buffer keyed by conversation/`session_id`,
  appended in `POST /api/voice/tool`, read by compile, TTL 30 min,
  fail-soft empty → compile still runs on speech alone (weaker card).
- **Why:** Hobby, single Fly machine, same as the turn store. Process
  restart → Retry may produce a thinner card; user can ask in text.
- **Do not** persist traces in Postgres.

## ADR-9 — Compact preference is `account.answer_density`

- **Decision:** Column `answer_density` `'full' | 'compact'`, default
  **full** (NULL = full). `GET /api/auth/me` returns it.
  `PATCH /api/account/preferences` writes it. Guests use
  `localStorage["oak-answer-density"]` only (**COMPACT-BR-4**).
- **Not** `app_setting` (operator-only).

## ADR-10 — Showdown one-tap reuses existing serialize

- **Decision:** No new export-draft endpoint. Web calls the same
  `serializeShowdown` already used by human copy
  (`oak-answer-human-md.ts`). iOS/Android use their existing lockstep
  Showdown serializer from Chat QoL. The new control copies **only**
  the paste, not the full human markdown.
- **Why:** Guests must copy (**PASTE-BR-3**); a signed-in export
  route would 401 them. Dialect must match the editor (**PASTE-BR-2**).

## ADR-11 — Compare is two `/api/entity` reads + a client diff

- **Decision:** No compare endpoint. `Compare with…` fetches both
  profiles (`GET /api/entity`) and builds the artifact with a portable
  `diffPokemonProfiles` (stats, types, abilities, speed, movepool
  set-diff, matchup-diff). Opening an answer comparison block still
  uses the existing structured artifact (no fetch).
- **Why:** Entity fetch already exists; a server compare would
  duplicate it.

## ADR-12 — Open in Dex carries the artifact’s format

- **Decision:** Web navigates to the existing reference route **with**
  `?format=`. Pokémon page already honors it. **This pack adds** the
  same query to `/moves/[slug]`, `/abilities/[slug]`, `/items/[slug]`
  (today those chips are read-only). Native: set the Dex tab format
  to the artifact’s format, then push the entity route.
- **Types:** no Dex hop (**DEX-BR-2**).

## ADR-13 — Calculator overlay vs full screen

- **Decision:** Chat hops and `/calc` mount `CalculatorOverlay` on
  the current conversation. App nav / Expand go to
  `GET /calc` (web) / `Calculator` screen (native). Overlay state is
  passed via a portable `CalcScenario` in session/navigation extras,
  not a server-saved calc (unless pinned).
- **Default level:** Champions + any format whose
  `basisForFormat` / product label is VGC/doubles-style → 50;
  otherwise 100 (**CALC-BR-7**). Expose a single helper
  `defaultCalcLevel(format)`.

## ADR-14 — Old-gen calcs caveat, do not block

- **Decision:** `/api/calc` accepts all eleven `Format`s. Gens 1–4
  still run modern `computeStat` + `estimateDamage` and return
  `caveat: "modern_estimate"` (or a user-visible string). Clients
  always render that caveat (**CALC-BR-6**).
