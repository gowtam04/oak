# Oak for iPad — UI and Experience

> Tone, chrome, pointer, and accessibility for the iPad shell. Screen
> layouts live in `shell-and-adaptation.md`, `chat-and-artifacts.md`,
> `teams-workbench.md`, and `reference-and-tools.md`. Personas: guest
> and signed-in.

## Design direction

**Native iPad structure carrying Oak’s current iOS brand.** Sidebar,
split panes, inspector, and centered panels are the iPad grammar.
Colors, enamel lid, paper surfaces, type personality, type badges, and
answer-card language stay recognizably Oak (the shipping iOS app, not
the retired web design-system doc). This is **not** a new brand and
**not** the iPhone tab dock stretched to 13 inches.

- **P-UI-US-1** — As a user, I want iPad Oak to feel like iPad and
  like Oak.
  - **P-UI-AC-1.1** — Navigation and chrome follow iPad conventions
    (leading sidebar, multi-column, inspector, centered dialogs) rather
    than iPhone tab + push + bottom sheet as the default.
  - **P-UI-AC-1.2** — Oak brand (enamel, paper, type badges, answer
    cards) is recognizable next to the iPhone app.
  - **P-UI-AC-1.3** — Light and dark follow the system (and any in-app
    appearance control iPhone already has).
  - **P-UI-AC-1.4** — Dynamic Type: text scales; columns reflow or
    scroll; core actions stay reachable at the largest accessibility
    sizes.

## Information architecture (summary)

See `shell-and-adaptation.md` for rules. Product-level map:

| iPhone | iPad |
| --- | --- |
| Bottom tab dock (Chat, Teams, Usage, Dex, Settings) | Leading sidebar, same five destinations |
| Chat: push thread over list | List \| thread |
| Artifact bottom sheet | Inspector column (Chat); centered panel (from companion) |
| Teams: list then long editor | Library \| 6-slot canvas \| slot inspector |
| Teams Assistant sheet | Companion chat with team chip |
| Dex / Usage: list then push | Index \| profile (Usage section on Pokémon) |
| Calc full-screen cover | Calc workspace, attacker \| defender \| visible result |
| Settings single scroll | List \| detail |
| Voice overlay | Voice workspace on Chat thread canvas |
| Phone sheets (auth, import, add-to-team) | Centered panels |

Chat remains the default destination (`P-SHELL-BR-1`).

## Interaction patterns

- **P-UI-US-2** — As a user, I want iPad-native manipulation of
  existing objects.
  - **P-UI-AC-2.1** — Lists support touch swipe actions **and** pointer
    secondary-click for the same pin/rename/delete/duplicate actions
    iPhone already offers (`P-SHELL-AC-7.2`).
  - **P-UI-AC-2.2** — Splits (companion, inspector, portrait stack) are
    draggable where this set requires a split (`P-SHELL-AC-4.3`).
  - **P-UI-AC-2.3** — Centered panels dismiss with tap-outside, swipe,
    and hardware Escape without applying destructive actions
    (`P-SHELL-AC-6.3`).
  - **P-UI-AC-2.4** — Pointer hover may highlight; **no control is
    hover-only**.
  - **P-UI-AC-2.5** — Pull-to-refresh remains on lists that already
    have it on iPhone.

## Empty, loading, and error presentation

- **P-UI-AC-3.1** — Empty Chat is the workbench empty state
  (`P-CHAT-US-3`), not a phone empty view centered in a void.
- **P-UI-AC-3.2** — Other empties (no teams, no search hits, usage
  down) use existing copy, laid out for the pane they live in.
- **P-UI-AC-3.3** — Loading indicators sit in the pane that is loading
  (index vs profile vs thread), not a full-window blocker that hides
  the sidebar.

## Accessibility

- **P-UI-US-3** — As a user of assistive tech, I want every current
  capability reachable on iPad.
  - **P-UI-AC-3.4** — Interactive elements have accessibility labels
    and work with **VoiceOver**. Sidebar, columns, inspector, companion,
    and context chip are announced as distinct regions.
  - **P-UI-AC-3.5** — VoiceOver order follows reading order: sidebar →
    primary workspace → inspector/companion (or top → bottom in
    portrait stack).
  - **P-UI-AC-3.6** — Reduce Motion: decorative motion is disabled;
    splits still work.
  - **P-UI-AC-3.7** — Color is not the sole carrier of meaning (flags
    still have text/iconography). Contrast meets standard guidance in
    light and dark.
  - **P-UI-AC-3.8** — Keyboard focus can reach every action the pointer
    can click (without introducing a shortcut cheatsheet — focus
    traversal only).

## What “not a scaled iPhone app” means (testable)

- **P-UI-AC-4.1** — On a 13-inch landscape iPad, Chat shows **at least
  two columns** (list | thread) when no compact-width rule applies.
- **P-UI-AC-4.2** — On that same size, Teams shows **library and
  canvas** together (slot inspector as well when a slot is selected).
- **P-UI-AC-4.3** — The iPhone bottom tab dock is **not** the iPad
  primary navigation at any size.
- **P-UI-AC-4.4** — Artifact inspection in Chat is **not** the iPhone
  bottom sheet as the default.

## Business rules

- **P-UI-BR-1** — iPhone layouts **must not change** to satisfy these
  iPad patterns (`operational.md` constraints).
- **P-UI-BR-2** — iPad never falls back to the iPhone UI
  (`P-SHELL-BR-4`).
- **P-UI-BR-3** — Brand tokens may be adapted for density; they may
  not be replaced with a new visual identity in this project.

## Cross-links

- Per-screen layouts: destination files
- Inputs: `shell-and-adaptation.md`
- A11y also listed under NFRs: `operational.md`
