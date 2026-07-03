# Oak for Android — UI & Experience

> Design direction, information architecture/navigation, key screens,
> interaction patterns, accessibility. Product-level only. IDs scoped `D-`.
> Append; never renumber.

## Index — iPhone requirements applicability

| iPhone ID | Status | Note |
|---|---|---|
| M-UI-US-1 (native yet recognizably Oak) | Modified | Android idiom is **Material 3**, not iOS HIG — D-UI-2. |
| M-UI-US-2 (navigation reachability) | Modified | Same "full feature set in 1–2 taps" bar; shape differs (3 tabs, History folded into Chat) — D-UI-1. |
| M-UI-US-3 (chat screen) | Modified | Same composer/streaming/answer-rendering intent; scope indicator is the six-scope chip, not a Champions toggle; no active-team indicator (retired). |
| M-UI-US-4 (history screen) | Modified | Same capabilities, inside the Chat tab — D-UI-1, `history-and-teams.md` D-HIST-1. |
| M-UI-US-5..7 | Same | Teams library/editor + Teams Assistant entry point; artifact bottom sheet with back-stack navigation (predictive-back delta in `artifact-viewer.md`); Account/Settings (sign-in/out, tier, deletion, links). |
| M-UI-US-8 (gesture-driven interactions) | Modified | Same list-pattern intent; Android additionally needs system back-gesture/predictive-back handling everywhere — D-UI-3. |
| M-UI-US-9 (accessibility) | Modified | **TalkBack**, not VoiceOver; Android font-scale, not Dynamic Type — D-UI-4. |
| M-BR-UI-1..3 | Same | Chat is the default surface; sign-in-gated areas are discoverable, not hidden; supported phone size range without clipping (tablet layout out of scope). |

## Android-specific requirements

### D-UI-1 — Navigation: 3-tab shape, no dedicated History tab

Bottom navigation with three destinations — **Chat** (auth-adaptive, the
launch default), **Teams** (signed-in-gated), **Account**. History is not a
fourth tab; it's reached from inside Chat (`history-and-teams.md` D-HIST-1),
one tap away. For a guest, Teams is visible but presents sign-in as the
unlock (D-BR-UI-2), not broken/absent. The scope chip and "new conversation"
are reachable from Chat without switching tabs.

### D-UI-2 — Material 3 design direction, no trademarked imagery

Navigation, gestures, sheets, and controls follow Material 3 (bottom
navigation, Material You–capable theming where appropriate, Material
motion). Oak's brand (color, type personality, answer-card visual language,
per `docs/design-system/design-system.md`) is adapted to Material 3, not
pixel-copied from web or iOS. **No trademarked Pokémon imagery** — no
Pokéball icon, character art, or Nintendo/Game Freak/Creatures marks — in
the app's own chrome, icon, or marketing surfaces (backend-returned sprite
data in answers is a separate, unaffected concern). Light and dark theme
follow the system setting by default; the system font-scale setting is
honored (Dynamic Type's equivalent).

### D-UI-3 — System back gesture / predictive back

Every screen with its own nav stack (team editor, OTP entry, history list,
settings) participates correctly — back always returns to the logically
previous screen, never exits the app from a non-top-level screen. Artifact-
sheet back-stack integration is specified fully in `artifact-viewer.md`
D-ART-1 (pop the stack before dismissing, dismiss before exiting the tab).
The app participates in the predictive-back preview animation on versions
that support it, and falls back to standard back on versions that don't.
From a top-level tab, back follows standard Android task-back conventions
rather than exiting unexpectedly.

### D-UI-4 — Accessibility (TalkBack, font scaling)

Interactive elements have content descriptions and work with **TalkBack** —
correct focus order, grouping, and announced state (streaming-in-progress,
applied/undo state on the Teams Assistant card). Text honors system
font-scale; layouts reflow/scroll rather than clip at larger scales. Color
is never the sole carrier of meaning (inference/uncertainty flags,
applied/undo state, rate-limit/error states all pair color with text or an
icon); contrast meets standard guidance in both themes.

## Interaction patterns

Lists use Material 3 patterns (swipe actions, overflow/contextual menus,
pull-to-refresh where appropriate). Sheets are draggable/dismissible with
Material gestures plus the system back gesture (D-UI-3). The keyboard/IME
never obscures the composer's input or send action, and behaves correctly
with OTP paste entry (`accounts-and-access.md` D-ACCT-1). Tapping an entity/
citation in a structured answer opens the artifact sheet.

## Key screens (product-level)

**Chat** — scrolling thread + composer (text, attach/camera, send,
thumbnails), the scope chip, and a history entry point. **Teams
(signed-in)** — team library, detail/editor, import/export, Teams Assistant
entry point. **Artifact bottom sheet** — draggable Material 3 sheet over
chat. **Account** — sign-in/out, tier/limits, account deletion, scope
default, about/legal links.

## Business rules

- **D-BR-UI-1** — Same as M-BR-UI-1: Chat is the default surface.
- **D-BR-UI-2** — Same as M-BR-UI-2: sign-in-gated areas (Teams, history
  inside Chat) show a sign-in prompt, not an empty/broken screen.
- **D-BR-UI-3** — Same as M-BR-UI-3, for Android's device range: works
  across the supported phone size range without clipping core content;
  tablet-optimized layout is out of scope.

## Notes

Detailed visual design is a downstream deliverable extending
`docs/design-system/design-system.md` and `docs/design/fable-ui-strategy.md`
for Android, not redefining the brand.
