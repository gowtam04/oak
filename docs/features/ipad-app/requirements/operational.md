# Oak for iPad — Operational

> Non-functional expectations, constraints, out of scope, and open
> questions. Personas: guest and signed-in. Depends on `overview.md`.

## Non-functional requirements

Online-only, streaming, and resilience **match iPhone**
(`docs/features/iphone-app/requirements/platform-and-operational.md`)
unless noted.

- **P-NFR-1 — Online-only, graceful.** No offline answering, no new
  offline cache of history/teams. No-connection and mid-stream drop
  behave as on iPhone (`P-WF-AC-1.2`, `P-CHAT-AC-2.4`).
- **P-NFR-2 — Responsive streaming.** First in-progress feedback
  appears promptly after send; token-by-token thereafter. Companion
  chat streams the same way as the Chat thread.
- **P-NFR-3 — Smooth splits.** Scrolling each pane, dragging companion
  or inspector splits, rotating, and resizing Split View stay usable
  on Mini through 13-inch. Opening an inspector for on-screen data
  stays effectively instant (`P-ART-AC-1.4`).
- **P-NFR-4 — Resilience.** In-domain failures render as answers;
  transport faults are recoverable errors. Resize/rotate must not
  crash or blank the shell (`P-WF-AC-8.1`).
- **P-NFR-5 — Launch & session.** Launch into Chat quickly; signed-in
  session restores without a new OTP (M-AC-2.5).
- **P-NFR-6 — App Store.** In-app account deletion remains
  (`P-AUTH-AC-4.2`). Privacy nutrition label and privacy policy stay
  accurate. Camera/photo purpose strings unchanged in meaning.
  **iPad screenshot set** is required (`P-SUCCESS-5`). The listing
  must not claim new agent features. Still free, no IAP.
- **P-NFR-7 — Not a web wrapper.** Native iPad UI, native answer
  rendering — same bar as iPhone M-NFR-10 on this idiom.
- **P-NFR-8 — Security.** HTTPS, secure session storage, per-account
  isolation (`P-AUTH-BR-1`). No extra personal data stored “for iPad.”
- **P-NFR-9 — Supported devices.** Every iPad that runs the app’s
  **existing minimum iOS version**, including **Mini**, 11-inch, and
  13-inch, portrait and landscape, plus Split View / Stage Manager
  compact widths (`P-SHELL-AC-5.1`).
- **P-NFR-10 — Accessibility.** VoiceOver, Dynamic Type, Reduce
  Motion, contrast — `ui-and-experience.md`.
- **P-NFR-11 — Pointer and keyboard.** Hardware keyboard typing and
  trackpad click/scroll/secondary-click are first-class
  (`P-SHELL-US-7`). Shortcut cheatsheets are out of scope.

## Constraints and preferences

Inputs for architecture — not decisions made here beyond what product
already locked.

- **P-CON-1 — Same native iOS app.** Swift/SwiftUI client family as
  today’s iPhone app. iPad is an idiom/layout of that app, not a
  second listing and not a web view.
- **P-CON-2 — iPhone UI frozen.** Shared code is allowed; **iPhone
  visual IA and layouts must not change** as a side effect.
- **P-CON-3 — Reuse the existing backend** (`P-API-BR-1`–`3`).
- **P-CON-4 — No hard deadline.** Launch bar is `P-SUCCESS-1`–`5`,
  sequenced per `overview.md` priority guidance.
- **P-CON-5 — Free, no IAP.** Same guest/signed-in rate limits.
- **P-CON-6 — Champions-first.** Display-only regulation chip; no
  generation picker; living teams are Champions.
- **P-CON-7 — Minimum iOS stays whatever the iPhone app already
  requires** (currently iOS 18 in the iPhone spec). Do not raise it
  for iPad-only APIs unless product revisits this.

## Out of scope

Hard boundaries — builders must not invent these:

- **P-OOS-1 — New Oak capabilities.** No new agent tools, artifact
  types, model picker, scopes, example prompts, or features the
  current iPhone app lacks. Layout and interaction only.
- **P-OOS-2 — iPhone redesign.** No tab-bar, sheet, or chat changes
  on iPhone to “match iPad.”
- **P-OOS-3 — Mac / Catalyst / keyboard-shortcut suite.** Hardware
  keyboard **typing** is in scope; shortcut commands and a Mac app
  are not.
- **P-OOS-4 — Apple Pencil features, multi-window product, widgets,
  push, Watch.** System scribble in text fields may work if the OS
  provides it. Multiple Oak windows are not designed. Push, widgets,
  and Watch remain future.
- **P-OOS-5 — Android tablet and web tablet in this project.** Web
  and Android keep current behavior. A later parity pass is a
  different project.
- **P-OOS-6 — Offline answering / new caches** of history or teams.
- **P-OOS-7 — Sign in with Apple and social logins.**
- **P-OOS-8 — Dedicated external-display UI.**
- **P-OOS-9 — Admin panel** on this client.
- **P-OOS-10 — Changing listing category, price, or claiming
  whole-franchise Dex coverage.**

## Open questions

Documentation notes, not product blockers:

- **P-OQ-1 — Local persistence of companion open/closed and split
  ratios.** Product allows session-only; architecture may persist
  locally. Must not sync as an account setting unless a later product
  decision says so (`data-and-entities.md`).
- **P-OQ-2 — Exact compact-width breakpoints.** Product defines the
  **order** of collapse (sidebar → rail; Chat drops list first; then
  stack inspector/companion). Pixel breakpoints are architecture/design.
- **P-OQ-3 — Whether Stage Manager can spawn a second Oak window.**
  Product does not design multi-window. If the system allows it,
  each window should still follow iPad collapse/stack rules rather
  than crash; consistency across two windows is not a launch
  requirement.

## Assumptions

None.

## Success recap

Ship when `P-SUCCESS-1`–`5` in `overview.md` are true: iPhone
capability parity, distinct portrait and landscape layouts on every
destination, answer fidelity, resize/rotate continuity without
falling back to iPhone UI, and an iPad App Store screenshot set.
