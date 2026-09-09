# UI and experience

Personas: guest and signed-in, on web, iOS, and Android. Visual
language stays the existing answer card / artifact / Teams system
(`docs/design-system/`). This pack adds verbs and one new
destination (Calculator), not a new look.

## Tone

Same Oak: grounded, cited, format-tagged, honest about estimates and
gaps. Casual hops are obvious on the card and viewer. Competitive
depth lives in the calculator, compare, and table — still the same
chrome, not a “pro mode” skin.

## Surfaces

### Answer card (all clients)

- Structured Pokémon (sprite, candidate row, comparison cell,
  proposed-team member): existing tap opens the artifact; signed-in
  **Add to team** is an explicit action on that object (row menu,
  overflow, or always-visible verb — architecture/design may choose
  the control, but it must be discoverable without opening the
  viewer).
- Damage block: **Open in calculator** (all users).
- Candidate table: sort affordance, type filter, name search,
  per-row pin-in-table, **Copy for spreadsheet** (TSV). N of M
  remains visible.
- Citations: existing list; tap highlights the linked claim when
  present and opens the source artifact.
- Proposed team: **Copy Showdown paste** on the proposal card.
- Compact cards: reasoning and sources collapsed; facts and caveats
  remain. Per-card expand still exists.
- Voice turns: mic glyph; spoken text immediately; “finishing
  card…” then in-place upgrade; failure + Retry.

### Artifact viewer (existing dock / mobile overlay)

- Header gains **Open in Dex** for Pokémon, move, ability, item.
- Pokémon artifact gains **Add to team** (signed-in) and **Compare
  with…** (everyone).
- Rich artifacts (team sheet, comparison, calc) gain **Pin**
  (signed-in).
- Existing back, close, and “ask about this in chat” stay.

### Conversation pin strip (signed-in)

- Appears only when the thread has at least one pin.
- Up to five snapshot titles. Tap reopens. Unpin from the strip.
- Not a tab, not a library page.

### Calculator — overlay (chat hops and `/calc`)

- Compact sheet/panel over the current conversation: two sides,
  move, documented field knobs, format, estimate, **Explain this
  calc**, **Expand**.
- Desktop: thread remains visible behind/beside it when possible.
- Mobile: sheet over chat; dismiss returns to the thread.

### Calculator — first-class screen

- Same controls as the overlay, more room for pickers and the
  common-spread table.
- Reached from app navigation / dedicated route, or Expand from the
  overlay.
- Do **not** add a fifth primary tab if Calculator can live under an
  existing tools / Dex entry **and** still meet CALC-AC-1.1
  (first-class destination). If no honest home exists, a dedicated
  entry is required rather than burying it only inside a damage
  block.

### Add-to-team picker

- List of the user’s teams with empty/full state.
- **Create new team**.
- Full team → replace-member sheet (six faces), cancel safe.
- After confirm → team editor on the written slot (push / navigate).

### Compare with… picker

- Species picker plus optional scope for the second column.
- Unresolved pick stays on the picker; does not clobber the open
  artifact.

### Account / appearance

- Compact / full default control. Labelled. Full is the factory
  default.

## Interaction patterns

- **Tap entity → artifact** is unchanged (**DEX-BR-1**).
- **Hops that compute** (calc, compare, table, TSV, Showdown copy)
  do not send a chat turn.
- **Explain this calc** and **voice hydrate** are the model-touching
  exceptions (plus ordinary chat).
- **Guests:** public hops visible; Add/Pin absent — not greyed-out
  locks on every card.

## Responsive behavior

| Width | Viewer | Calculator hop | Calculator nav |
|---|---|---|---|
| Desktop | Docked beside chat | Overlay on the thread | Full Calculator page |
| Narrow / native | Full-screen overlay | Sheet over chat | Full Calculator screen |

Expand from overlay always goes to the full Calculator carrying the
same scenario. Back from that Expand lands on the conversation with
the overlay dismissed.

## Empty, error, and loading

- Calculator incomplete: empty result area, not a fake 0.
- Unsupported item/ability: visible **not modeled** label.
- Old-gen caveat: persistent, not a one-shot toast.
- Dex hop to a missing-in-format entity: Dex’s own empty state for
  that scope.
- Pin at cap: message on the Pin action, strip unchanged.
- Voice hydrate: explicit finishing / failed / retry — not a spinner
  that looks like the turn is still speaking.
- TSV with zero visible rows: explain, do not copy a header-only
  surprise unless the header-only paste is labelled as empty.

## Accessibility

- New actions are keyboard-reachable on web (Add, Open in Dex, Open
  in calculator, Compare with, Pin, copy controls, table sort/filter).
- Highlighted citation claims have a non-color-only distinction.
- Compact mode must not remove caveat/uncertainty from the
  accessibility tree.
- Overlay calculator is dismissible (Esc / system back) without
  sending a turn.
- Mic glyph has a text equivalent (“Voice turn”).

## What this pack must not look like

- A second design system for the calculator.
- Disabled Add/Pin buttons on guest cards.
- A Compare **app** or artifact **library** page.
- Follow-up chips that claim `/calc` or add-to-team if those chips
  were forbidden by Chat QoL — the **on-card / on-viewer controls**
  are the verbs.

## Reference

Existing answer card, artifact viewer, Teams editor, and Dex
profiles. The calculator should feel like a sibling of Dex + Teams,
not like an imported Smogon-calc skin.
