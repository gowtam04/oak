# Backlog

Forward-looking work not yet specified in `requirements/` or `architecture/design.md`.
Items here are **candidates**, not commitments — each needs a requirements pass before
it moves into a design doc. Today Oak is **single-user and stateless** (in-memory
per-session history, no accounts, no persisted artifacts); every item below changes one
of those assumptions, so they're listed in dependency order: accounts unlock the rest.

> Append new items; don't renumber existing ones. IDs are stable.

---

## B-1 — Account creation

> **Status: BUILT** — specified and implemented as **Account Creation (Email +
> OTP Auth)**. See `docs/features/account-creation/requirements/requirements.md`
> (BR-A1..A11, AUTH-US-1..7, AC-*) and
> `docs/features/account-creation/architecture/design.md`. Delivered passwordless
> email-OTP accounts with a retained anonymous guest mode, DB-backed opaque
> cookie sessions (~30-day, per-device, revocable on sign out), and tiered chat
> rate limits (per-account for signed-in users, per-IP for guests). Auth is a
> separate cookie/account concern, orthogonal to the conversation `session_id`,
> so guest→user thread continuity and the agent/SSE contract are untouched
> (BR-A10, BR-A11). This **supersedes** the "single user / no auth" stance in
> `docs/requirements/requirements.md` (§Non-Functional, §Out of Scope) for the
> auth dimension.
>
> **Deliberately deferred (not built — tracked for later):**
> - **Production email sender identity** — `EMAIL_FROM` + a verified Resend
>   domain. Dev/test use a console transport; the `onboarding@resend.dev` default
>   only delivers to the account owner, so this is needed before real multi-user
>   delivery (not before building).
> - **Account deletion / data export / GDPR** — out of scope for this build;
>   revisit before a genuinely public launch.
> - **Multi-instance throttle** — the OTP request throttle (and the conversation
>   store) are in-memory, sized for a single-instance hobby deploy; a shared
>   backend is required if Oak ever runs multiple processes.
>
> The "auth strategy" and "where identity lives" open questions below are now
> resolved by the design (hand-rolled email-OTP; identity in the existing
> Drizzle/Postgres layer — note the backlog's original "Drizzle/SQLite" framing
> predates the Postgres migration). Original framing retained below as history.

**Why:** The product is single-user by design today (one Owner, no auth — see
`requirements.md` §Users and Personas). Persisting anything per-person (teams, chat
history) first requires a notion of "who," so this is the prerequisite for B-2 and B-3.

**Scope:**
- Sign-up / sign-in / sign-out; session-backed identity replacing the current
  server-controlled single session.
- Per-user data isolation — every persisted row (teams, chats) scoped to an account.
- Decide auth strategy (email+password, magic link, or OAuth provider) and where
  identity lives relative to the existing Drizzle/SQLite layer.

**Open questions:**
- Is this truly multi-tenant, or just "log in to sync my own data across devices"?
- Does the rate limit (currently per-session) become per-account?
- Migration path for the existing single-user data, if any.

**Touches:** `src/app/api/chat/route.ts` (session resolution), data layer / new
`accounts` table, new auth routes, frontend auth UI.

---

## B-2 — Team building

> **Status: BUILT** — implemented per
> `docs/features/team-builder/architecture/design.md` (decisions TEAM-AD-1..6)
> from the spec at `docs/features/team-builder/requirements/requirements.md`
> (TEAM-US-1..11, BR-T1..11, AC-*). Delivered: a saved-team data model (one row +
> JSON `members`, per-account + format-bound), a dedicated **Teams page** manual
> builder (create / rename / duplicate / delete, per-slot editing, live computed
> stats), **warn-but-allow** validation (`validateTeam` → `TeamWarning[]`, never
> blocks a save), **Showdown paste import/export** (`@pkmn/sets`, isolated to
> `src/data/pkmn/team-paste.ts`), and the `/api/teams/*` route surface
> (per-account isolation → 404, guests → 401). Agent-side, a per-conversation
> **active team** is server-bound onto `AgentContext.activeTeam` (the analogue of
> `mode`) and read on demand by the new no-arg **`get_active_team` (T12)** tool —
> growing the documented 11-tool contract to **12 tools** — and the agent can
> **propose** a team via the additive optional `proposed_team` answer field, which
> the user explicitly **applies** (save-new / apply-existing) — the agent never
> writes a team itself (BR-T8). These inlined agent internals are reconciled into
> `docs/agent-design/{tools.md,prompts.md,output-formats.md}` (TEAM-AD-3). This
> resolves all three original open questions below: build mode → both; set depth →
> full competitive set; team-as-agent-input → server-bound + read via a no-arg
> tool (never a scope-widening LLM input, mirroring the server-controlled format).
> Original SPECIFIED framing + history retained below.
>
> **Decisions locked (from the spec):** **both** a manual builder (a **dedicated
> Teams page**) and **agent-assisted** construction in chat, where the agent
> **proposes** a team/edit and the user explicitly **applies** it (the agent
> never mutates saved teams); the **full competitive set** per Pokémon (species,
> ability, item, 4 moves, nature, EVs, IVs, Tera type, level); **many named
> teams**, **partial/in-progress allowed**; **warn-but-allow** validation
> (EV/IV caps, learnset/ability/item legality, species + item clause) that never
> blocks a save; **Pokémon Showdown paste import & export**; an **active team
> that is per-conversation, defaults to none, is manually selected, and is read
> by the agent only when the question is about it**; teams are **per-account**
> (B-1) and **format-bound** (`scarlet-violet` | `champions`). This resolves the
> three original open questions below: build mode → both; set depth → full set;
> team-as-agent-input → the agent must read the active team, but **how** it's
> wired given the fixed 11-tool contract is **handed to the architect** (the team
> must not become a scope-widening LLM input, mirroring the server-controlled
> format). Original framing retained below as history.

**Why:** Competitive team-building is one of the two core use cases
(`requirements.md` §Overview), but the agent only *reasons about* teams — it can't
*save* one. Letting the user persist and revisit named teams turns one-off answers
into an ongoing workflow.

**Scope:**
- Create / name / edit / delete teams; each team a set of Pokémon (species + the
  competitively relevant slots: ability, item, moves, EVs/nature as scope allows).
- Surface saved teams to the agent as context so follow-up questions ("is my team
  weak to Trick Room?") can reason against the actual roster.
- Format-aware: a team belongs to a format (`scarlet-violet` | `champions`),
  consistent with the per-format index split.

**Open questions:**
- Manual team construction UI, agent-assisted ("build me a Trick Room team"), or both?
- How much of a full competitive set do we model (just species, or full
  ability/item/move/EV detail)?
- Is a team a new tool input the agent can read, and if so how does that interact with
  the fixed 11-tool contract?

**Depends on:** B-1 (teams are per-account).

---

## B-3 — Chat history

> **Status: BUILT** — implemented per
> `docs/features/chat-history/architecture/design.md` (HIST-AD-1..5). Two Postgres
> tables (`conversation`, `conversation_message`) scoped by `account_id`; the
> client `session_id` IS the conversation id (HIST-AD-1); the chat route persists
> each signed-in turn (full `OakAnswer` as JSON) off the SSE critical path and
> re-feeds DB history (trimmed) on resume; `/api/conversations/*` backs list /
> open / rename / pin / delete / format-filter / search (ILIKE title+text); the
> guest→sign-in thread is bulk-imported idempotently. Guests, the agent, the
> 11-tool contract, the Champions toggle, and the SSE contract are unchanged.
> Original spec/decision history retained below.
>
> **Status (spec): SPECIFIED** — refined into a buildable spec at
> `docs/features/chat-history/requirements/requirements.md` (HIST-US-1..12,
> BR-H1..11, AC-*). Decisions locked: **signed-in users only** (guests stay
> ephemeral/in-memory); store the **full structured `OakAnswer`** per turn
> (not markdown-only, and the tool-activity trace is **not** persisted);
> conversations are **resumable with in-conversation memory** (prior turns
> re-fed within the existing context budget); **auto-save all**, auto-derived +
> renamable titles; manage via delete (permanent, confirmed) / rename / search
> (title+text) / pin / filter-by-format (export is out of scope); a guest's
> on-screen conversation **auto-saves to the new account on sign-in** (extends
> BR-A10); **indefinite retention** (optional abuse-backstop cap TBD). Builds on
> B-1 accounts and BR-A9 isolation. The three original open questions below are
> resolved by the spec: store full structured payloads (not markdown); resuming
> re-feeds prior turns with existing trimming and leaves the cached prefix /
> `MAX_ITERATIONS` untouched; retention is indefinite (cap is an open detail, not
> a policy). Original framing retained below as history.

**Why:** Conversation history is currently **in-memory only** (per-session store in
`route.ts`) — it evaporates on restart and isn't visible across devices. Persisting it
gives the user a durable record of past answers (with their reasoning and citations,
which are the point of the product) and the ability to resume threads.

**Scope:**
- Persist conversations (messages + the structured `OakAnswer` payloads) per account.
- List / open / continue / delete past conversations from the frontend.
- Decide retention and what exactly is stored (raw markdown only, or the full
  structured answer + tool-activity trace for replay).

**Open questions:**
- Store full `OakAnswer` structured payloads (richer, larger) or just the rendered
  markdown?
- Does resuming a thread re-feed prior turns to the model, and how does that interact
  with the prompt-cached prefix and `MAX_ITERATIONS`?
- Retention / size limits per account.

**Depends on:** B-1 (history is per-account).

---

## B-4 — Artifact viewer

> **Status: SPECIFIED** (not yet built) — refined into a buildable spec at
> `docs/features/artifact-viewer/requirements/requirements.md` (AV-US-1..11, BR-AV-1..10,
> AC-*). Decisions locked: a **docked side panel** (desktop) / **full-screen overlay**
> (mobile) showing **one artifact at a time** with **mini-browser back-stack navigation**
> (drill-down + back); **ephemeral / session-only** (confirmed — no B-1/B-3 dependency);
> **user-triggered** only (BR-AV-2). Two open paths: **click a structured entity**
> (Pokémon / move / ability / item / type — in sprite cards, candidate rows, comparison
> cells, type badges, and Sources entries) → a **full entity-detail profile**; and a
> **per-section "open in viewer"** button on rich answer blocks → team sheet / comparison /
> damage-calc / type-grid artifacts. Entity detail is a **full profile** (everything the
> index holds for the active format), carries **full grounding** (per-datum sources,
> format/generation tag, caveats), and **requires a fresh index read on click** — a
> deliberate reversal of the "no fresh read / purely frontend-derived" framing below
> (and in B-6), now the key input for the architect. Free-text prose names are **not**
> clickable (structured spots only). Actions: close + "ask about this in chat"; no
> copy/share/export. **This item absorbs B-6** (clickable sources open entity-detail
> artifacts). The four original open questions below are resolved by the spec; the
> schema/output-shape question is handed to the architect. Original framing retained
> below as history.
>
> **Decisions (open questions resolved):** Artifacts are **ephemeral / session-only —
> they will not persist** (no per-account storage, not shareable), so this item has **no
> B-1/B-3 dependency**. Emission is **user-triggered** — the user opens a rendered answer
> "as an artifact"; the agent does not decide to emit one. Still open: whether an artifact
> is a new shape in the `OakAnswer` schema vs. a separate output channel vs. a
> frontend-derived view, and which artifact type ships first.

**Why:** Some answers are inherently richer than a single chat bubble — a full team
sheet, a damage-calc breakdown, a type-matchup grid, a side-by-side species comparison.
Today every answer renders inline in the `AnswerCard` stream and scrolls away. A
dedicated artifact viewer would let the agent emit a structured, focused output that the
user can open, pin, and revisit as a first-class object instead of re-scrolling chat.

**Scope:**
- A dedicated panel/surface that renders a structured artifact (team sheet, comparison
  table, damage-calc result, type chart) separately from the inline chat answer.
- Defined artifact type(s) the agent can produce, rendered field-by-field like the
  existing `OakAnswer` tree — reusing the citation / inference / generation-tag
  conventions so artifacts stay grounded in data.
- Open / pin / dismiss an artifact alongside the live conversation.

**Open questions:**
- Is an artifact a new shape in the `OakAnswer` schema, a separate output channel,
  or a derived view the frontend computes from an existing answer?
- Does the agent decide when to emit an artifact, or is it user-triggered ("open this
  as an artifact") from a rendered answer?
- Which artifact types are worth the dedicated surface first (team sheet vs. comparison
  vs. damage calc)?
- Are artifacts ephemeral (this session only) or persisted/shareable?

**Depends on:** Nothing for an ephemeral, in-session viewer; persisting or sharing
artifacts depends on B-1 (per-account) and overlaps B-3 (what's stored per conversation).

---

## B-5 — Competitive battling page

> **Status: BUILT (layers 1–3)** — shipped as four independent layers, the first
> three of which are done; the fourth is deferred to a new item, **B-21**.
> **Layer 1 (data):** a NEW metagame axis, deliberately separate from the
> six-scope data `Format`/`AgentMode` — `MetaFormat` (`src/data/meta-formats.ts`,
> config-driven; v1 is exactly one ladder, `"gen9ou"` — Smogon OU, Gen 9
> singles, usage cutoff 1695). Two new warehouse tables, `meta_snapshot` +
> `meta_usage` (migration 0011, plus hand-written migration 0012 for
> `oak_readonly` grants), storing **all species for every synced month**
> (retention: all months, not just the latest). A new CLI, **`npm run
> sync:meta`** (`src/ingest/sync-meta.ts`, new `smogon` npm dependency) —
> deliberately the **one** network-fetching DB writer in the codebase
> (`npm run ingest` stays fully offline); it takes `--formats=`/`--month=`/
> `--backfill=N`, is idempotent per `(meta_format, month)` (replace, not
> append), and is a **monthly manual** refresh run by the operator a few days
> after Smogon publishes each month's stats (a Fly scheduled machine to
> automate this is a noted follow-up, not built). Initial production seeding
> uses `sync:meta --backfill=6`. **Layer 2 (reference surface):** public,
> web-only `/meta` pages (leaderboard + a per-species drill-in showing a
> usage-derived representative set, a Showdown-paste copy affordance, and an
> "Ask Oak" deep link into chat) — read-only, no live battle interaction,
> mirroring how `/pokedex` is a reference surface today. **Layer 3 (agent
> tool):** a new no-arg-adjacent read tool, **T21 `get_meta_usage`** (stored
> monthly ladder usage; unlike the server-controlled data scope, its
> `meta_format` input is **model-settable** since it's a genuinely new,
> independent axis; available in every mode; not excluded from voice).
> Champions is **deliberately NOT** a `MetaFormat` — Champions usage keeps
> coming from the existing live T15 `get_usage_stats`, never from these stored
> Smogon snapshots. Oak's tool count grows to **20** (T1–T19 + T21 — T20
> `web_search` stays retired). **Layer 4 — the live battle co-pilot** (drive a
> battle, run damage calcs against a live opponent turn by turn) is
> **deferred** to the new **B-21**, below.
>
> **Resolved open questions:** *reference vs. interactive* — reference shipped
> first (layers 1–3); interactive is the whole of B-21. *New tool vs. new
> format column* — resolved as **new tables + a new `MetaFormat` axis**, not a
> new value on the six-scope `Format` column; metagame data is a genuinely
> different dimension (which competitive ladder) from data scope (which
> game/generation the Pokémon data comes from), so the two stay independent
> and a ladder just points at whichever `Format` its Pokémon data resolves
> against. *`ps-local` as the ingest source* — **not adopted** for usage data;
> Smogon's own published monthly "chaos" stats turned out to be the simpler,
> already-public source for aggregate usage numbers, so `ps-local` was
> dropped from this layer. `ps-local` remains relevant only to **B-21** (a
> live server is the natural state source for an in-progress battle, which
> chaos stats can't provide). *Ingest-without-network* — resolved by carving
> `sync:meta` out as its own CLI and its own declared exception, rather than
> bending `npm run ingest`'s offline guarantee. *Which format ships first* —
> Smogon OU (Gen 9 singles), not VGC/Worlds; the regulation-string tracking
> for VGC/BSS/DOU remains future config-driven entries in `META_FORMATS`, not
> a redesign — each new ladder is one config entry.

**Why:** Oak reasons about mechanics and legality, but it has no surface dedicated to
*competitive* play — the metagame layer that defines what people actually battle with.
The two core use cases (`requirements.md` §Overview) are mechanics reasoning and team
building; a competitive page would sit on top of both, organized around the live
competitive seasons rather than the raw dex. The catch is that the current index is built
**purely from `@pkmn`** (dex, learnsets, legality — see `docs/research/champions-data-sources.md`),
which carries **no metagame data**: no usage statistics, no tier placements, no sample
sets. That's the gap this item fills.

**Battle styles to model** — every competitive context spans **both Singles and
Doubles**, and each axis has distinct legality, rules, and set conventions:
- **VGC / Worlds (official cartridge)**
  - *Doubles* — VGC proper, the Worlds/Regionals format. Bring 6, pick 4; current
    regulation legality (the app already tracks a regulation string —
    `CHAMPIONS_REGULATION`, currently `Regulation M-B`), Tera, item clause, species clause.
  - *Singles* — Battle Stadium Singles (BSS), the official 3v3 singles ladder; its own
    legality set and set conventions, distinct from VGC doubles.
- **Showdown (Smogon)**
  - *Singles* — tier-based 6v6: Ubers / OU / UU / RU / NU / PU / LC, each with its own
    banlist and clauses (Sleep, Evasion, OHKO, Species).
  - *Doubles* — Doubles OU (DOU) plus the VGC-rules ladders Showdown mirrors. Tier and
    usage here are metagame facts, not dex facts.
- **Champions** — already a first-class format in the index (`format = "champions"`),
  with its own regulation; carries its own Singles/Doubles conventions as one more
  competitive lens.

**Movesets:** competitive sets are richer than the dex — full set detail (ability, item,
Tera type, nature, EV/IV spread, 4 moves) plus *why* the set is run. Usage-derived "sample
sets" and lead/teammate tendencies come from Showdown usage data, which the index does not
currently store.

**Candidate data source:** `ps-local` — a self-hosted Pokémon Showdown server
(https://github.com/AbhishekR3/ps-local). Showdown is already the upstream of the
`@pkmn` packages we ingest, so this stays in-ecosystem; `ps-local` additionally exposes
the battle-sim / usage side (formats config, usage stats, sample teams, replays) that the
pure-dex `@pkmn` build omits. Evaluate it as the metagame ingest source alongside the
existing `gen-provider.ts` integration point.

**Open questions:**
- Is this a *reference* page (browse formats / tiers / sample sets) or an *interactive*
  one (drive a battle, run damage calcs against a live opponent)? See the Live
  Competitive Battle UI exploration (`docs/research/live-competitive-battle-ui.md`).
- Does metagame data (usage %, tier, sample sets) become a new tool the agent can read?
  That collides with the fixed 11-tool contract (`docs/agent-design/tools.md`) — new
  format column vs. new tables vs. new tool is the design call.
- How is `ps-local` data ingested and refreshed (it's a live server, not a static
  package) without breaking the current "no network at ingest" guarantee?
- Which format do we ship first — VGC/Worlds (matches the existing regulation tracking)
  or Smogon singles tiers (a whole new tiering concept)?

**Depends on:** Standable as a read-only reference surface on its own; deeper integration
(save a competitive set, "is this set legal in Reg M?") overlaps B-2 (team building) and
benefits from B-1 (per-account).

---

## B-6 — Clickable sources → source-detail artifact

> **Status: ABSORBED INTO B-4** — the B-4 spec
> (`docs/features/artifact-viewer/requirements/requirements.md`, AV-US-3) makes Sources
> entries clickable, opening the cited resource as a **full entity-detail artifact** with
> the cited datum (`citation.detail`) shown in context. This **resolves B-6's central open
> question in the opposite direction** from the note below: the richer detail comes from a
> **fresh index read for a full profile**, *not* from carrying the full datum in the answer
> payload — so the citation schema does **not** need enriching for this. The external `↗`
> PokeAPI link is retained alongside the new in-app click. Still open (deferred to the
> architect): whether source-detail is a distinct artifact type or just the entity-detail
> artifact with the cited datum highlighted. Original framing retained below as history.
>
> **Decisions (open questions resolved):** Built **after B-4**, reusing its artifact
> viewer (open / pin / dismiss, ephemeral/session-only per B-4). The source-detail comes
> from the **full underlying datum carried in the answer payload** — *not* a fresh
> tool/repo lookup on click — so the read path and the fixed 11-tool contract stay
> untouched. Note that today's `citationSchema` is strictly `{ source, detail,
> endpoint_url? }` (`src/agent/schemas.ts`), so carrying that full datum means
> **enriching the citation/answer shape** at answer time; the click-time render is then
> purely frontend-derived. **Intent:** surface *more context to help the user understand
> the specific source* — beyond the bare `source — detail`, show the underlying structured
> value, its provenance, the format/generation it's drawn from, and the canonical
> endpoint. Still open: whether "source detail" is its own artifact type or one rendering
> of a more general entity artifact (B-4).

**Why:** Citations are core to the product — every answer carries its sources so the
reasoning stays grounded (BR-4). Today each citation in `SourceList` shows only the
resource key + the specific datum, with an optional `↗` link that navigates *out* to the
canonical PokeAPI endpoint (`citation.endpoint_url`). The user never sees *what the source
actually says* without leaving the app. Letting a click on a source open an in-app
artifact that details that source — the raw datum, its provenance, and how it fed the
answer — keeps users in context and makes the citations inspectable rather than just
attributed.

**Scope:**
- Make each citation in `SourceList` clickable (beyond the existing external `↗` link),
  opening a focused **source-detail artifact** rather than navigating away.
- The artifact details the cited source: the resource/entity it refers to
  (`citation.source`), the specific datum used (`citation.detail`), the underlying
  structured value the agent reasoned over, the format/generation it's drawn from, and a
  link to the canonical endpoint where one exists.
- Render it through the **B-4 artifact surface** (open / pin / dismiss alongside the live
  conversation), reusing the citation / generation-tag conventions so the source artifact
  stays consistent with the rest of the answer tree.

**Open questions:**
- Where does the artifact's richer detail come from — is the full underlying datum already
  present in the `OakAnswer` citation payload, or does opening a source trigger a fresh
  read (a tool/repo lookup) to hydrate it? A fresh read collides with the fixed 11-tool
  contract and the "tools never throw in-domain" seam.
- Is "source detail" a distinct artifact type, or one rendering of a more general entity
  artifact (overlapping a species/move/ability sheet from B-4)?
- Does this stay purely frontend-derived from the existing `citations[]`, or does the
  citation schema (`src/agent/schemas.ts`) need a richer shape to carry the detail?

**Depends on:** B-4 (reuses the artifact surface). Ephemeral, in-session only; persisting
or sharing a source artifact inherits B-4's B-1/B-3 dependencies.

---

## B-7 — Rename "Oak" → "Oak"

**Why:** "Oak" reads as a generic lookup bot and leans on the trademarked "Poké-"
prefix; the product's identity is a reasoning expert that explains its work. **Oak**
(after Professor Oak — the franchise's archetypal knowledge-giver) is warmer, signals
"ask the expert," and carries no trademarked string while still landing the Pokémon
association for fans. This is a branding/identity change, orthogonal to B-1..B-6.

**Scope (phased — the two phases have very different cost/risk):**
- **Phase 1 — user-facing name (cheap, low-risk, do first).** Rename everything a person
  sees or that identifies the product externally: page `<title>`/metadata and UI copy
  (`src/app/layout.tsx`, `src/app/page.tsx`, `src/components/*`), `README.md`, `CLAUDE.md`,
  `package.json` `name`, `.env.example`/compose comments, and the agent's **self-identity in
  the system prompt / few-shot persona** ("You are Oak…"). Note the prompt persona lives
  **inline in `src/agent/runtime.ts`** for the live standard path; `src/agent/prompts/system.ts`
  + `few-shot.ts` are an orphaned tested mirror and `champions.ts` is the only imported prompt
  module — update the live inline copy plus `champions.ts`, and the mirror for consistency.
- **Phase 2 — internal code identifiers (large, optional, separate change).** The name is
  baked into ~85 files as identifiers: `OakAnswer` (×172), `runOak` (×60),
  `OakDb` (×59), `oakAnswerSchema`/`oakAnswerJsonSchema`, `RunOakFn`,
  `useOakChat`, etc. These are an internal refactor only — **but `OakAnswer` and its
  fields surface through `zod-to-json-schema` into the `submit_answer` tool schema the model
  reasons against** (CLAUDE.md: "tool names and tool output field names are a contract"), so
  renaming the *schema/field* identifiers is behaviorally load-bearing and must be re-evaluated
  against the golden eval suite, not just typechecked. Recommendation: rename internal symbols
  that are *not* model-visible freely; leave the `OakAnswer` schema shape/field names alone
  unless there's a reason to touch the contract.

**Open questions:**
- Does Phase 2 happen at all, or do we keep `OakAnswer`/`runOak` as internal legacy
  names and only rebrand the surface? (Phase 1 alone fully rebrands the product.)
- Final wordmark/casing — "Oak" vs. "Oak." vs. an "Ask Oak" lockup — and a one-line tagline
  for metadata/landing copy.
- Domain / npm package name availability for "oak" (the npm name `oak` is taken by a Deno HTTP
  framework — affects only `package.json` `name`, not the product brand).

**Touches:** Phase 1 — `src/app/layout.tsx`, `src/app/page.tsx`, `src/components/*`,
`src/agent/runtime.ts` (inline persona), `src/agent/prompts/{system,few-shot,champions}.ts`,
`README.md`, `CLAUDE.md`, `package.json`, `.env.example`, `docker-compose.dev.yml`.
Phase 2 (if pursued) — schema/runtime/repo/test identifiers across ~85 files; gate on
`npm run typecheck` **and** the golden eval suite if any model-visible field name changes.

**Depends on:** Nothing.

---

## B-8 — Image upload

**Why:** Chat input is **text-only** today — the request body is
`{ session_id, message, champions_mode }` (as of this writing; the body has
since gained `scope_seed` and `images`, and `champions_mode` is now deprecated
— see the generation-scope addendum) and the runtime assembles a single text
message. A lot of real Pokémon questions arrive as pictures: a team-preview or
battle screenshot, a Showdown/box screenshot, a damage-roll the user wants
checked, or "what is this Pokémon?" Letting the user attach an image and having
the agent reason over it (the model already supports vision) turns those into
first-class questions instead of "describe it to me in text."

**Scope:**
- Accept one or more image attachments on the chat input and carry them through
  the API into the model turn as image content blocks alongside the text message.
- Decide how vision interacts with the **data-grounded** contract: an image gives
  the agent *what to look up*, but answers must still resolve to the index and
  carry the usual sources/inference flags — the model should not assert dex facts
  read off a picture without grounding them through the tools.
- Frontend affordance: attach / preview / remove an image; show it in the
  rendered turn so the conversation stays legible on resume (B-3).

**Open questions:**
- Validation + limits (file type, size, count) and where they're enforced
  relative to the existing input-length cap and per-session rate limit in
  `route.ts`.
- Are uploaded images persisted (for signed-in history / resume) or kept
  ephemeral? Persisting overlaps B-1 (per-account) and B-3 (what's stored).
- Does the vision step stay inside the existing tool-loop turn, or does it need a
  pre-pass that extracts entities from the image before the normal resolve/lookup
  flow runs?

**Touches:** `src/app/api/chat/route.ts` (body schema, validation), the request
type/Zod schema, `src/agent/runtime.ts` (message assembly with image blocks),
frontend chat input + turn rendering (`src/components/*`).

**Depends on:** Nothing for an ephemeral single-turn upload; persisting uploads
across resume depends on B-1 / B-3.

---

## B-9 — Make Grok native

> **Status: BUILT** — Grok 4.3 is the PRIMARY model (Grok 4.5 also admin-selectable),
> served by a dedicated native adapter (`src/agent/providers/grok-provider.ts`) on
> xAI's **Responses API** (`client.responses.create` via the OpenAI SDK pointed at
> `XAI_BASE_URL` — no new dependency), constructed by `factory.ts` and registered
> in `models.ts`. Delivered: native request shaping (flattened function tools,
> `reasoning.effort` high, `parallel_tool_calls` false, `include:["reasoning.encrypted_content"]`),
> a Responses→normalized streaming-event mapping feeding the same
> AnswerMarkdownExtractor, and the same `OakAnswer` validation seam. Made primary:
> `XAI_API_KEY` required at boot (Anthropic/OpenAI optional, validate-on-use),
> `DEFAULT_MODEL_KEY="grok-4.3"`, the judged eval suite runs the agent on Grok
> (judge stays on Claude). Prompt caching is automatic on a stable prefix (no
> `cache_control`); the loop uses `tool_choice:"auto"` + `reasoning.effort`.
> Recorded-stream tests in `src/agent/providers/grok-provider.test.ts`.
>
> **Follow-up (audit A–D, shipped 2026-07):** mid-turn Responses chaining
> (`store:true` + `previous_response_id` by default; `stateful:false` restores
> full-transcript re-echo), client memoization per `(apiKey, baseURL)`, shared G8
> filter-bail prompt rule in `domain.ts`, teams-assistant prompt collapse (one
> Markdown body + builder-specific OpenAI style), and `cached_input_tokens` on
> turn traces / `turn_record` (migration 0014).
>
> **Prod lesson (2026-07-09 Fly):** when chaining with `previous_response_id`,
> **omit `instructions`** (xAI 400 if both are set) but **keep `tools` +
> `tool_choice`** (xAI 400 if `tool_choice` is set with no tools). First
> iteration of a turn still sends instructions + tools. See AGENTS.md Gotchas
> and `grok-provider.ts` `buildRequestBody`.
>
> Optional live regression after prompt changes:
>
> ```bash
> cd web
> tsx eval/run.ts --model=grok-4.3 --case=G8   # filter-bail check
> tsx eval/run.ts --model=grok-4.3 --repeat=3  # optional variance
> ```

**Why:** Oak already has a model-provider seam (the `LLMProvider` abstraction in
`src/agent/providers/` with a client-safe `src/agent/models.ts` registry and a
server-only `factory.ts`; the Anthropic path is `anthropic-provider.ts` and a
generic `openai-compatible-provider.ts` already exists). Grok (xAI) can technically
run *today* through the OpenAI-compatible shim — this item is about making it a
**native, first-class** provider instead: a dedicated adapter with proper support
for Grok's tool-use and streaming semantics rather than the lowest-common-denominator
OpenAI compatibility layer, so it's a real option in the switcher with quality on par
with the Anthropic path.

**Scope:**
- A native xAI/Grok implementation of the `LLMProvider` interface (auth/env,
  request shaping, streaming, tool-call wiring), registered in `models.ts` and
  constructed via `factory.ts`.
- Map the existing tool-loop contract onto Grok's tool-use format: the 12-tool
  set, forced/`auto` tool choice, the `submit_answer` JSON Schema, and the
  iteration cap — keeping the same `OakAnswer` validation seam regardless of
  provider.
- Surface Grok in the model switcher UI and document the new env/config knobs.

**Open questions:**
- Does Grok support the thinking/`tool_choice` interplay the loop relies on, or
  does the adaptive-thinking + `auto` tool-choice strategy
  (`[[tool-choice-thinking-conflict]]`) need a provider-specific variant?
- Prompt-cache parity — the byte-identical cached prefix is an Anthropic
  optimization; what's the equivalent (if any) on Grok, and does its absence
  change cost/latency assumptions?
- Re-run the golden eval suite per provider — answer quality and schema-adherence
  must hold on Grok, not just typecheck.

**Touches:** `src/agent/providers/*` (the `LLMProvider` seam — `factory.ts`,
`types.ts`, a new `grok-provider.ts`), `src/agent/models.ts` (registry),
`src/agent/runtime.ts` (provider-agnostic loop), model-switcher UI, env/config +
`.env.example`.

**Depends on:** Nothing (builds on the existing provider abstraction).

---

## B-10 — Generations 1–4 support

**Why:** The **generation-scope** feature (BUILT — see
`docs/features/generation-scope/` and `docs/agent-design/generation-scope-addendum.md`)
widened Oak's data scope from two formats to six: Gen 9 (`scarlet-violet`),
`champions`, and mainline **Gens 5–8**. It deliberately stopped at Gen 5 (GS-D1)
because Gens 1–4 predate the modern battle math the app reuses as-is: EVs/IVs +
natures (natures arrive in Gen 3; the current Gen-5-era damage formula and
`compute-stat`/`estimate-damage` assume them), the physical/special **type** split
(Gen 1–3 split damage class by type, not per move), and no Fairy type. Answering a
"gen 2" question from the Gen-5 formula would be silently wrong, so today the scope
resolver **detects** Gens 1–4 and returns an honest "not supported yet" answer
(`unsupported_generation_requested`) rather than mis-answering. This item closes
that gap.

**Scope:**
- Ingest Gens 1–4 as new `format` row-sets (`Dex.forGen(1..4)`), including the
  reduced type charts (no Dark/Steel pre-Gen 2, no Fairy pre-Gen 6) — the
  gen-provider already intersects `BATTLE_TYPE_NAMES`, so verify it holds down to
  Gen 1.
- **Formula variants** in `src/agent/formulas/` behind the active gen: the Gen-1/2
  stat formula (DVs/stat experience, no natures/EVs), the Gen-1 special stat, and
  the older damage formula + the by-type physical/special split. Keep the modern
  path intact for Gens 5–9; select per gen (the formulas are pure + test-guarded,
  so add gen-keyed variants, don't fork the tool layer).
- Per-gen prompt mechanics notes in `gen-info.ts` (no natures/abilities pre-Gen 3,
  no held items pre-Gen 2, etc.) — parity across `domain.ts` + `domain-grok.ts`.
- Extend the scope lexicon's currently-`unsupported` Gen 1–4 rules
  (`src/lib/scope/detect-scope.ts`) to resolve to real `scope` targets, and widen
  `Format`/`AgentMode`/`FORMATS` accordingly.

**Open questions:**
- How much formula divergence is worth modelling vs. flagging as an estimate? (The
  generation-scope feature chose "reuse + flag" for Gens 5–8; Gens 1–4 genuinely
  need code, not just a prompt note.)
- DV↔IV and stat-experience↔EV translation in the team builder for old-gen teams.

**Touches:** `src/data/formats.ts`, `src/agent/types.ts`,
`src/data/pkmn/gen-provider.ts`, `src/agent/formulas/*`,
`src/agent/prompts/gen-info.ts` (+ both domain bodies), `src/lib/scope/detect-scope.ts`,
ingest builders.

**Depends on:** Generation-scope feature (BUILT) — this extends it.

---

## B-11 — LLM classifier fallback for ambiguous scope signals

**Why:** Per-turn scope is resolved by a **deterministic lexicon** with **no LLM
pre-pass** (`src/lib/scope/detect-scope.ts`, GS-D3) — a conscious "precision over
recall" choice: it fires only on high-precision signals and otherwise falls back to
the conversation's sticky scope. That means genuinely ambiguous phrasings ("the old
games", "back in the DS era", an unpaired "sun") never switch scope. Every fired
signal already logs a structured `oak_scope_signal` line (matched phrase, from→to)
for exactly this tuning. If those logs show the lexicon missing real intent, a
narrow LLM classifier could be a **fallback** — run only when the lexicon returns
`null` — to catch fuzzy scope mentions the regexes can't.

**Scope:**
- A cheap, bounded classifier (small prompt, constrained output = one `Format` or
  "no signal") invoked **only** on lexicon miss, so the common path stays
  deterministic and free.
- Keep the invariant: scope is still **server-resolved and never an LLM-visible
  tool input** — the classifier runs server-side on the raw message, before the
  agent loop, and its output feeds the same precedence chain (signal > sticky >
  seed).
- Guardrails so a low-confidence classification never silently overrides an
  explicit toggle/sticky scope; surface it via the same `scope` SSE event + chip.

**Open questions:**
- Is the added latency/cost of a per-turn pre-pass worth it, or should it be gated
  to turns whose message contains a weak scope hint?
- Which model runs it (a fast/cheap tier vs. the active agent model)?

**Touches:** `src/lib/scope/*` (a new optional classifier seam),
`src/app/api/chat/route.ts` (invoke on lexicon miss), providers/models config.

**Depends on:** Generation-scope feature (BUILT); **gated on the `scope_signal`
telemetry** — only pursue if the lexicon's precision proves insufficient in
practice.

---

## B-12 — Per-generation encounter (catch-location) filtering

> **Status: ADDRESSED** — shipped as **annotate + foreground, never drop**
> (the "Open questions" filter-vs-annotate call resolved in favor of honesty
> over hard-filtering). `get_encounters` (T14) now branches on `ctx.mode`: on a
> gen-scoped turn ("gen-5".."gen-8") it stable-partitions the same grouped
> result so the active generation's groups sort first, flags every group with
> an additive `in_active_scope: boolean`, and — only when zero groups match —
> sets an additive `scope_note: string` explaining the gap. Standard and
> Champions turns are untouched (byte-identical output, no new fields). Purely
> a tool-layer change: no new tool input, no repo/stored-data change, scope
> stays server-side-only via `ctx.mode` (never LLM-visible). Prompt guidance
> (`gen-info.ts`'s per-gen `encountersNote`) was extended to tell the model to
> lead with the active gen's foregrounded games and read `scope_note` honestly.

**Why:** Encounter/catch-location data is inherently cross-game (Gen 1 →
Sword/Shield + Let's Go) and is stored under the **`scarlet-violet` format only**;
in any mainline scope `get_encounters` reads `STANDARD_FORMAT` and returns the full
grouped set (GS-D4). So a **Gen 7** turn asking "where do I catch X?" gets catch
data grouped by *every* covered game, not just Gen-7 (Sun/Moon/USUM) locations.
That's correct-but-noisy: the answer includes version groups from other
generations. A nicety would filter/emphasize the encounter groups that match the
active scope.

**Scope:**
- Filter (or sort/annotate) the `get_encounters` grouped result to the active
  format's generation — e.g. a `gen-7` turn foregrounds Sun/Moon/USUM version
  groups and de-emphasizes (or drops) the rest, without changing the stored data or
  the Champions gate.
- Decide filter-vs-annotate: hard-filtering risks an empty result for a species
  whose only catch data is off-gen; annotating ("this location is from Gen 8")
  keeps the answer honest.
- No new tool and no scope-widening input — the generation is already derivable
  server-side from `ctx.mode` (`genNumberForFormat`), so the filter stays inside
  the tool, invisible to the model's argument surface.

**Open questions:**
- Filter vs. annotate (see above) — and what to do when the active gen has no
  encounter coverage (Gen 9 / Champions already have none).
- Is this worth it before Gens 1–4 (B-10) broaden the mismatch?

**Touches:** `src/agent/tools/get-encounters.ts`, encounter repo/reference read
path, the encounters answer/prompt guidance.

**Depends on:** Generation-scope feature (BUILT).

---

## B-13 — Fix illegal proposed teams

> **Status: ADDRESSED** — root-caused from local logs (team builds died with
> `max_iterations_reached`): the runtime already roster-validates `proposed_team`
> and re-emits illegal ones (fix (b) predated this), but the model burned its
> iteration budget re-guessing and the built team was then **discarded** for a
> generic apology. Fixed three ways: (1) **runtime salvage** (`runtime.ts`
> `finalizeBestEffortOrInsufficient`) — at any give-up exit, surface the last
> schema-valid team with its legality warnings instead of discarding it (reuses
> accept-with-warnings); (2) **prompt legality guidance** in BOTH `champions.ts`
> and `domain-grok.ts` (item-clause parity for Grok + "Champions movesets differ
> from standard VGC — verify moves with the tools, but always deliver a complete
> team, never decline for uncertainty"); (3) **friendly caveat labels**
> (`answer-card/uncertainty-labels.ts`) so give-up codes read as "Couldn't
> complete this answer". Verified live: the reported query now returns a complete,
> fully-legal team.
>
> **Follow-up question ANSWERED:** the Champions `learnset` skewing ~99.9%
> `machine`-method (only 16 `level-up` rows across the whole roster — e.g.
> Incineroar lacking Knock Off / U-turn it has in SV/gen-7) is **intended
> curation, faithfully ingested — not an ingest gap.** Probed `@pkmn/mods/champions`
> directly: Incineroar's Champions learnset genuinely lacks `knockoff`/`uturn`
> while carrying `fakeout`/`partingshot`/`darkestlariat` (all sourced `9M` —
> machine, not level-up), matching what the index stores. See B-14 for the full
> characterization of the gap.
>
> **Permanent fix landed:** three complementary pieces so an illegal proposal is
> rare AND cheap to correct when it happens: (1) **T17 `get_learnset`** — a new
> read tool giving the agent forward visibility into a species' complete legal
> moveset in the active format, so it can check BEFORE proposing instead of
> discovering the problem only on rejection (`docs/agent-design/tools.md` T17);
> (2) **self-healing rejection feedback** — the server's rejection of an illegal
> `proposed_team` now embeds the offending species' legal move list, so a
> re-emit converges in one round-trip instead of the model re-guessing blind;
> (3) **prompt guidance in all three bodies** (`domain.ts`, `champions.ts`,
> `domain-grok.ts`, parity verified) — tool-routing awareness of `get_learnset`
> plus a hard rule to call it for every team member before finalizing moves, with
> a sharpened Champions-specific warning that its movesets differ substantially
> from standard VGC / other generations and building from memory WILL produce
> illegal movesets; and (4) — added after live verification showed honest builds
> exhausting the old loop budget and giving up with `insufficient_data` — a
> numbered **team-build playbook** in every body (pool-first discovery via ONE
> `query_pokedex`, batched `get_learnset` for all members, never end a build in
> `insufficient_data`) plus runtime headroom: `MAX_ITERATIONS` 14 → 20 (a legal
> 6-member build legitimately needs ~6 `get_learnset` reads Grok makes one per
> iteration) and a build-aware `SUBMIT_NUDGE` that steers a low-budget build to
> a best-effort complete submit instead of the `insufficient_data` escape hatch.
> Verified live end-to-end: the original repro query now returns a complete team
> whose 24 moves / 6 items / 6 species all check legal against the index, first
> submit, no warnings. The earlier salvage fix (commit `cde0451`) remains in
> place as a backstop for whatever still slips through.

**Why:** When the agent proposes a team via the additive `proposed_team` answer
field (B-2 / TEAM-US, BR-T8), it **sometimes proposes teams that are illegal** —
e.g. a Pokémon with a move it can't learn in the active format, an ability/item it
can't have, an out-of-format species, EV/IV spreads over the legal caps, or a
species/item-clause violation. Team **validation today is warn-but-allow**
(`validateTeam` → `TeamWarning[]`, never blocks a save) and runs on the *save* path
in the Teams builder — it does **not** gate or correct what the **agent proposes**
in chat. So an illegal proposal reaches the user unflagged, and applying it saves an
illegal team (only warned about after the fact). This item is to investigate *why*
the agent produces illegal proposals and fix it so proposals are legal (or at least
explicitly flagged as illegal at proposal time).

**Scope:**
- Investigate the failure modes: reproduce illegal proposals and characterize them
  (learnset vs. ability vs. item vs. EV/IV caps vs. species/item clause vs.
  wrong-format species), and whether the agent is skipping the legality tools
  (learnset/resolve) or reasoning past their output.
- Decide the fix altitude — likely a combination of: (a) **prompt/tooling** guidance
  so the agent verifies legality (learnset, ability, item, format) before emitting
  `proposed_team`, in **both** `domain.ts`/`champions.ts` **and** `domain-grok.ts`
  (parity is non-negotiable); and (b) **validating the proposal server-side** — run
  the existing `validateTeam` over `proposed_team` in the runtime/route and either
  surface the warnings inline with the proposal or have the agent self-correct
  (re-emit) when the proposal is illegal.
- Keep the contract intact: the agent still only **proposes**; it never writes a
  team (BR-T8). Any server-side validation is additive and must not throw in-domain.

**Open questions:**
- Fix at proposal time (make the agent produce legal teams) vs. at render time
  (surface legality warnings on the proposal so the user sees them before applying),
  or both?
- If the runtime validates `proposed_team`, does an illegal result trigger a bounded
  re-emit (like the `OakAnswer` schema re-emit loop), or just annotate?
- Are the current `validateTeam` legality checks (learnset/ability/item/clauses)
  complete enough to trust as the gate, or do they have gaps that let illegal teams
  through even on save?

**Touches:** `src/agent/prompts/{domain,champions,domain-grok}.ts` (legality
guidance), `src/agent/runtime.ts` (optional `proposed_team` validation on the
answer path), `src/data/teams/*` (`validateTeam`), `src/agent/schemas.ts`
(`proposed_team` shape), team-proposal rendering in `src/components/*`.

**Depends on:** B-2 (team building — the `proposed_team` field and `validateTeam`).

---

## B-14 — Verify Champions learnset completeness (level-up moves missing?)

**Why:** The Champions `learnset` table is **~99.9% `machine`-method**: of ~19,553
rows across the 314-mon roster, **19,530 are `machine`, only 16 are `level-up`, and 7
are `tutor`**. That means level-up moves are almost entirely absent from the Champions
index, so a Pokémon's index learnset can omit moves it clearly has in-game. Concretely,
**Incineroar lacks Knock Off and U-turn** in Champions even though it has both in
`scarlet-violet`/`gen-7`. This surfaced while fixing B-13: the agent proposes a
real-VGC-legal move, `validateTeam` rejects it as `move_not_in_learnset`, and the
proposal churns. It is unclear whether this is **intended** (Pokémon Champions genuinely
curates/restricts movesets) or an **ingest gap** (the builder only capturing TM/`machine`
sources and dropping level-up/egg/etc.).

**Scope:**
- Confirm the numbers and characterize the gap: how many species have suspiciously few
  level-up moves; spot-check well-known Champions sets against the index.
- Probe `@pkmn`: does `modDex.learnsets.get(id)` for the Champions mod actually return
  level-up sources, or only `machine`? Determine whether the data source has them at all.
- Trace the ingest: `src/data/pkmn/gen-provider.ts` `getLearnset` (returns
  `{ moveid: sourceString[] }`) and the learnset builder that writes the `method` column —
  check whether non-`machine` sources are being filtered/dropped.
- Decide: if it's a real gap, fix ingest + re-ingest; if it's intended curation, document
  it (and make sure prompts/tooling steer the agent to verify moves against the index,
  which B-13 already added).

**Touches:** `src/data/pkmn/gen-provider.ts` (`getLearnset`), the learnset ingest builder
under `src/ingest/*`, the `learnset` table (`src/data/schema.ts`), and re-ingest.

**Depends on:** (surfaced by) B-13 (illegal proposed teams).

---

## B-15 — Track whether a conversation used voice mode (admin conversations list)

**Why:** The admin panel's conversations browser has no way to tell which conversations
included a voice turn. Neither the `conversation` table nor `turn_record` currently
distinguishes voice from text chat: `/api/voice/transcript` (`src/app/api/voice/transcript/route.ts`)
calls `appendTurnPair` (`src/data/repos/conversation-repo.ts`) — the exact same
signed-in write path `/api/chat` uses, with no channel/source argument — so a
voice-originated message row is indistinguishable from a text-chat row once written.
Compounding this, none of the three voice routes (`token`/`tool`/`transcript`) ever call
`recordTurn` (`src/data/repos/usage-repo.ts`), so `turn_record` has no per-turn voice
signal to join against either. This needs new persisted state, not a derived query.

**Scope:**
- Add a `used_voice` (or similarly named) column — likely on `conversation`
  (`src/data/schema.ts`), set/upserted when `appendTurnPair` is invoked from the voice
  transcript route — since the admin list already reads `conversation` directly via
  `listAllConversations()` (`src/data/repos/admin-content-repo.ts`).
- Decide granularity: per-conversation (simpler, fits the current admin table) vs.
  per-turn (a `source` column on `conversation_message`, if the panel later wants to
  show which turns within a conversation were spoken).
- Surface it in `ConversationSummary`/`ConversationListOpts` (`src/lib/admin/admin-types.ts`)
  and add a "Voice" column/filter to `ConversationsBrowser.tsx`
  (`src/components/admin/ConversationsBrowser.tsx`, rendered by `src/app/admin/conversations/page.tsx`).
- Consider whether voice turns should also start writing `turn_record` rows (fixes the
  broader gap that voice usage is invisible to the admin analytics views, not just the
  conversations list) — that's a larger change than this item strictly needs, so scope
  it separately if pursued.

**Touches:** `src/data/schema.ts` (new column + migration), `src/data/repos/conversation-repo.ts`
(`appendTurnPair`), `src/app/api/voice/transcript/route.ts`, `src/data/repos/admin-content-repo.ts`,
`src/lib/admin/admin-types.ts`, `src/components/admin/ConversationsBrowser.tsx`.

**Depends on:** Voice mode (shipped) and the admin panel (shipped) — both already merged.

---

## B-16 — Interactive damage calculator page

**Why:** The battle-math core (`src/agent/formulas/` — `compute-stat`, `estimate-damage`,
`natures`, `type-chart`) is pure, deterministic, test-guarded, and already listed as a
portable module — but it's only reachable through a chat turn. A dedicated calculator
page (attacker/defender set, move, field state) exposes that trusted code directly,
answers the highest-frequency competitive question with zero LLM latency/cost, and pairs
naturally with chat (an "explain this calc" affordance seeds a turn with the configured
scenario).

**Scope:**
- A calculator page: pick attacker/defender (species + full set: ability, item, nature,
  EVs/IVs, Tera), move, and field modifiers; render damage rolls/percentages and KO
  chances against common defensive spreads.
- Formulas run client-side where possible (they're portable); species/move picker data
  comes from the existing repos via a thin read API (or reuses the artifact-viewer
  entity-read path).
- Format-aware via the six scopes (a Champions calc reads Champions data); prefill a
  side from a saved team slot (B-2); later, a calc result can open as an artifact (B-4)
  or seed a chat turn for "explain why".
- Gens 5–9 only until B-10 lands the old-gen formula variants.

**Open questions:**
- Full Smogon-calc modifier parity (weather, screens, every ability/item) vs. the subset
  `estimate-damage` models today — extend the formulas or scope the UI to what exists?
- Where picker data loads from: a new read endpoint vs. the artifact-viewer entity reads
  vs. a static per-format bundle.
- Does a calc become a defined artifact type so chat answers can open one pre-filled?

**Touches:** new `src/app/calc/` page + components, `src/agent/formulas/*` (possible
modifier gaps), a read endpoint over `src/data/repos/`, optionally
`src/components/answer-card/` (open-in-calc affordance); iOS/Android parity screens.

**Depends on:** Nothing hard; B-2 (team prefill) and B-4 (calc artifact) are enrichers.

---

## B-17 — Team analysis dashboard (coverage, speed tiers, threats)

**Why:** Saved teams (B-2) store full competitive sets, and the index + usage stats
(T15) hold everything needed to judge one — but the Teams page is a filing cabinet: it
renders and validates sets without evaluating them. A per-team analysis view
(type-coverage matrix, speed tiers vs. the meta, threat list) turns saved teams into an
ongoing workflow and gives the agent's in-chat team analysis a persistent, glanceable
counterpart.

**Scope:**
- A per-team analysis tab on the Teams page: defensive/offensive type-coverage matrix;
  speed-tier chart (nature/EV/item-adjusted, via the existing formulas) vs. common meta
  threats; a threat list (what beats this team, what it beats).
- Deterministic and computed from existing data — type chart + stats from repos,
  `compute-stat` for effective speed, usage data for "common threats" where it exists
  (Champions via T15 today; other formats once B-5 lands metagame data). No LLM in the
  loop; an "ask Oak about this" affordance seeds a chat turn for the reasoning layer.
- The agent's `proposed_team` render could gain the same analysis inline before the user
  applies it.

**Open questions:**
- Threat-modeling depth: static type/stat heuristics vs. usage-weighted matchup scoring
  (the latter wants B-5's metagame ingest).
- Where it computes: a server endpoint (favors three-client parity) vs. client-side from
  the portable modules.
- Is the analysis a B-4 artifact type (team sheet was already a candidate)?

**Touches:** Teams page components, a new analysis module (candidate:
`src/data/teams/analyze-team.ts` beside `validateTeam`), possibly
`/api/teams/:id/analysis`; iOS/Android parity screens.

**Depends on:** B-2 (BUILT). Usage-weighted threat scoring benefits from B-5.

---

## B-18 — Showdown replay analysis

**Why:** Oak's defining trait is reasoning on top of data, and nothing exercises it
harder than a real battle: paste a Pokémon Showdown replay URL (or raw battle log) and
have Oak narrate the turning points — damage-roll luck, missed lines, set inferences
from observed damage ("the Turn 6 Earthquake did 61%, which only a 252 Atk spread
reaches"). Showdown is already the upstream ecosystem (`@pkmn`), and the battle-log
protocol is stable and machine-readable (`@pkmn/protocol` / `@pkmn/client` exist for
exactly this).

**Scope:**
- Accept a replay URL or a pasted log in chat; fetch/parse server-side into a structured
  battle timeline (turns, moves, damage, switches, KOs).
- Surface the parsed timeline to the agent — as a new tool or a server pre-pass — which
  then reasons over it with the existing tools (sets, learnsets, formulas), so the
  analysis stays grounded, cited, and uncertainty-flagged like every other answer.
- Render as a rich answer; a per-turn drill-down on the B-4 artifact surface is the
  natural deep-dive.

**Open questions:**
- Fetching a user-supplied URL is a live network call (Oak currently has none —
  T20 `web_search` was removed): SSRF/allowlist guardrails, or ship paste-the-log-only
  first and avoid fetching entirely?
- Tool vs. context: a new read tool returning the parsed timeline, or an
  `AgentContext`-bound consume-on-turn input like `images` (server-controlled, never
  stored in history)?
- Token budget: full battle timelines are large — summarization/windowing before the
  model sees it, and how partial/old-protocol parses degrade honestly.
- Which gens/formats parse reliably first (current-gen singles/doubles are the safe
  start).

**Touches:** a new parser module (candidate `src/data/replays/`), a tool or
`AgentContext` binding + `route.ts` body field, prompt routing in
`src/agent/prompts/domain.ts`, answer/artifact rendering.

**Depends on:** Nothing hard; B-4 enriches rendering; B-5's metagame data would sharpen
set-inference claims.

---

## B-19 — Shareable answers (public read-only links)

**Why:** Answers carry reasoning, citations, and uncertainty flags — genuinely good
content — but they die in a private scroll (or a guest's in-memory session). A "share"
action that snapshots a single answer to a public read-only URL is the product's only
organic-growth-loop candidate, doubles as an SEO surface, and revives the export idea
B-3 explicitly deferred, in a lighter per-answer form.

**Scope:**
- Share one turn (question + full `OakAnswer`) as an immutable snapshot at a public
  unguessable URL (`/a/<id>`), rendered by the same AnswerCard tree; no live data reads
  on view, no auth required to view.
- Snapshot at share time into a new table; sharer can revoke/delete (signed-in);
  OG/meta tags so links unfurl well.
- Explicitly NOT whole-conversation sharing in v1 (that's B-3-export scope creep).

**Open questions:**
- Guest sharing: allowed (but then no revocation identity) or signed-in only?
- Abuse/moderation: public URLs render user-authored question text — include it or
  answer-only? Does `app/privacy/page.tsx` need updating (the admin-panel disclosure
  precedent suggests yes)?
- Retention: indefinite like history, or expiring links?
- Does a shared `proposed_team` include an "open in Oak" deep link that imports the
  team / seeds a new chat?

**Touches:** a new `shared_answer` table + repo, a public `/a/[id]` route + OG tags, a
share affordance in the answer UI, privacy-page copy; iOS/Android share sheets.

**Depends on:** Nothing hard (the snapshot model avoids B-3 coupling); B-1 for revocable
ownership.

---

## B-20 — Playthrough companion / catch tracker

**Why:** oak-v2 built the whole-games data surface (all-gen scopes, `search_wiki`
walkthrough/location content, `get_encounters`) but the product framing is still
competitive-first. A lightweight per-account playthrough tracker — which game I'm
playing, story progress, which Pokémon I've caught, current party — lets the agent
answer the questions a mid-playthrough player actually has ("what should I do next",
"what can I catch on this route that I don't already have", "is my team ready for the
next gym") against *their* save state instead of generically.

**Scope:**
- A per-account playthrough record: game/version, story checkpoint, caught/owned species
  checklist, current party (reusing the team data model where it fits — levels and
  mid-game movesets, not competitive spreads).
- Manual entry/upsert UI in v1 (no save-file import); the caught checklist
  cross-references per-game encounter data (a Living Dex tracker falls out of this
  nearly for free).
- Agent read access mirrors the active-team pattern: server-bound context or a no-arg
  read tool — never an LLM-writable surface; the agent suggests, the user records.
- Nuzlocke ruleset support (per-route first-encounter tracking, faint-is-gone) as a v2
  nicety — a beloved community use case that fits the games-only scope.

**Open questions:**
- One active playthrough per game vs. many named runs (mirroring teams)?
- Tool surface: a new no-arg read tool (append-only barrel, cached-prefix rules) vs. an
  `AgentContext` binding like `activeTeam` — and should the active playthrough's game
  drive scope resolution automatically (interplay with `detect-scope.ts` + sticky
  scope)?
- How encounter-data gaps degrade (Gen 9/Champions have no encounter coverage; Gens 1–4
  unsupported until B-10).
- Three-client parity cost — this is a whole new surface on web, iOS, and Android.

**Touches:** new tables + repo (`playthrough`), `/api/playthroughs/*` routes, a frontend
section, `AgentContext` or a new tool + prompt routing in `domain.ts`, scope-resolution
interplay; iOS/Android parity screens.

**Depends on:** B-1 (per-account). B-10 broadens gen coverage; B-12 sharpens encounter
answers.

---

## B-21 — Live competitive battle UI

**Why:** B-5's competitive surface (BUILT, layers 1–3) covers browsing the metagame —
tiers, usage stats, sample sets — but says nothing about the moment that matters most: an
actual live match. This item is B-5's originally-scoped **layer 4**, split out on its own
because it's a fundamentally different kind of build (real-time, stateful, latency-bound)
rather than another reference page. The product is a **friendly, real-time battle
co-pilot** that sits beside a live competitive match: after each turn resolves, it explains
what happened in plain language with the exact numbers behind it, recommends the next
move with supporting stats, and maintains a live scouting sheet of everything the opponent
has revealed or that can be inferred (speed bounds from turn order, EV spreads back-solved
from damage rolls, Choice-lock tells, etc.) — all within Showdown's turn clock. It is
explicitly **not** an autonomous bot; the human plays, the UI assists.

There is a standing exploration doc that already carries the product definition and the
architecture work: `docs/research/live-competitive-battle-ui.md`. It agrees the state
source is **`ps-local`** (a self-hosted Pokémon Showdown server) read over its sim
protocol (`@pkmn/protocol` parsing → `@pkmn/client` authoritative battle state), and lays
out **two independently-prototyped directions**, deliberately not compared or decided
between yet:

- **Direction A — fully deterministic engine.** No model in the loop:
  `@pkmn/protocol` + `@pkmn/client` for state, a scouting engine that infers hidden
  information by rule (speed bounds, damage-roll back-solving, item/ability tells, usage-
  prior set prediction), a `@smogon/calc` sweep over every legal action for the upcoming
  turn, a recommendation engine (heuristic eval first, a shallow expectiminimax search as
  an upgrade), and templated natural-language narration. Wins on latency (sub-millisecond
  against a turn clock measured in seconds), exactness (numbers can never disagree with
  what Showdown itself computes), and zero per-turn marginal cost.
- **Direction B — per-turn LLM agent.** Reuses Oak's existing agent-runtime patterns: a
  deterministic state assembler turns the `@pkmn/client` state into a compact per-turn
  snapshot (field, both teams, revealed-info sheet, legal actions, and a
  **pre-computed damage-calc table** so the model rarely needs a tool round-trip), then a
  battle-specific tool subset (`damage_calc`, `usage_lookup`/`set_predictor`,
  `speed_check`, `legality` — a new, parallel tool set that deliberately does not have to
  honor the fixed chat-agent tool contract) feeds a tool-loop turn emitting a
  `BattleTurnAnalysis` schema (a battle-shaped sibling of `OakAnswer`: what happened,
  revealed-info updates, a recommendation with rationale/KO-chance/risk, confidence,
  citations, inference flags), Zod-validated with the same re-emit-on-failure fallback.
  Wins on producing exactly the kind of natural-language, contextually-judged explanation
  ("why not switch here", win-condition/momentum reasoning) the product wants, and reuses
  the platform's existing "reason on top of grounded data" machinery. The hard part is the
  latency stack needed to stay inside a live turn clock: prompt-caching the static prefix,
  the pre-computed calc table, token streaming to the HUD, a speculative start the instant
  the turn resolves in the protocol stream, a fast/bounded-reasoning model tier, and a
  graceful-degradation fallback (show the pre-computed calc table if the analysis is still
  pending near the clock).

**Scope:** As detailed in `docs/research/live-competitive-battle-ui.md` — a live HUD
(field state, scouting-sheet badges, turn log, recommendation panel) for both Singles and
Doubles, backed by whichever direction the prototype phase selects (or a hybrid). The next
step per that doc is unchanged: **prototype both directions independently against
`ps-local`, then decide** — this backlog item does not pre-select one.

**Open questions:** All carried from the research doc — exactly which `ps-local`
endpoints/streams are needed for live battles vs. replays; how a self-hosted live server is
reached at runtime without violating the "no network at ingest" guarantee that governs
`npm run ingest` (B-5's `sync:meta` is a narrow, declared exception for monthly usage
sync — a live battle socket is a different, runtime-only concern); HUD design for both
Singles and Doubles including how inferred ranges are shown without clutter; which ruleset
(VGC/BSS/Smogon tier) is wired through first; for Direction B specifically, real p95 turn
latency under the tightest clocks (notably Doubles) and whether the battle agent shares
`src/agent/tools/` or gets its own parallel set.

**Touches:** a new server-side `ps-local` websocket bridge (Node route, long-lived
connection per active battle), new deterministic modules under `src/battle/` (Direction A)
and/or a new battle-agent mode + tool subset + prompt prefix + `BattleTurnAnalysis`
renderer (Direction B), a new live-battle HUD surface; `@pkmn/protocol`, `@pkmn/client`,
`@smogon/calc` as new dependencies.

**Depends on:** B-5 layers 1–3 (BUILT) — `meta_usage`'s stored Smogon usage priors now
exist and feed both directions' set-prediction/scouting work. This is a **new surface
outside the chat agent's fixed tool contract** (`docs/agent-design/tools.md`), not an
extension of it — it does not touch the 20-tool chat contract and is free to define its
own tools/schema.

---

## B-22 — Fix the two failing admin cost-sorting oracle tests on `develop`

**Why:** Two admin read-repo tests fail on `develop` and have for a while — every full
`npm test` run reports 2904/2906 with these two as the standing failures:

- `src/data/repos/admin-analytics-repo.oracle.test.ts` → "ranks by estimated cost"
- `src/data/repos/admin-content-repo.oracle.test.ts` → "sorts by the heavy-user metrics
  (turns, errors, cost)"

Both seed three fixture accounts ("ash" grok-heavy, "brock" claude, "misty" gpt) and pin
the order the admin dashboard ranks them in when sorted by **estimated cost**; the actual
ranking comes back different. The failures predate B-5 (verified identical on clean
`develop` during that merge gate, 2026-07-05) and were first noted during the Redis
state-tier work. **Likely root cause:** commit `732171d` ("admin: reconcile model pricing
to real provider rates") changed `MODEL_PRICING` (`src/server/admin/pricing.ts`) without
re-deriving the tests' expected orderings — the relative estimated cost of the
grok-heavy vs. claude fixture accounts plausibly flipped.

**Scope:**
- Root-cause which side is stale: recompute the three fixture accounts' estimated costs
  by hand from the current `MODEL_PRICING` table and the fixtures' token counts.
- If the pricing table is correct (it was just reconciled to real rates), fix the two
  test pins to the correctly-derived order — with the arithmetic shown in a comment so
  the next pricing change updates them consciously.
- If instead the pricing reconciliation itself is wrong (units, per-1M vs per-1K, or a
  swapped input/output rate), fix `pricing.ts` — that would mean the admin cost
  dashboard is currently showing wrong estimates, which is the actually-important
  outcome to rule out (ADMIN-BR-5 says cost is an estimate, not that it's mis-scaled).
- Get `npm test` to a true 2906/2906 so future merge gates don't need a
  "known-failures" carve-out.

**Open questions:**
- None of substance — this is a bounded diagnose-and-fix.

**Touches:** `src/data/repos/admin-analytics-repo.oracle.test.ts`,
`src/data/repos/admin-content-repo.oracle.test.ts`, possibly
`src/server/admin/pricing.ts` (only if the reconciliation itself is wrong).

**Depends on:** Nothing.
