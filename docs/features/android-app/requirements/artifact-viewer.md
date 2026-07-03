# Oak for Android — Artifact Viewer

> The native-Android expression of the web artifact viewer, presented as a
> Material 3 modal bottom sheet over the chat. IDs scoped `D-`. Append; never
> renumber.

## Index — iPhone requirements applicability

| iPhone ID | Status | Note |
|---|---|---|
| M-ART-US-1 (tap an entity → full profile) | Same | Tapping a structured entity (Pokémon/move/ability/item/type) opens its full profile for the active format in a bottom sheet; chat stays visible above. |
| M-ART-US-2 (open a rich block into a focused view) | Same | Per-block control opens candidate tables, damage readouts, comparisons, type grids, team sheets into the sheet; draggable toward full-screen for dense content. |
| M-ART-US-3 (drill-down + back navigation) | Modified | Same back-stack model (drill-downs push, one artifact visible at a time); Android additionally integrates the **system back gesture/button**, not only an in-sheet back control or swipe-to-dismiss — see D-ART-1 below. |
| M-ART-US-4 (instant + consistent) | Same | Opening an artifact for data already on screen is effectively instant; artifacts are visually consistent with answers (grounded, cited, format-tagged). |
| M-BR-ART-1..5 | Same | One artifact visible at a time via a back stack; ephemeral (session-only, not persisted/shareable); only structured entities/blocks are openable; artifacts respect the active scope; the sheet never blocks returning to chat. |

## Android-specific requirements

### D-ART-1 — System back integration with the artifact back stack

- **D-ART-US-1** — As any user, I want the system back gesture to behave
  predictably while an artifact sheet is open, so exploring artifacts feels
  like a native part of Android rather than a floating web overlay.
  - **D-AC-ART1.1** — While the artifact sheet is open with more than one
    entry on its back stack, a **system back gesture or back button press
    pops the back stack** (returns to the previous artifact) — it does not
    immediately dismiss the sheet or leave the screen.
  - **D-AC-ART1.2** — When the back stack has exactly one entry (no
    drill-downs yet), a system back gesture **dismisses the sheet** and
    returns focus to the chat thread underneath — it does not exit the Chat
    tab or the app.
  - **D-AC-ART1.3** — On Android versions that support **predictive back**,
    the sheet participates in the predictive-back preview (the standard
    partial-dismiss animation as the user holds the gesture) rather than
    opting out of it; on older Android versions without predictive-back
    support, a normal (non-predictive) back dismissal is used.
  - **D-AC-ART1.4** — In addition to the system back gesture, the sheet
    supports drag-to-dismiss (drag the sheet down) and an explicit in-sheet
    back/close control, so there is always more than one way to leave the
    sheet — same intent as the iPhone app's swipe-down dismiss, expressed
    with Android's gesture set.

## Business rules

- **D-BR-ART-1** — Same as M-BR-ART-1: one artifact visible at a time,
  navigation is a back stack, not multiple simultaneous panes.
- **D-BR-ART-2** — Same as M-BR-ART-2: artifacts are ephemeral — session-only,
  not persisted, not shareable in v1.
- **D-BR-ART-3** — Same as M-BR-ART-3: only entities/blocks appearing in a
  structured part of an answer are openable; free-text mentions need not be
  tappable.
- **D-BR-ART-4** — Same as M-BR-ART-4: artifacts respect the active scope —
  an entity profile shows the data for the currently resolved scope (one of
  the six, per `chat-experience.md` D-CH-1).
- **D-BR-ART-5** — Same as M-BR-ART-5, extended per D-ART-1: the user can
  always get back to chatting with a single gesture, whether that's the
  system back gesture, a drag, or an in-sheet control.

## Dependencies & notes

- The set of artifact types mirrors web/iPhone (Pokémon, move, ability, item,
  type, comparison, damage calc, type matchup, team sheet); the Android app
  renders these natively and does not invent new artifact types in v1.
- Entity/answer-block data comes from the same backend; "instant for
  on-screen data" implies rendering from data already delivered with the
  answer where possible, falling back to a fetch otherwise (architect's
  design, mirrors the iPhone approach).
