# Answer cards and artifacts — Business Requirements

> Product discovery for the Answer card and artifacts pack selected
> from `docs/product-ideas.md` §2, plus the **standalone damage
> calculator** so “Open in calculator” has a real destination
> (`docs/product-ideas.md` §5). This is a **delta on the existing
> answer card and artifact viewer**, not a new product. IDs are
> namespaced per area and are stable; append, never renumber.
>
> **No application code ships from this document set.** Next step after
> approval is `/architecture-blueprint`.

## Overview

Oak already *knows* more than it *lets you do without talking*. The
answer card is the signature surface — prose, fact table, sprite cards,
candidate table, damage readout, proposed team, citations — and the
artifact viewer already opens a structured entity or block beside chat.
Those objects still die in the scroll: there is no “add this Pokémon,”
no Dex hop from the viewer, no editable calc, no keep-open compare the
user started, no citation-to-claim highlight, no pin that survives
relaunch, and voice history is a thin transcript.

This pack turns a finished answer into a starting point — add, Dex,
calc, copy, filter, compare, pin — without weakening grounding.

It is one requirements pack. All ten selected §2 items **and** the
damage calculator are in scope. Architecture may phase the build;
nothing here is optional or deferred.

### Why it exists

The hop from “this Pokémon” to “on my team” is missing. A damage
number in chat cannot be tweaked without another turn. Warehouse-style
tables cannot leave as a spreadsheet paste. Comparisons scroll away.
Citations name a source, not the claim. Artifacts are session-only.
Voice turns do not look like Oak answers. Competitive and casual users
share one card and both bounce off the same missing verbs.

The cost of the status quo is extra chat turns for jobs the data and
formulas already support, and history that cannot be trusted to look
like the product.

### Goals

- Make every structured Pokémon a verb: add to a saved team (or create
  one) and land in the editor on that slot.
- Give every inspectable entity a Dex hop from the artifact viewer,
  in the same scope the artifact is tagged with.
- Ship an honest, format-aware damage calculator (standalone screen +
  chat overlay) and wire damage blocks to it.
- Make the candidate table a working shown-set (sort, type/name
  filter, pin-in-table, TSV copy).
- Let the user start a two-subject, any-two-scope compare that stays
  open beside the thread.
- Make a citation tap highlight the claim it supports, then open the
  source artifact.
- Let signed-in users pin a small number of rich artifacts on a
  conversation so they survive relaunch as snapshots.
- Hydrate voice turns into real answer cards after speech.
- Offer a compact/full default that hides reasoning and sources
  without hiding facts or uncertainty on the remaining card.
- Copy a proposed team as Showdown paste in one tap, without opening
  Teams.

### Success criteria

- A signed-in user can add Garchomp from a sprite, candidate row,
  comparison cell, proposed-team member, or Pokémon artifact into a
  saved team (or a newly created one) and land in the editor on the
  written slot. A guest never sees that action.
- Tapping a structured entity still opens the artifact viewer. From a
  Pokémon / move / ability / item artifact, **Open in Dex** opens the
  Dex profile in **that artifact’s scope**.
- A user can open the calculator from a damage block, a team slot, an
  artifact, `/calc …`, or the Calculator destination; change the full
  set, move, and documented field knobs; and see rolls, percent, and
  KO chance without a model turn. Unsupported knobs are labeled, not
  silently ignored. “Explain this calc” starts a normal chat turn
  with the configured scenario.
- On a truncated candidate table, sort / type filter / name search /
  row-pin / TSV copy operate only on the shown rows. The N of M label
  stays honest.
- A user can compare any two species in any two scopes from an open
  Pokémon artifact (“Compare with…”) or by opening an answer’s
  comparison block; the compare stays in the viewer.
- Tapping a citation on a new answer highlights the linked sentence or
  fact-table row **and** opens the source artifact. If there is no
  link, there is no fake highlight; the source still opens.
- A signed-in user can pin up to five rich artifacts (team sheet,
  comparison, calc) on a conversation as snapshots, reopen them after
  relaunch, and unpin them. Guests never see Pin.
- After a voice turn, history shows the spoken answer immediately,
  then upgrades to a full answer card. Failure keeps the spoken
  answer and offers Retry. A mic glyph marks origin.
- Compact mode (opt-in; default remains full) collapses reasoning and
  sources on every thread and still shows the answer body, tables,
  calc, proposal, and caveats.
- One tap on a proposed-team card copies the same Showdown paste the
  team editor already exports, and does not save a team.
- The same behaviors land on **web, iOS, and Android**.

## Users and personas

Inherited from the core product. This pack splits capabilities by
identity, not by a new role. Casual and competitive users share the
card: everyday hops stay obvious; depth lives in the calculator,
compare, and table.

| Persona | What they get in this pack |
|---|---|
| **Guest** | Calculator (standalone + overlay + `/calc`), Dex hop from artifacts, table sort/filter/pin-row/TSV, user-built compare in-session, citation highlight, compact/full as a **device** default, Showdown copy. No Add to team, no Pin, no durable compact preference, no pinned-artifact strip after relaunch. |
| **Registered user (signed-in)** | Everything a guest gets, plus Add to team, create-new team from the picker, Pin (per-conversation snapshot strip), durable compact/full preference. |
| **Operator** | No new admin surface. Existing operator read access to turns still applies. Voice hydration is part of the turn record the operator already sees once it lands. |

There is no collaborator, no shared inbox, and no end-user model
picker.

## Document map

| File | Contents |
|---|---|
| [overview.md](./overview.md) | Vision, personas, success, priorities, out of scope |
| [add-to-team.md](./add-to-team.md) | Add this Pokémon to a team |
| [calculator.md](./calculator.md) | Damage calculator, hops, `/calc`, explain |
| [dex-and-citations.md](./dex-and-citations.md) | Open in Dex; citation → claim highlight |
| [tables-and-compare.md](./tables-and-compare.md) | Candidate table tools; keep-open compare |
| [persisted-artifacts.md](./persisted-artifacts.md) | Pin rich artifacts on a conversation |
| [voice-and-presentation.md](./voice-and-presentation.md) | Voice cards, compact/full, Showdown copy |
| [data-and-entities.md](./data-and-entities.md) | Business entities, ownership, lifecycle |
| [auth-and-permissions.md](./auth-and-permissions.md) | Guest vs signed-in rules |
| [ui-and-experience.md](./ui-and-experience.md) | Screens, control placement, empty/error |
| [operational.md](./operational.md) | NFRs, constraints, open questions |

## Priority guidance

All selected items are in scope for this pack. If architecture must
phase, prefer this order (verbs first, then calc, then keep-open
objects, then presentation). That is **build order**, not a cut list.

1. Add to team; Open in Dex; Showdown copy on the proposal card.
2. Damage calculator (overlay + full screen + `/calc` + damage-block hop).
3. Candidate table tools; user-built compare; citation highlight.
4. Pin rich artifacts on a conversation.
5. Voice card hydration; compact/full preference.

## Relationship to existing specs

- **Artifact viewer** (`docs/features/artifact-viewer/`). Still the
  inspect surface: one artifact at a time, user-triggered, back stack.
  This pack **amends** session-only (**BR-AV-1**) for **pinned rich
  artifacts** on signed-in conversations. Entity-detail artifacts stay
  session-only. Copy on a **proposed team** is in this pack; the
  viewer’s original “no copy/share/export” still applies to entity
  profiles.
- **Team builder.** Add to team writes a slot with the existing
  warn-but-allow legality rules. It does not invent a second editor.
- **Chat QoL** (`docs/features/chat-qol/`). That pack explicitly
  excluded add-to-team, `/calc`, and a calculator surface, and treated
  `/calc` as an unknown slash. **This pack owns those.** Chat QoL
  human-copy (prose + table + optional Showdown in the answer-level
  copy) still exists; this pack adds a **dedicated** one-tap Showdown
  control on the proposal card. Chat QoL “Open {entity} in Dex”
  follow-up chips still exist if that pack shipped them; the artifact
  **Open in Dex** button is this pack.
- **Voice mode.** Voice stays signed-in only. This pack changes what
  a finished voice turn *looks like* in history, not who can use the
  mic.

## Assumptions

None. Discovery was not on the speed path.

The pin cap of **5**, the documented calculator field list, and
“cancel in-flight voice hydration if a new turn starts on that
conversation” were confirmed in the interview as the written rules,
not guesses.

## Out of scope

Treat as a hard boundary. An autonomous builder must not add these.

- Standalone Compare **page** (compare lives in the artifact viewer).
- Global / account-wide artifact library, folders, or sharing of
  artifacts.
- CSV file download (TSV copy only).
- Guest Add to team, guest Pin, guest durable compact preference.
- Compare of 3+ subjects.
- Full Smogon-calc modifier parity (every ability, every item, every
  field effect).
- Pinning entity-detail artifacts (Pokémon / move / ability / item /
  type profiles). Dex is their durable page.
- Other slash commands (`/compare`, `/team`, `/usage` stay with Chat
  QoL / existing surfaces). This pack adds **`/calc` only**.
- Stat calculator, catch-rate calculator, breeding planner, standalone
  type-coverage widget, standalone speed-tier chart.
- Public shareable answer links, conversation Markdown/PDF export
  (Chat QoL).
- Suggested follow-up chips that invent add-to-team or calc if Chat
  QoL already forbade inventing missing surfaces — the **controls on
  the card / viewer / calculator** are this pack, not a new chip
  dialect.
- Changing the games-only policy, the twenty-tool list as a chat
  contract, or adding an end-user model picker.
- New auth methods. New admin surfaces.

## Selected catalog items (traceability)

From `docs/product-ideas.md` §2, all ten:

1. Add this Pokémon to a team
2. Open in calculator from a damage block
3. Open in Dex from any entity
4. Sort, filter, and export the candidate table
5. Compare two subjects as a keep-open artifact
6. Citation highlights the sentence it supports
7. Keep artifacts across sessions
8. Voice turns should render a real answer card
9. Compact / full answer toggle
10. Copy a proposed team as Showdown paste in one tap

From `docs/product-ideas.md` §5, pulled in so item 2 has a destination:

11. Damage calculator (honest subset, not Smogon-calc parity)
