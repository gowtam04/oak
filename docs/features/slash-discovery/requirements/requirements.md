# Slash discovery — Business Requirements

> Product discovery for composer slash **discovery** (picker, arg
> complete, `/help`). This is a **delta on existing chat slashes**, not a
> new product and not a second query language.
>
> IDs are namespaced `SD-` so they do not collide with Chat QoL
> (`SLASH-*`) or Calc (`CALC-*`). IDs are stable: append, never
> renumber.
>
> **No application code ships from this document.** Next step after
> approval is `/architecture-blueprint`.

## Overview

Oak already intercepts a few **leading** composer tokens and hops to
surfaces that already exist: `/new`, `/team`, `/dex`, `/usage`, `/calc`.
A handled slash is not a chat turn. Unknown slashes (and mid-sentence
`/word`) send as ordinary questions.

Those hops are invisible until Send. Type `/` and nothing appears —
unlike `@` for saved teams. Keyboard-first users, and anyone coming from
Showdown / Discord, never learn the hops exist. Native clients have no
`⌘K` palette, so the composer is the only typed jump.

This pack adds **discovery in the composer**: a `/` picker, name
complete for Dex / Teams / Usage, and `/help` as the same list. It does
**not** add a Discord-bot catalog, expose agent tools, or teach commands
as the default way to talk to Oak.

### Why it exists

The cost of the status quo is unused hops and wasted turns: people type
questions the calculator already answers, or never reach Dex / Usage /
Teams from the box they are already in.

### Goals

- Typing `/` at the start of the composer shows every handled slash
  with a one-line hint.
- Picking a row **inserts** text; Send still hops. Same class as
  `@mention`.
- After a known command and a space, Dex / Teams / Usage complete
  against real names. `/calc` rest stays free-typed.
- `/help` is a local cheat sheet (the same picker), not a model turn.
- Unknown slashes still ask Oak. Handled slashes still never POST
  `/api/chat`.
- The `Ask Oak` placeholder and the empty desk do **not** grow a slash
  tutorial.

### Success criteria

- A guest or signed-in user who types `/` as the leading token sees the
  six commands below, can insert one, and on Send reaches that surface
  with **no** user/assistant pair and **no** completed ask.
- `/dex garchomp`, `/team {saved name}`, and `/usage garchomp` open the
  matching entity/team/species page when the name resolves; a bad name
  still hops to that surface’s index or empty state, never a chat turn.
- `/foo`, `please open /dex`, and `/newish` still send as normal
  messages.
- A lone `/` (optional surrounding space) does not start a turn; the
  picker stays open.
- The same picker and hops ship on **web, iOS, and Android**. Web
  `⌘K` / shortcut overlay are unchanged and stay web-only.

### Current vs desired

| Today | This pack |
|---|---|
| Slashes fire only on Send | `/` opens a picker; Send still hops |
| No `/help` | `/help` is a handled slash that shows the picker |
| `/usage {name}` args ignored on web/Android (iOS already forwards a slug) | All three clients open that species’ Usage page when the name resolves; else Usage index |
| `/DEX` / `/Dex` is unknown text | Command tokens match case-insensitively |
| Sending `/` is a chat turn | Sending `/` does not POST; picker stays |
| Composer placeholder `Ask Oak`; empty desk starters | Unchanged — no always-on slash chrome |

### Relation to existing packs

This pack **does not reopen** Chat QoL recovery, mentions, chips,
palette, or empty-desk recents. It **extends** Chat QoL `SLASH-US-1`
and Calc `CALC-US-3`.

**Supersedes:**

- Chat QoL **SLASH-AC-1.5** only for a composer that is exactly `/`
  (optional whitespace): that is no longer a message (**SD-AC-7.1**).
  Other unknown slashes stay messages.
- Chat QoL **SLASH-BR-1** / Calc note that `/calc` is unknown — already
  superseded by Calc **CALC-AC-3.4**; this pack keeps `/calc` handled.
- The implicit product that slashes have no in-composer UI.
- Web/Android behavior that `/usage` always opens the leaderboard and
  ignores a species argument.

**Unchanged:**

- **SLASH-BR-2** — a handled slash is not a chat turn.
- **SLASH-AC-1.6** — mid-sentence `/word` is a message.
- **CALC-US-3** — `/calc` rest prefills the overlay; unresolved tokens
  still open it; no error toast that blocks opening.
- Edit last does not intercept slashes (existing Chat QoL recovery).
- Command palette and keyboard shortcut overlay remain web-only
  (**NAV-BR-1**). This pack does not add palette entries or chords.

### Handled commands (this pack)

| Token | Hop | Arg complete? |
|---|---|---|
| `/new` | New empty chat | No. Extra words still start a new chat (today’s leading-token rule). |
| `/team` | Teams, or that saved team if the name matches one of mine | Yes — signed-in saved team names. |
| `/dex` | Dex index, or that entity if it resolves | Yes — Champions species, moves, abilities, items. |
| `/usage` | Usage leaderboard, or that species’ Usage page if it resolves | Yes — species only. |
| `/calc` | Calculator overlay (current thread); rest may prefill | Yes — sequential species → move → species (SD-US-10). |
| `/help` | Composer becomes `/`; picker shows every command | No. |

Guests: `/team` still hops to the existing guest Teams / sign-in empty
state. `/new`, `/dex`, `/usage`, `/calc`, `/help` work without an
account.

## Users and personas

No new roles. Inherited from Chat QoL: **guest** vs **signed-in**.

| Persona | What they get |
|---|---|
| **Guest** | Full picker; `/team` listed (hop to guest Teams); after `/team ` an empty “sign in to save teams”; Dex / Usage / Calc / New / Help. No team **name** rows. |
| **Signed-in** | Everything a guest gets, plus `/team ` completes against **their** saved teams. |
| **Operator** | No new admin surface. Hops are not model turns and are not completed asks. |

Voice users are out of this pack: spoken turns are not slash-parsed.

## User stories

### SD-US-1 — See commands when I type `/`

As a guest or signed-in user, I want a picker when the composer starts
with `/` so that I can discover hops without leaving the box.

- **SD-AC-1.1** — Given the composer is empty or only leading
  whitespace, when I type `/` as the first non-space character, then a
  picker lists exactly these rows, each with its hint: `/new` (New empty
  chat), `/team` (Open Teams; guests append “sign in to save” on that
  hint), `/dex` (Open Dex), `/usage` (Open live usage), `/calc` (Open
  calculator), `/help` (Show these commands).
- **SD-AC-1.2** — Given I type a prefix of a command token (`/`, `/d`,
  `/de`, `/dex`), when the picker is open, then only commands whose
  token **starts with** that prefix (case-insensitive) remain. `/newish`
  matches **no** command (`/new` does not start with `/newish`).
- **SD-AC-1.3** — Given no command prefix-matches the current first
  token (example: `/foo`, `/newish`), when I continue typing, then the
  picker **hides**. There is no “unknown command” toast.
- **SD-AC-1.4** — Given the composer text is not a **leading** slash
  (example: `please /dex`, `what about /team later`), when I type,
  then the picker does not open.
- **SD-AC-1.5** — Given the picker is open, then a short caption on the
  picker reads **Insert, then send**. The composer placeholder stays
  `Ask Oak`. The empty desk does not mention slashes.

### SD-US-2 — Pick inserts; Send hops

As a guest or signed-in user, I want picking a row to insert text so
that I can add a name or rest before Send.

- **SD-AC-2.1** — Given I pick `/dex`, `/team`, `/usage`, or `/calc`
  from the command list, when the pick commits, then the composer
  becomes that token plus a **trailing space** (example: `/dex `). Send
  has not happened. The picker switches to the arg phase for Dex /
  Teams / Usage, or stays without name rows for `/calc`.
- **SD-AC-2.2** — Given I pick `/new` or `/help`, when the pick
  commits, then the composer becomes exactly `/new` or `/help` with
  **no** required trailing space. Send has not happened.
- **SD-AC-2.3** — Given I pick a **name** row (Dex entity, saved team,
  or usage species), when the pick commits, then the composer is the
  command plus that row’s **display name** (example: `/dex Garchomp`).
  Send has not happened.
- **SD-AC-2.4** — Given the composer is a handled slash and I am **not**
  editing the last user message, when I Send (or tap the Send control),
  then the existing hop runs, the slash is not stored as a user
  message, and no model turn starts.
- **SD-AC-2.5** — Given I am editing the last user message, when the
  text is a handled slash, then it is **not** intercepted. It recovery-
  POSTs like any other edit (existing Chat QoL).

### SD-US-3 — Complete names for Dex, Teams, Usage

As a guest or signed-in user, I want name suggestions after a known
command and a space so that I do not have to remember slugs.

- **SD-AC-3.1** — Given the first token is a known command, when there
  is **no** space after that token yet (`/dex`, `/DEX`), then the
  picker stays in the **command** phase (filtered command rows only).
- **SD-AC-3.2** — Given the composer is `/dex ` plus an optional query,
  when the picker is in the arg phase, then rows are Champions Dex
  matches for **species, moves, abilities, and items**. Each row shows
  display name and **kind**. At most **8** name rows. Query match is
  case-insensitive substring on the display name (same class as `@`
  team filter).
- **SD-AC-3.3** — Given the composer is `/usage ` plus an optional
  query, when the picker is in the arg phase, then rows are Champions
  **species** only (Usage drill-in is species). At most **8** rows.
- **SD-AC-3.4** — Given I am signed in and the composer is `/team `
  plus an optional query, when the picker is in the arg phase, then
  rows are **my** saved teams whose names contain the query
  (case-insensitive). At most **8** rows. Archived vs living follows
  the existing Teams list the user can open (living teams are
  completable; do not suggest teams I cannot open as living).
- **SD-AC-3.5** — Given I am a guest and the composer is `/team `
  (with or without more text), when the picker would show names, then
  there are **no** team rows; an empty line reads that I need to
  **sign in to save teams**. The `/team` command itself remains listed
  in the command phase (**SD-AC-6.1**).
- **SD-AC-3.6** — Given I am signed in with zero saved teams and I type
  `/team `, when the arg phase opens, then an empty line reads that
  **no saved teams** match (or none exist). Send still opens Teams
  (**SD-AC-5.4** analog).
- **SD-AC-3.7** — Given `/dex zzq` / `/usage zzq` / `/team zzq` matches
  no names, when the arg phase is open, then the picker shows a single
  empty line (**No Dex matches** / **No usage matches** / **No saved
  teams match**) — not a toast, not a hidden picker. Send still hops
  (**SD-US-5**).
- **SD-AC-3.8** — Given `/new ` / `/help ` with extra words, when I
  look for name rows, then there are none. Extra words on `/new` and
  `/help` do not open a name list. `/calc ` is sequential slots
  (**SD-US-10**), not a rest phase.

### SD-US-4 — `/help` is the same picker

As a guest or signed-in user, I want `/help` to show the command list
without asking Oak.

- **SD-AC-4.1** — Given I Send `/help` (any command-token casing, optional
  surrounding whitespace, no requirement on extra words), when it is
  handled, then **no** chat turn starts and **no** extra sheet or
  thread card appears. The composer becomes `/` and the picker shows
  every command row with hints (**SD-AC-1.1**).
- **SD-AC-4.2** — Given I pick `/help` from the picker, when the pick
  commits, then the composer is `/help` (insert, not send). A following
  Send follows **SD-AC-4.1**.
- **SD-AC-4.3** — `/help` is a **handled** slash: it must not consume a
  completed ask or write a user/assistant pair (**SD-BR-2**).

### SD-US-5 — Send hops, including Usage species

As a guest or signed-in user, I want Send of a handled slash to open
the right surface so that a resolved name is not discarded.

- **SD-AC-5.1** — `/new` starts a new empty chat (same as New chat).
- **SD-AC-5.2** — `/dex` with no argument opens Dex index.
- **SD-AC-5.3** — `/dex {name}` when the name **resolves** in Champions
  Dex opens **that entity’s Dex page** (the correct section for its
  kind: Pokémon, move, ability, or item — not always the species
  section). If I **picked** a name row this composer session and have
  not edited the name since, Send opens **that row’s** entity even when
  another kind shares the display name (example: Metronome the move vs
  Metronome the item). If I typed the name without a pick, or edited
  after a pick, resolve in section order **Pokémon → move → ability →
  item**; first hit wins.
- **SD-AC-5.4** — `/dex {name}` when nothing resolves opens Dex index
  or the existing Dex not-found empty — **not** a chat turn and not an
  error toast that blocks the hop.
- **SD-AC-5.5** — `/team` opens Teams. `/team {name}` opens that team
  when the name matches one of mine (case-insensitive, existing rule);
  otherwise the Teams list. Guests always get the guest Teams /
  sign-in empty, even with extra words.
- **SD-AC-5.6** — `/usage` with no argument opens the Usage
  leaderboard (that client’s existing default ladder, Doubles unless
  the user already switched).
- **SD-AC-5.7** — `/usage {name}` when the name resolves as a Champions
  **species** opens that species’ Usage drill-in on **web, iOS, and
  Android**. When it does not resolve as a species (unknown token,
  a move name, `ou`, …), open the Usage **index**, not a chat turn.
- **SD-AC-5.8** — `/calc` and `/calc {rest}` open the calculator overlay
  on the current conversation and prefill per **CALC-AC-3.1–3.3**. No
  chat turn.
- **SD-AC-5.9** — A handled slash with images still attached does **not**
  start a turn and does **not** consume those images; they stay on the
  composer.

### SD-US-6 — Guests still see `/team`

As a guest, I want `/team` in the picker so that the list matches hops
that already work.

- **SD-AC-6.1** — Given I am a guest, when the command-phase picker is
  open, then `/team` is listed. Hint includes that Teams will ask me to
  sign in to save.
- **SD-AC-6.2** — Given I am a guest and I Send `/team` or `/team
  anything`, when it is handled, then the existing guest Teams empty /
  sign-in state opens. It is not a chat turn.

### SD-US-7 — Lone `/` does not ask Oak

As a guest or signed-in user, I want sending only `/` to keep the
picker, not burn a turn.

- **SD-AC-7.1** — Given the composer text trims to exactly `/`, when I
  Send, then no chat turn starts, no user message is stored, and the
  picker remains open on the full command list. The composer stays `/`
  (or equivalent leading `/` that keeps the picker visible).
- **SD-AC-7.2** — Given the composer is `/foo` (unknown) or `/compare`,
  when I Send, then it is a **normal user message** (Chat QoL
  **SLASH-AC-1.5** except for **SD-AC-7.1**). No error toast; text is
  not stripped.

### SD-US-8 — Keyboard on web; tap on native

As a web user, I want arrows and Enter to drive the picker without
accidentally sending.

- **SD-AC-8.1** — Given the picker is open on **web**, when I press
  ArrowDown / ArrowUp, then the highlighted row moves. Home/end or
  wrapping is an implementation choice; there is always at most one
  highlighted row when rows exist.
- **SD-AC-8.2** — Given a row is highlighted on web, when I press
  **Enter**, then that row is **inserted** per **SD-US-2**. The hop
  does **not** run. A following Enter after insert may send if the
  picker is no longer capturing Enter (example: `/new` with no arg
  phase) — after a command that opens an arg phase, Enter inserts
  again rather than sending until I use **Send**.
- **SD-AC-8.3** — Given the picker is open, when I activate the
  composer **Send** control, then Send uses the **current composer
  text** (it does not first insert the highlighted row). Lone `/`
  still follows **SD-AC-7.1**.
- **SD-AC-8.4** — Given the picker is open on web, when I press
  **Escape**, then the picker closes and the composer text is
  unchanged.
- **SD-AC-8.5** — Given I click/tap outside the picker (and not on a
  row), then the picker closes and the text is unchanged.
- **SD-AC-8.6** — On **iOS and Android**, a tap on a row inserts
  (same as pick). There is no command palette and no requirement for
  hardware-keyboard chords. A platform back / tap-outside dismisses
  like **SD-AC-8.4/8.5**.

### SD-US-9 — Three-client lockstep

As a player, I want the same slash discovery on web, iOS, and Android.

- **SD-AC-9.1** — Given any story in this file except web-only keyboard
  chords (**SD-AC-8.1–8.4**), when the pack ships, then web, iOS, and
  Android all behave that way in the **same change**.
- **SD-AC-9.2** — Native still has **no** `⌘K` palette. This pack does
  not add one.

## Primary workflow (happy path)

1. Focus the chat composer (empty thread or mid-thread).
2. Type `/`. Picker opens above the composer with six command rows and
   the caption “Insert, then send.”
3. Type `de`. Only `/dex` remains.
4. Enter or tap `/dex`. Composer is `/dex `. Picker shows Dex names
   (species / moves / abilities / items).
5. Type `gar`. At most eight matches; Garchomp highlighted.
6. Enter or tap Garchomp. Composer is `/dex Garchomp`.
7. Send. Dex opens on Garchomp. Composer clears (or follows that
   client’s existing post-slash clear). No SSE turn, no rate-limit
   completed ask, no history pair.

### Named failure, edge, empty, conflict, and deny states

| State | Behavior |
|---|---|
| Prefix matches no command (`/foo`) | Picker hides. Send is a normal message. |
| Arg matches no names | Empty line in picker. Send hops to that surface’s index / not-found / guest Teams. |
| Mid-sentence `/dex` | Not a leading slash. No picker. Send is a message. |
| `/newish`, `/calcish` | Not exact command tokens. Picker hides once they are the first token. Send is a message. |
| Lone `/` Send | No turn. Picker stays. |
| Edit last | Slashes are not intercepted. |
| Guest `/team ` | Empty “sign in to save teams.” Send opens guest Teams. |
| Signed-in, no teams, `/team ` | Empty “no saved teams.” Send opens Teams. |
| Name in two Dex kinds, **picked** | Send opens the picked kind. |
| Name in two Dex kinds, **typed** | Pokémon → move → ability → item. |
| `/usage earthquake` (a move) | Usage index (not a species). |
| `/usage garchomp` | Species Usage drill-in on all three clients. |
| Attached images + handled slash | Hop; images remain on the composer. |
| Turn in flight | Existing rule: Send is ignored unless this is Edit (which Stops first). Picker may still appear if the composer is usable. |
| Voice session | Out of pack; transcripts are not slash-parsed here. |

## Business rules

- **SD-BR-1 — Leading token only.** A slash command is the first
  whitespace-delimited token after optional leading whitespace. Exact
  command match on Send (case-insensitive). `/newish` is not `/new`.
- **SD-BR-2 — Handled slash is not a chat turn.** It must not POST
  `/api/chat`, must not write a user/assistant pair, and must not
  consume a completed ask. Applies to `/new`, `/team`, `/dex`,
  `/usage`, `/calc`, `/help`, and lone `/`.
- **SD-BR-3 — Unknown slashes are text** except lone `/` (**SD-AC-7.1**).
  No error toast; do not strip the `/`.
- **SD-BR-4 — Command tokens are case-insensitive.** `/Dex`, `/DEX`,
  and `/dex` are the same command. Inserted tokens may use the
  canonical lowercase spelling `/dex`. Display names keep the entity’s
  normal casing.
- **SD-BR-5 — Picker filter is prefix-on-command.** A command row
  remains when `commandToken.startsWith(typedFirstToken)`
  (case-insensitive). Name rows use substring match on display name.
- **SD-BR-6 — Space starts the arg phase** for `/dex`, `/team`,
  `/usage`, and `/calc`. `/new` and `/help` never show name rows.
- **SD-BR-7 — Pick inserts; Send hops.** Picker never navigates by
  itself except that sending `/help` or lone `/` only reshapes the
  composer/picker (**SD-AC-4.1**, **SD-AC-7.1**).
- **SD-BR-8 — Edit last does not intercept** handled slashes.
- **SD-BR-9 — No always-on discovery chrome.** Do not change the
  composer placeholder, empty-desk copy, or filed starters for this
  pack. Caption lives **on the open picker**.
- **SD-BR-10 — At most eight name rows** in an arg-phase list. Commands
  are the six in **SD-AC-1.1**; do not cap those below six when they
  all match.
- **SD-BR-11 — Unresolved args still hop** to the command’s surface
  (Dex empty/index, Teams list, Usage index). They do not become
  questions.
- **SD-BR-12 — Usage args are species only.** A resolved species opens
  drill-in; anything else (including ladder words like `ou`) opens the
  Usage index.
- **SD-BR-13 — Guests see `/team`** in the command list. They never see
  another account’s teams. They cannot mention teams (existing
  **MEN-BR-4**).
- **SD-BR-14 — superseded by SD-US-10.** `/calc ` is a three-slot arg
  phase (attacker species, move, defender species). Send remains legal
  at any slot. Items, abilities, EVs, and weather are not slash-completed.
- **SD-BR-15 — Three-client lockstep** for every user-facing behavior
  in this pack except web Enter/Arrow/Escape (**SD-US-8**). Palette
  remains web-only and unchanged.
- **SD-BR-16 — Web Enter inserts; Send sends the box.** Enter does not
  hop while it is accepting a highlighted picker row.
- **SD-BR-17 — Dex kind order for unpicked names:** Pokémon, then
  move, then ability, then item. A pick binds that entity until the
  name text is edited.
- **SD-BR-18 — `/help` is not a thread card** and not a second overlay.
  It is the command-phase picker with composer `/`.
- **SD-BR-19 — Do not teach a second query language.** Do not add
  `/dt`, `/weak`, `/learn`, `/get_pokemon`, or tool-named slashes in
  this pack.

### SD-US-10 — Sequential `/calc` slots

As a guest or signed-in user, I want `/calc` to suggest attacker, move,
and defender the way `/dex` suggests names so I do not have to know
`Attacker Move vs Defender`.

- **SD-AC-10.1** — Given I pick `/calc` or type `/calc `, when the
  picker is open, then it shows Champions **species** (attacker slot)
  and the caption **Pick attacker · or Send to open empty**.
- **SD-AC-10.2** — Given I pick an attacker, when the pick commits, then
  the composer is `/calc {Name} ` and the picker shows **moves** plus a
  pinned **vs …** skip-move row. Caption **Pick move · or Send**.
- **SD-AC-10.3** — Given I pick a move, when the pick commits, then the
  composer is `/calc {Attacker} {Move} vs ` (the picker inserts `vs`).
  Caption **Pick defender · or Send**. Rows are species.
- **SD-AC-10.4** — Given I pick **vs …**, when the pick commits, then
  the composer is `/calc {Attacker} vs ` with no move. Defender slot
  opens.
- **SD-AC-10.5** — Given I Send at any slot (including empty `/calc`),
  when it is handled, then the calculator overlay opens on this thread
  with whatever sides resolved. Unresolved sides stay empty. No chat
  turn (**CALC-AC-3.1–3.3**, **CALC-BR-4**).
- **SD-AC-10.6** — Given I type rest without picking (including
  multi-word names), when I Send, then the client resolves against
  Champions search with longest-prefix match, not first-token split.
- **SD-AC-10.7** — Slash does not complete items, abilities, natures,
  EVs, or weather. Those stay on the overlay.

## Data and entities (business level)

No new stored entity. No new `OakAnswer` field. No new account
preference.

| Concept | Role in this pack |
|---|---|
| **Composer text** | Source of leading-token parse (existing) plus picker phase. |
| **Handled command** | One of the six tokens. Not persisted. |
| **Picker row** | Ephemeral: a command (token + hint) or a name (display name, kind, identity). |
| **Bound Dex entity** | Turn-local, composer-local: set when a Dex name row is picked; dropped if the name text changes. Same class of “bind what I picked” as `@mention`, but it is **not** sent to the agent (handled slashes never start a turn). |
| **Champions Dex entity** | Existing species / move / ability / item on the current regulation roster. |
| **Usage species** | Existing live Usage drill-in identity (species slug). |
| **Saved team** | Existing account-owned team; living teams are completable. |

Lifecycle: picker rows exist only while the composer shows a leading
`/`. Binds die when the composer clears, the name is edited, or the
user navigates away.

Ownership: team names are the signed-in user’s. Dex and Usage names
are public Champions data (guests included).

## Auth and permissions

No new auth method. Guest vs signed-in only.

| Capability | Guest | Signed-in |
|---|---|---|
| Command-phase picker | Yes | Yes |
| `/new` `/dex` `/usage` `/calc` `/help` | Yes | Yes |
| `/team` in the list and hop | Yes (guest Teams / sign-in) | Yes (Teams) |
| Team **name** complete | No | Own teams only |
| Dex / Usage name complete | Yes (public index) | Yes |
| Palette / shortcut overlay | Web only, unchanged | Web only, unchanged |

Deny: a guest never sees another user’s teams in the picker. A
signed-in user never sees another account’s teams (existing Teams
scoping).

## UI / UX vision

- **Tone.** Same Enamel / paper chat chrome. No AI sparkle, no new
  mascot, no CLI tutorial on the empty desk. Labels stay verbs and
  surface names.
- **Placement.** Picker attaches to the composer, same neighborhood as
  `@` team autocomplete (above the field on all three clients).
- **Density.** Command rows: token + one-line hint. Name rows: display
  name + kind (and team name only for `/team`). Optional species
  sprite is allowed if Dex/mention already show one; not required.
- **Caption.** “Insert, then send” on the open picker only.
- **Placeholder.** `Ask Oak` unchanged.
- **Empty desk / starters.** Unchanged.
- **Responsive.** Compact (native and mobile web) and desktop web: the
  picker must not cover the only Send control in a way that prevents
  Send; it may scroll internally if eight name rows do not fit.
- **Accessibility.** Picker is a listbox (or platform equivalent).
  Rows are options. Web highlight follows arrow keys. Accessible name
  “Slash commands.” Do not announce a failure when the picker hides
  for `/foo`.
- **Reference.** `@` mention list for attachment and empty copy;
  team-builder entity picker for arrow / Enter / Escape (web).

## Non-functional requirements

- **Platform.** Web, iOS, Android in the **same change** for
  user-facing slash discovery. Web-only: arrow/Enter/Escape as
  specified. No new native palette.
- **Performance.** Command-phase filtering is instant (six rows).
  Name suggestions must feel like existing Dex / mention typeahead
  (no full-page wait). A hop must not open a model stream.
- **Reliability.** A failed Dex/Usage lookup for suggestions must not
  block typing or Send. If names cannot load, show the arg-phase empty
  line and still hop on Send (**SD-BR-11**).
- **Privacy.** Team names in the picker are the user’s. Do not leak
  other accounts. Dex/Usage lists are public Champions data.
- **Rate limit / cost.** Hops and `/help` and lone `/` are not
  completed asks. Do not invent a second limiter.
- **Scale.** Personal-account volume. Picker is not a global search
  product.
- **Voice.** Out of pack.
- **Compliance.** No new personal data stored. Account deletion
  unchanged (saved teams already go away; picker has nothing of its
  own to delete).

## Constraints and preferences

- Existing Oak stack and three clients. Do not add a second app or a
  second agent.
- Do not change the 17-tool barrel, `OakAnswer`, or Champions-only
  policy.
- Do not add server-side slash dispatch that skips `submit_answer` for
  questions. Slashes in this pack are **client hops**.
- Reuse existing Dex, Teams, Usage, and Calc destinations. Do not add
  a Compare page or new surfaces.
- Keep Chat QoL three-client lockstep for this UI class (composer
  discovery is not web-only).
- Technical preference: leading-token parse stays a **client**
  classifier (Chat QoL ADR-10). This pack does not require a new HTTP
  resource unless architecture needs one for name search that already
  exists for Dex/Teams.

## Assumptions

Pinned when the user asked to write docs:

- Command matching is **case-insensitive** so device capitalization
  (`/Dex`) does not turn a hop into a question.
- Arg-phase lists show **at most 8** name rows so the AC is testable
  and the picker stays a shortlist.

No other speed-path assumptions.

## Open questions

None. Remaining builder choices (sprite on rows, wrap vs stop at list
ends, exact empty-string copy beyond the phrases in the ACs) are
presentation, not product forks.

## Out of scope

Treat as a hard boundary.

- Discord-bot / Showdown catalog: `/dt`, `/weak`, `/coverage`,
  `/learn`, `/ability`, tool-named slashes.
- `/compare`, `/voice`, `/stop`, `/clear`, `/ask`.
- Saved-prompt slashes (`/rain`) and a prompt library.
- Changing `Ask Oak`, empty-desk starters, or adding a first-run tour.
- Voice-mode slash parse.
- Making `/compare` a handled hop (still no standalone Compare).
- Command palette / shortcut overlay on iOS or Android.
- New palette rows or shortcut chords on web (palette stays as Chat
  QoL shipped it).
- Changing retry / edit / undo, `@mention` binding to the **agent**,
  follow-up chips, shares, folders.
- Changing calc math, Stat Points, or “Explain this calc.”
- A thread-local “slash result” card that looks like an `OakAnswer`.
- Off-roster / other-game Dex complete. Suggestions are Champions
  roster only.
- `/usage` ladder flags (`/usage singles`). Default ladder stays the
  Usage surface’s own control.
- Server-side slash routing through the model or a new tool.

## Traceability

| Decision | Source |
|---|---|
| Picker + arg complete + `/help` | Interview 1A |
| Pick inserts; Send hops | Interview 2A |
| No placeholder / empty-desk tutorial | Interview 3 (picker-only) |
| Guest `/team` listed | Interview 4A |
| `/usage {species}` drill-in; else index | Interview 5A |
| Lone `/` does not send | Interview 6A |
| `/help` → composer `/`, same picker | Interview 7A |
| Enter inserts; Send sends the box | Interview 8A |
| Two-phase picker; Dex kinds; `/calc` free text; `/foo` hides | Interview 9A |
| Case-insensitive commands; max 8 name rows | Recap pins before write |
| Keep five hops; unknown = message; no Edit intercept | Opening recommendation, accepted |
