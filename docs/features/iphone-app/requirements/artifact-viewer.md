# Oak for iPhone — Artifact Viewer

> The native-iPhone expression of the web artifact viewer
> (`docs/features/artifact-viewer/requirements/`), presented as a **bottom
> sheet** over the chat. IDs scoped `M-`. Append; never renumber.

## Overview

Oak's answers reference rich objects — a Pokémon, move, ability, item, or type;
and rich answer blocks — a candidate table, a damage-calc readout, a type-matchup
grid, a side-by-side comparison, a team sheet. The artifact viewer lets the user
open one of these as a first-class, full-detail object **without losing their
place in the conversation**. Its purpose is **co-visibility**: keep something
rich on screen while continuing to ask questions.

On iPhone, the viewer is a **draggable bottom sheet** that slides up over the
chat (à la Apple Maps): the user keeps chat context above while exploring the
artifact below, can expand it toward full screen for room, and can drag it down /
dismiss it to return to the conversation. The viewer shows **one artifact at a
time** and behaves like a small in-app browser — drill-downs push onto a **back
stack**; a back control returns to the previous artifact. Artifacts are
**ephemeral** (session-only, not persisted, not shareable) — so this feature is
independent of accounts and history.

## User stories

- **M-ART-US-1** — As any user, I want to tap an entity (Pokémon/move/ability/
  item/type) shown in a structured part of an answer and see its full profile, so
  I can study it without re-asking.
  - **M-AC-A1.1** — Tapping such an entity opens the **bottom sheet** with that
    entity's full profile for the active format (everything Oak has), rendered
    with the same grounded, cited, format-tagged conventions as answers.
  - **M-AC-A1.2** — The chat remains visible above the partially-raised sheet, so
    conversation context isn't lost.

- **M-ART-US-2** — As any user, I want to open a rich answer block (candidate
  table, damage readout, comparison, type grid, team sheet) into a focused view,
  so big content gets the room it needs.
  - **M-AC-A2.1** — A per-block control opens that block into the bottom sheet as
    a full-detail artifact.
  - **M-AC-A2.2** — Inside the sheet I can drag to enlarge it (up to ~full
    screen) for dense content, and drag down to shrink/dismiss.

- **M-ART-US-3** — As any user, I want to drill from one artifact into another
  and navigate back, so exploring feels like browsing.
  - **M-AC-A3.1** — Tapping an entity **inside** an artifact pushes a new artifact
    onto a back stack (showing one at a time).
  - **M-AC-A3.2** — A back control returns to the previous artifact; dismissing
    the sheet returns to the chat.
  - **M-AC-A3.3** — The standard iOS swipe-down gesture dismisses the sheet.

- **M-ART-US-4** — As any user, I want artifacts to feel instant and consistent
  with the rest of Oak, so the viewer is worth using.
  - **M-AC-A4.1** — Opening an artifact for data already on screen feels
    effectively instant (no full new round-trip required for already-present
    answer content).
  - **M-AC-A4.2** — Artifacts are visually consistent with answers — grounded,
    cited, format-tagged — not an un-sourced data dump.

## Business rules

- **M-BR-ART-1** — **One artifact visible at a time**; navigation is a back stack
  (browser-like), not multiple simultaneous panes.
- **M-BR-ART-2** — Artifacts are **ephemeral** — session-only, not persisted, not
  shareable in v1.
- **M-BR-ART-3** — Only entities/blocks that appear in a **structured** part of an
  answer are openable (consistent with the web rule); free-text mentions are not
  required to be tappable.
- **M-BR-ART-4** — Artifacts respect the **active format** — an entity profile
  shows the data for the current mode (standard / Champions).
- **M-BR-ART-5** — The bottom sheet must not **block** the conversation: the user
  can always get back to chatting with a single gesture.

## Dependencies & notes

- The set of artifact types mirrors the web app (Pokémon, move, ability, item,
  type, comparison, damage calc, type matchup, team sheet). The app renders these
  natively; it does not invent new artifact types in v1.
- Entity/answer-block data comes from the same backend; "instant for on-screen
  data" implies the app can render from data already delivered with the answer
  where possible (architect's design), falling back to a fetch otherwise.
