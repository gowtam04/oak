# Oak for iPhone — UI & Experience

> Design direction, information architecture/navigation, key screens, interaction
> patterns, and accessibility for the native iPhone app. Product-level only — no
> implementation. IDs scoped `M-`. Append; never renumber.

## Design direction

**A blend of native iOS and Oak's brand.** Native iOS structure and interactions
(standard navigation, SF typography for system chrome, native controls, sheets,
gestures, light/dark mode) carrying **Oak's brand** — its colors, type
personality, and especially its **answer-card visual language** — so the app
feels like a first-class iPhone app and unmistakably like Oak. The existing
design system (`docs/design-system/design-system.md`) is the brand reference; it
should be adapted to iOS conventions, not pixel-copied from the web.

- **M-UI-US-1** — As a user, I want the app to feel native yet recognizably Oak,
  so it's both comfortable on iPhone and consistent with the web product.
  - **M-AC-UI1.1** — Navigation, gestures, sheets, and controls follow iOS
    conventions (Human Interface Guidelines).
  - **M-AC-UI1.2** — Oak's brand colors, typography personality, and answer-card
    styling are carried through, recognizably matching the web product.
  - **M-AC-UI1.3** — The app supports **light and dark mode** and respects the
    system setting.
  - **M-AC-UI1.4** — The app supports standard **Dynamic Type** sizing so text
    scales with the user's iOS text-size setting.

## Information architecture & navigation

The exact navigation pattern is the designer/architect's call, but it must make
the parity feature set reachable natively. A reasonable shape: a primary **Chat**
surface, **History** (signed-in), **Teams** (signed-in), and **Account/Settings**.

- **M-UI-US-2** — As a user, I want to move between chat, history, teams, and
  account easily, so the full feature set is reachable.
  - **M-AC-UI2.1** — Chat is the default/primary surface on launch.
  - **M-AC-UI2.2** — History and Teams are reachable in **one or two taps** for a
    signed-in user.
  - **M-AC-UI2.3** — For a guest, sign-in-gated areas (history, teams) are visible
    but clearly present sign-in as the unlock, rather than appearing broken.
  - **M-AC-UI2.4** — The Champions-mode toggle and "new conversation" are reachable
    from the chat surface without leaving it.

## Key screens (product-level)

- **M-UI-US-3** — Chat screen: a scrolling conversation thread with a composer.
  - **M-AC-UI3.1** — Composer supports text entry, an attach/camera control, and
    send; shows attached-image thumbnails before send.
  - **M-AC-UI3.2** — In-progress turns show streaming text + live tool activity
    (see `chat-experience.md`); answers render field-by-field (reasoning,
    citations, flags, format tag).
  - **M-AC-UI3.3** — The current data scope (standard / Champions) and the active
    team (if any) are visible from the chat surface.

- **M-UI-US-4** — History screen (signed-in): a searchable, filterable list of
  past conversations with pin/rename/delete via native list gestures (see
  `history-and-teams.md`).

- **M-UI-US-5** — Teams screens (signed-in): a team library plus a team detail/
  editor for full competitive sets, with import/export (see
  `history-and-teams.md`).

- **M-UI-US-6** — Artifact bottom sheet: a draggable sheet over chat for rich
  entity/answer artifacts with back-stack navigation (see `artifact-viewer.md`).

- **M-UI-US-7** — Account/Settings: sign-in/out, current tier/limits indication,
  account deletion, mode default, and standard about/legal links (privacy
  policy, support).

## Interaction patterns

- **M-UI-US-8** — As a user, I want native, gesture-driven interactions, so the
  app feels fluid.
  - **M-AC-UI8.1** — Lists use native patterns: swipe actions (pin/delete),
    context menus, pull-to-refresh where appropriate.
  - **M-AC-UI8.2** — Sheets are draggable/dismissible with standard gestures.
  - **M-AC-UI8.3** — The keyboard behaves correctly with the composer (avoids
    obscuring input, supports OTP autofill on the sign-in screen).
  - **M-AC-UI8.4** — Tapping an entity/citation in a structured answer opens the
    artifact sheet (see `artifact-viewer.md`).

## Accessibility

- **M-UI-US-9** — As a user who relies on assistive tech, I want the app to be
  accessible, so I can use Oak fully.
  - **M-AC-UI9.1** — Interactive elements have accessibility labels and work with
    **VoiceOver**.
  - **M-AC-UI9.2** — Text honors **Dynamic Type**; layouts don't break at larger
    sizes (content reflows/scrolls).
  - **M-AC-UI9.3** — Color is not the sole carrier of meaning (e.g.
    inference/uncertainty flags also have text/iconography); contrast meets
    standard guidance in both light and dark mode.

## Business rules

- **M-BR-UI-1** — **Chat is the default surface**; the app opens into it.
- **M-BR-UI-2** — Sign-in-gated areas are **discoverable, not hidden** — guests
  see them with a sign-in prompt, not an empty/broken screen.
- **M-BR-UI-3** — The app must work across the **supported iPhone size range**
  (smallest currently-supported iPhone through Pro Max) without clipping core
  content. (iPad-optimized layout is out of scope — see
  `platform-and-operational.md`.)

## Notes

- This file defines product-level UI intent. Detailed visual design (a mobile
  design system) is a downstream deliverable that should extend
  `docs/design-system/design-system.md` for iOS, not redefine the brand.
