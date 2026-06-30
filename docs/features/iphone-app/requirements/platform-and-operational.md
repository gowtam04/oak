# Oak for iPhone — Platform & Operational

> Backend relationship, online/offline behavior, non-functional requirements,
> App Store compliance, security/privacy, constraints, out-of-scope, and open
> questions. IDs scoped `M-`. Append; never renumber.

## Backend relationship

The iPhone app is a **client to Oak's existing deployed backend** — the same
product, accounts, and data as the web app. The owner's directive: **reuse the
existing API, and add new endpoints only where mobile genuinely needs them.**

- **M-BR-PLAT-1** — **No second backend.** Web and iPhone share one backend, one
  data store, and one account namespace. The app holds **no LLM keys and no DB
  access** (consistent with `CLAUDE.md`'s client/seam boundary).
- **M-BR-PLAT-2** — **Reuse first.** Chat (the `POST /api/chat` SSE seam), auth
  (email OTP), history, and teams are reused as-is wherever the existing API
  already serves them.
- **M-BR-PLAT-3** — **New mobile endpoints are additive and minimal.** Where the
  current web API doesn't expose something the app needs (candidate examples:
  in-app **account deletion**; a clean **history/teams** read API if the web
  relies on server-rendered pages rather than a consumable API; future push
  registration), new backend endpoints may be added. These must not change or
  break existing web behavior.
  - *Note for the architect:* an early task is to **audit which parity features
    already have a clean, client-consumable API** vs. which are currently
    coupled to the web frontend, and to enumerate the minimal new endpoints. This
    audit is a known dependency, not a scope expansion.

## Online / offline behavior

- **M-NFR-1** — **Online-only, graceful.** Producing answers requires the network
  (the model is server-side). There is **no offline answering** and **no offline
  cache of history/teams** in v1.
- **M-AC-NFR1.1** — When there's no connection, the app shows a clear "no
  connection" state and a way to retry, rather than hanging or showing a raw
  error.
- **M-AC-NFR1.2** — A mid-stream connection drop is surfaced as a recoverable
  error without leaving an ambiguous half-rendered answer (see
  `chat-experience.md` M-AC-4.4).

## Performance & reliability

- **M-NFR-2** — **Responsive streaming.** First visible feedback (the in-progress
  / tool-activity state) appears promptly after send; answer text streams
  token-by-token as the backend delivers it. The app must not buffer the whole
  answer before showing anything.
- **M-NFR-3** — **Smooth UI.** Scrolling the thread, opening the artifact sheet,
  and list interactions are smooth on currently-supported iPhones; the artifact
  sheet feels effectively instant for data already on screen (M-AC-A4.1).
- **M-NFR-4** — **Resilience.** Backend in-domain failures render as normal
  answers with a status; only transport faults surface as errors. The app never
  crashes on a well-formed error response.
- **M-NFR-5** — **Launch & session.** The app launches into a usable state
  quickly; a signed-in user is restored to their session without re-entering an
  OTP each launch (M-AC-2.5).

## App Store compliance

Because the launch target is a **public App Store release** (no TestFlight-only
phase) and the app has **accounts**, these are hard requirements:

- **M-NFR-6** — **In-app account deletion** is provided (Apple Guideline
  5.1.1(v)) — see `accounts-and-access.md` M-ACCT-US-6.
- **M-NFR-7** — **Privacy disclosures.** The app ships with an accurate App Store
  **privacy nutrition label** and a reachable **privacy policy**, covering what's
  collected (e.g. email for auth, conversation content sent to the backend and
  its model provider, any analytics) and how it's used.
- **M-NFR-8** — **Permission purpose strings.** Camera and photo-library access
  use clear, honest purpose strings and are requested only on use (M-AC-5.6).
- **M-NFR-9** — **Sign in with Apple is not required in v1.** Email OTP is a
  first-party login (not third-party social sign-in), so Apple's SIWA requirement
  (Guideline 4.8 / 4.0) does not apply. If a third-party social login is ever
  added, SIWA must be reconsidered. (Recorded so the reviewer rationale is clear.)
- **M-NFR-10** — **Not a thin web wrapper.** The app is genuinely native (native
  rendering of answers, history, teams, artifacts), satisfying the "minimum
  functionality" expectation for native apps.
- **M-NFR-11** — **Age rating & content.** An accurate age rating is set; content
  is Pokémon reference/strategy (no objectionable content expected).

## Security & privacy

- **M-NFR-12** — **Secure transport.** All backend communication is over HTTPS.
- **M-NFR-13** — **Secure credential storage.** Session tokens/credentials live
  only in the iOS secure store and are removed on sign-out and account deletion
  (M-BR-ACCT-5).
- **M-NFR-14** — **Per-account isolation** is enforced end-to-end (inherited from
  the web product); the app must never display another account's data.
- **M-NFR-15** — **Data minimization on device.** The app stores no more
  personal data on the device than needed to operate (e.g. session token; no
  durable local copy of history/teams in v1, consistent with online-only).

## Constraints and preferences

> Inputs for the architect — not decisions made here.

- **M-CON-1** — **Native Swift / SwiftUI.** The owner prefers a fully native iOS
  app built in Swift/SwiftUI. (Implication: the web app's pure TypeScript modules
  — schemas, formulas, SSE types — are **not** reused as code; the app re-expresses
  the `OakAnswer` contract and SSE wire format natively. The architect should
  treat the existing `src/agent/schemas.ts`, `src/lib/sse/sse-types.ts`, and
  `src/data/teams/team-schema.ts` as the **authoritative wire/data contracts** to
  mirror in Swift.)
- **M-CON-2** — **iPhone only, v1.** No iPad-optimized layout, no Android (see
  Out of Scope).
- **M-CON-3** — **Reuse the existing backend** (M-BR-PLAT-1..3); do not fork data
  or accounts.
- **M-CON-4** — **No hard deadline**, but launch target is the public App Store;
  scope should be sequenced (see `overview.md` priority guidance) so a shippable,
  parity build is reached.
- **M-CON-5** — **Free with tiered limits.** No In-App Purchase / StoreKit, no
  paid tier in v1; the existing guest/signed-in rate limits apply.

## Out of scope (v1)

Hard boundaries — a builder must not invent these:

- **M-OOS-1** — **Push notifications.** A known future goal (it was one of the
  motivations), but **not in v1**; no APNs integration or notification UI ships in
  v1. (When added later, it will need backend push-registration support — noted in
  M-BR-PLAT-3.)
- **M-OOS-2** — **Home-screen widgets** and **Siri / Shortcuts**.
- **M-OOS-3** — **iPad-optimized experience** and **Android app**. (The app should
  run on iPad in iPhone-compatibility mode by default, but no iPad-specific layout
  is designed.)
- **M-OOS-4** — **Apple Watch** companion.
- **M-OOS-5** — **In-App Purchase / subscriptions / paid tiers.**
- **M-OOS-6** — **Offline answering** and **offline caches** of history/teams.
- **M-OOS-7** — **Sign in with Apple** and any social logins (email OTP only).
- **M-OOS-8** — **Sharing/exporting conversations or artifacts** beyond the team
  Showdown export already specified (M-TEAM-US-2). Artifacts remain ephemeral.
- **M-OOS-9** — **New agent capabilities / new artifact types / model selection
  UI.** The app surfaces the existing agent and its existing outputs; it does not
  extend Oak's reasoning, tools, or output schema.

## Open questions

- **M-OQ-1** — **API audit (M-BR-PLAT-3):** which parity features already have a
  clean client-consumable API, and exactly which new mobile endpoints are needed?
  (To be resolved by the architect early; affects sequencing.)
- **M-OQ-2** — **Analytics:** do we want any usage analytics/crash reporting in
  v1 to observe the aspirational adoption signals (downloads/retention/rating)?
  If yes, it must be reflected in the privacy label (M-NFR-7). Default assumption:
  minimal/none unless the owner opts in.
- **M-OQ-3** — **Minimum supported iOS version** and **oldest supported iPhone**
  — to be set by the architect (affects available SwiftUI APIs and the size range
  in M-BR-UI-3).
- **M-OQ-4** — **Branding/store identity:** the codebase uses both "Oak" and
  "Pokébot" in places; the App Store name, icon, and any IP/trademark
  considerations for a Pokémon-related app need to be settled before submission.
