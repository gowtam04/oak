# Team-from-Box — Business Requirements

> IDs in this document are namespaced with `BOX-` to stay distinct from the
> main app and from other features (`TEAM-`, `SC-`, `ADMIN-`, …). IDs are
> stable: append new ones, never renumber.

## Overview

Oak’s main chat agent is being used as a **box optimizer**: a user pastes a
list of owned species (often 15–30 names) and asks — in English or Korean —
for a party built **from that list**. Production showed one user repeating
the same paste **100+ times in a weekend** because Oak kept **dropping**
named Pokémon (notably forms with a missing learnset, e.g. Mega Kangaskhan)
and replacing them. Each retry ran a long tool loop (p95 ~18 tool calls,
iteration ceiling 20/28), including warehouse SQL and wiki search, at
roughly **$0.23–0.29 per turn**.

This feature changes **chat-agent behavior** for that job:

1. **Never silently omit a named species** that belongs on the proposed
   party. If data is missing, **keep the Pokémon and warn**.
2. **Build the `proposed_team` from the box** — pick up to six from the
   listed names; do not invent replacements for names they wanted kept.
3. **Short path** for box-build turns: no warehouse SQL, no wiki search,
   bulk species/learnset lookup instead of one-at-a-time grinding, compact
   movepool context, and a **low iteration ceiling (on the order of 6)**
   instead of 20/28.

Clients already know how to render `proposed_team`. There is **no** new
Teams-page “paste your box” control in this spec.

### Goals

- A user who names Pokémon for a party gets those Pokémon on the proposed
  team (or an honest warning), not a surprise substitution.
- A pasted box of many names still yields a real six-slot `proposed_team`
  drawn from that box, fast enough that they do not open a new chat and
  paste again.
- Box-build turns stop burning the long, expensive whole-games tool loop.
- Ordinary Pokédex / location / wiki / damage-calc questions stay on the
  full agent.

### Success Criteria

- Pasting a list that includes a species with an empty or missing learnset
  still places that species on the proposed team, with a visible warning —
  it is not omitted.
- A box of more than six names yields at most six members, **all** from the
  box; the agent does not add a species that was not listed.
- If the user names six or fewer as the party (or says not to drop a
  specific name), every such name appears on the proposed team.
- Box-build turns do not call `run_sql` or `search_wiki`, do not run the
  20/28-iteration team-build budget, and do not load full movepools into
  context unless the user asked what a species can learn.
- Web, iOS, and Android all show the proposed team and the new warnings
  (they already share `proposed_team` + warn-but-allow). No Teams-page UI
  change.

### Priority Notes (for the architect)

Behavior change on the **main chat agent** is the whole deliverable.
Batching lookups and shrinking movepool context are in scope as product
constraints (“must not take N model rounds to look up N species”; “must not
ingest entire movepools on a box-build”). Exact tool shapes are architecture.

## Users and Personas

- **Box builder (the production user class).** Has a living dex / owned
  list. Pastes names, often in Korean, often in a **new chat every retry**.
  Wants a six-mon party **from that list**, with sets. Gets angry when Oak
  drops a named mon because learnset data is missing. Does not use the
  Teams page for this (0 saved teams in the incident).
- **Ordinary chat user.** Lookups, calcs, locations, “what can X learn?”
  Must not lose the full agent.
- **Operator.** Pays for retries. Success is fewer turns per box job and
  fewer dropped-mon retries, not a new operator UI.

## User Stories

### Keep named species

- **BOX-US-1** — As a user, I want every Pokémon I named for the party to
  stay on the proposed team even if Oak lacks a learnset or the form is
  awkward in this scope, so that I do not have to paste the list again.
  - **BOX-AC-1.1** — Given I name six or fewer species as the party (a
    short list, or “build with these”), when Oak proposes a team, then
    **each named species appears** as a member. Missing learnset, missing
    item, or “not in this scope” becomes a **warning on that slot**, not
    omission.
  - **BOX-AC-1.2** — Given a named form has an empty or missing learnset
    in the active scope (the Mega Kangaskhan case), when Oak proposes,
    then that form is still a member; the slot is flagged that moves could
    not be verified / are unknown; Oak does **not** substitute another
    species.
  - **BOX-AC-1.3** — Given a named form is not in the active scope’s
    roster, when Oak proposes, then the form is still a member with a
    warning that it may be illegal in this scope — not dropped.
  - **BOX-AC-1.4** — Given I say not to drop a specific name (any
    language, including Korean “빼지 마”), when Oak proposes again, then
    that name is on the team.

### Build from the box

- **BOX-US-2** — As a user, I want a pasted box of many owned species to
  become a real six-mon `proposed_team` drawn from that box, so that I get
  a team card I can apply, not a lecture that replaces my mons.
  - **BOX-AC-2.1** — Given I paste more than six species names as my box,
    when Oak proposes, then the team has **at most six** members and
    **every member’s species is in the pasted list**.
  - **BOX-AC-2.2** — Given I paste more than six names and do not insist
    on a specific six, when Oak picks six, then the fourteen (or however
    many) not chosen are **cuts from a box**, which the answer may
    explain — that is allowed. Substituting a **non-listed** species for
    a chosen slot is not.
  - **BOX-AC-2.3** — Given I paste a box **and** name a species that must
    stay (keep X / don’t drop X / “X is required”), when Oak proposes,
    then X is one of the six, even if its learnset is missing.
  - **BOX-AC-2.4** — Given a box-build turn succeeds, when I view the
    answer on web, iOS, or Android, then I see a `proposed_team` card with
    sets to the extent Oak can justify, plus slot/team warnings, same
    apply flow as today (user applies; Oak does not auto-save — BR-T8).

### Short path (cost and latency)

- **BOX-US-3** — As a user, I want a box-build to finish after a short
  lookup, so that I get a team without a long tool grind.
  - **BOX-AC-3.1** — Given a turn classified as a box-build (BOX-BR-1),
    when Oak runs, then it does **not** call `run_sql` and does **not**
    call `search_wiki`.
  - **BOX-AC-3.2** — Given a box-build that only needs species facts and
    legal moves for the listed names, when Oak runs, then looking up many
    species does **not** take one model round per species. Bulk lookup is
    required (N names must not imply N sequential model-tool iterations).
  - **BOX-AC-3.3** — Given a box-build turn, when Oak runs, then it uses a
    **low iteration ceiling on the order of 6**, not the 20- or
    28-iteration team-build budget.
  - **BOX-AC-3.4** — Given a box-build turn, when Oak is choosing moves
    for the six, then it does **not** load each species’ **complete**
    legal movepool into working context. Compact move info is enough to
    pick a legal set. (Contrast BOX-US-4.)

### Full agent still exists

- **BOX-US-4** — As a user, I want ordinary questions to keep the full
  agent, including complete learnsets and wiki/SQL when those are the
  right tools.
  - **BOX-AC-4.1** — Given I ask what a species can learn (movepool
    question), when Oak answers, then I get the complete legal list for
    the active scope — not the compact box-build subset.
  - **BOX-AC-4.2** — Given I ask a non-box question (location, mechanic,
    damage calc, “who is the fastest Dragon,” wiki lore in-game, etc.),
    when Oak runs, then `run_sql` / `search_wiki` and the normal
    iteration budget remain available.
  - **BOX-AC-4.3** — Given a mixed message that is primarily a box-build
    (“here is my box, make a party”) plus a side remark, when Oak runs,
    then it still follows the short path and keep-named-species rules.
    A message that is primarily a wiki/location question and happens to
    mention two names is **not** a box-build.

### Follow-ups

- **BOX-US-5** — As a user, I want a follow-up in the same thread
  (“you dropped Kangaskhan, put it back,” “give Gengar Shadow Ball”) to
  respect the box I already pasted, so that I do not start over in a new
  chat.
  - **BOX-AC-5.1** — Given this thread’s user messages include a box list,
    when I follow up to keep or restore a named species, then the next
    `proposed_team` includes it (BOX-AC-1.4) and stays on the short path.
  - **BOX-AC-5.2** — Given I ask to change a move/item on a member that is
    already on the proposed team, when Oak proposes again, then membership
    still comes from the box; Oak does not “fix” a missing learnset by
    swapping the species.

## Functional Requirements

### What a box-build is

A **box-build** is a main-chat turn whose user intent is: *make (or remake)
a party from these owned/listed species.*

It includes, in any language (English and Korean are required at launch;
other languages should still match if the message is a bare species list):

- A message whose primary content is a list of Pokémon species/form names
  (comma-, newline-, or otherwise separated), with or without a short
  instruction to build/make a team/party.
- An instruction to build/make a team or party **from** listed names
  (“파티 만들어”, “build from these”, “don’t drop X, build again”).
- A follow-up in a thread that is already a box-build, about membership or
  sets of that party.

It does **not** include:

- “What can Gengar learn?”
- “Where do I catch Gengar?”
- “Build me a rain team” with **no** owned list (that is ordinary
  team-build, existing TEAM-US-6, not this short path).
- Teams Assistant embedded builder (out of this spec except that a
  `proposed_team` it emits should still not silently omit a species the
  user just named — BOX-BR-2 applies to any chat `proposed_team`).
- Voice (no `proposed_team` card; not in this spec).

The current English-only “build me a team” detector is **not** sufficient:
bare lists and Korean party instructions must classify as box-build.

### Proposed team membership rules

Let **named-for-party** be:

- every species in the list when the list has ≤ 6 names, or
- every species the user marked as required / do-not-drop, plus
- when the list has > 6 names and they did not mark a full six, Oak’s
  chosen six, which must be a **subset of the list**.

Then:

- Every named-for-party species is a member of `proposed_team`.
- No member species is outside the box list.
- Data problems become **warnings** (warn-but-allow, BR-T6): empty
  learnset, unverified moves, form not in scope, illegal item, etc.
- Oak may leave moves/items sparse rather than swap the species to make
  the set “clean.”

Cuts from a >6 box are allowed and should be explained in the answer
prose. They are not a violation of “never drop” unless the user required
that name.

### Short-path constraints

On a box-build turn:

- **Forbidden tools:** `run_sql`, `search_wiki`.
- **Bulk lookup:** species facts and legal-move info for the listed names
  are obtained without one model iteration per name.
- **Compact moves:** the model is not fed complete movepools for box-build
  set construction. A dedicated movepool question (BOX-US-4) still gets
  the full list.
- **Iteration ceiling:** on the order of **6** model rounds, including
  submit. The 20 / 28 team-build ceilings do not apply to box-build.

### What does not change

- `proposed_team` remains optional, inert, user-applied (BR-T8).
- Warn-but-allow validation on apply/save (BR-T6) remains.
- Active-team / Teams page / Showdown paste on `/teams` are unchanged.
- Scope chip and format of the conversation still decide which learnset
  and roster the warnings are computed against.
- Non-box turns keep the full 20-tool agent.

### Clients

- No new composer control. The user keeps pasting into chat.
- `proposed_team` + per-slot warnings must be visible on web, iOS, and
  Android (existing cards). If a missing-learnset warning cannot be
  represented with today’s warning fields, extend the **warning text** the
  card already shows — do not drop the member to avoid the UI problem.

## Business Rules

- **BOX-BR-1 — Box-build classification.** A main-chat turn that matches
  “What a box-build is” above is a box-build. Bare species lists and
  Korean party-from-list instructions qualify even when the English
  team-build phrasing is absent. When both a box-build and a general
  team-build pattern match, **box-build wins** (short path + keep-named).
- **BOX-BR-2 — Never omit named-for-party species.** If a species is
  named-for-party, it appears on `proposed_team`. Missing data, empty
  learnset, or out-of-scope form is a warning, not a drop, not a
  substitute. Applies to every `proposed_team` in main chat, including
  follow-ups.
- **BOX-BR-3 — Members come from the box.** On a box-build, every
  proposed member species is in the user’s listed box. No invented
  replacements for a slot they wanted filled from the box.
- **BOX-BR-4 — Six-slot cap unchanged.** A proposed team still has at
  most six members. Choosing six from a larger box is required, not a
  drop violation, unless the user required a name that was left out.
- **BOX-BR-5 — Short path on box-build.** No `run_sql`, no `search_wiki`,
  bulk species/learnset lookup, compact movepools, iteration ceiling on
  the order of 6.
- **BOX-BR-6 — Full agent otherwise.** Non-box-build turns are not
  stripped of tools or iteration budget by this feature.
- **BOX-BR-7 — Full movepool on request.** “What can X learn?” (and
  equivalent) returns the complete legal list for the active scope.
- **BOX-BR-8 — Propose, don’t save.** Oak still does not write a saved
  team unless the user applies (BR-T8).
- **BOX-BR-9 — Warn, don’t clean by swapping.** Prefer an incomplete or
  unverified set on the named species over a legal set on a different
  species.
- **BOX-BR-10 — Language.** Classification and “don’t drop X” must work
  for English and Korean at launch. A bare list of Latin species names
  with Korean instructions is a box-build.
- **BOX-BR-11 — Follow-ups inherit the box.** Until the user starts a
  new conversation or clearly changes the job, follow-ups about that
  party stay on BOX-BR-2/3/5.

## Non-Functional Requirements

- **Latency / cost.** A typical box-build (one paste, ~15–30 names, one
  proposed team) must complete in a **small** number of model rounds
  (order of 6), not the current 15–20 tool-call pattern. This is a
  product requirement, not a hint.
- **Quality.** Named-for-party membership is a correctness requirement.
  A “better” team that dropped Mega Kangaskhan is a **fail**.
- **Platform.** Server-side agent behavior; `proposed_team` rendering on
  web + iOS + Android. No new mobile-only UI.
- **Scope data.** Warnings use the conversation’s active scope. This
  feature does not add Mega/learnset rows to the index; it changes what
  Oak does when those rows are missing.
- **Eval.** At least one golden/eval case: a box list that includes a
  missing-learnset form still proposes that form with a warning and does
  not call `run_sql` / `search_wiki`.

## UI/UX Vision

- **No new input widget.** Users keep pasting lists into the chat
  composer (all three clients).
- **Answer:** existing proposed-team card + existing warning treatment.
  Warning copy must be human-readable: e.g. learnset unavailable for this
  form in this scope; moves could not be verified; species kept because
  you named it.
- **Prose:** if Oak cut a >6 box down to six, say who was cut and why
  (roles, typing, etc.). Do not imply a cut was “not in the data” if the
  user required that name — required names are never cut (BOX-BR-2).
- **Tool activity:** fewer ticks; no SQL/wiki activity on a box-build.
- **Teams page:** unchanged. No paste-box control.

## Constraints and Preferences

> Inputs for the solution architect — not decisions made here.

- **Agent internals are a contract.** Tool names `run_sql` and
  `search_wiki` are the existing T18/T19 tools; forbidding them on
  box-build is a product constraint on routing, not a rename. Do not
  rename tools.
- **`proposed_team` schema** already exists (TEAM-AD-6). Prefer warning
  text the current card can show over a new payload field, unless a field
  is required to keep BOX-BR-2 testable.
- **Bulk lookup** may be a new tool, a widened existing tool, or a
  server-side expansion — architect’s call — as long as BOX-AC-3.2 holds.
- **Iteration ceiling** is a loop guard, not only a prompt suggestion.
  Prompt-only “please stop after 6” is not sufficient.
- **Companion feature.** Spend controls (`docs/features/spend-controls/`)
  bound how many times a user can retry. This feature removes the *reason*
  they retry. Neither replaces the other.
- **Existing team-build detector.** Raising MAX_ITERATIONS to 20/28 for
  English “build me a team” stays for **non-box** team-builds unless
  architecture finds a better single ceiling. Box-build must not use
  20/28.

## Assumptions

None beyond the interview locks: keep-and-warn (5A), full `proposed_team`
from the box (6A), no Teams-page paste (7A), short path as specified (8A).

## Open Questions

- **Other languages besides English and Korean.** Bare species lists
  should still match. Full “don’t drop” phrasing in languages other than
  EN/KR is not a launch blocker; add if cheap.
- **Exact compact-movepool shape** (how many moves, whether by role) is
  architecture, as long as complete movepools are not dumped on box-build
  and BOX-US-4 still returns the full list.

## Out of Scope

A builder should not add these without them being moved into scope:

- A Teams-page or Teams Assistant **paste-your-box** control.
- Voice-mode team proposals.
- Filling missing learnsets in the index / ingest (data bug may exist;
  this spec is agent policy when data is missing, not an ingest ticket).
- Auto-saving the proposed team.
- Changing warn-but-allow on the Teams page itself.
- Forbidding `run_sql` / `search_wiki` on non-box turns.
- Per-minute rate-limit changes (see spend-controls).
- Paywall or daily caps (see spend-controls).
- New answer-card layout beyond showing the keep-and-warn copy.
- Anime/media team questions (still out of Oak’s games-only scope).
