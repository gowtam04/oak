# Oak for Android — Business Requirements: Overview

> A native **Android** client for Oak, the existing deployed Pokémon chat
> agent (`README.md`, `CLAUDE.md`), at full feature parity with the web app
> and the native iPhone app (`docs/features/iphone-app/`). Defines **what**
> the Android app must do and **why** — not technical decisions.
>
> **ID scoping.** Requirements here are prefixed **`D-`** (Droid), distinct
> from web's unprefixed IDs and iPhone's `M-` IDs. Append; never renumber.
>
> **Written current** (no update banners needed): the six-scope model, no
> active-team feature, and the Teams Assistant panel are reflected directly
> below — unlike the iPhone docs, which predate some of these changes.

## How to read this against the iPhone spec

`docs/features/iphone-app/requirements/` remains the canonical description
of shared product behavior (personas, the `OakAnswer` contract, auth,
history, team semantics). Each Android file opens with an index table
mapping relevant `M-` IDs to a status: **Same** (identical, one-line
summary, full criteria stay in the iPhone doc), **Modified** (same outcome,
different platform mechanism — full write here), **Replaced** (the product
behavior itself changed since the iPhone doc, e.g. Champions toggle →
six-scope chip — full write here), or **N/A** (retired product-wide before
Android started, e.g. active team — no Android surface at all).

## What we're building

A **native Android application** (Kotlin + Jetpack Compose) bringing Oak to
Android at full feature parity with web and iPhone: reasoned, cited answers
with inference/uncertainty flags and a format tag, as a first-class Material
3 app, not a website in a shell. It is a **client** to the existing deployed
backend — same product, accounts, and data. Both mobile enablers a client
needed (Bearer auth, in-app account deletion) already shipped for iOS, so
Android needs **no new backend work** (`platform-and-operational.md`).

## Why this exists

Same motivations as iPhone, in priority order: **(1) better mobile UX**
beating the responsive web page; **(2) Play Store presence** for the large
Android share of Pokémon-fan traffic; **(3) native device capabilities** —
camera/photo capture now, push notifications deferred. Without it, Android
users are limited to the responsive web page.

## Scope

**In scope (v1): full parity with web and iPhone**, one file per area: chat
(streamed/cited answers, six-scope chip, image input), accounts & access
(guest/OTP sign-in, tiered limits, continuity, deletion), history & teams
(history folded into Chat, team builder, Teams Assistant, no active team),
artifact viewer (Material 3 bottom sheet, drill-down back stack, predictive
back), UI & experience (Material 3 brand, 3-tab nav, accessibility), and
platform & operational (backend relationship, offline behavior, performance,
Play Store compliance, security, constraints, out-of-scope).

## Users and personas

**Same as iPhone** (`iphone-app/requirements/overview.md` §Users and
personas): **guest** (full chat at the lower rate limit, ephemeral session,
unobtrusive sign-in prompt) and **registered user** (verified-email account,
long-lived session, higher limit, durable history/teams). The same account
works across web, iPhone, and Android.

## Success criteria

- **D-SUCCESS-1** — Everything a web/iPhone user can do (chat,
  guest/signed-in, history, teams + Teams Assistant, artifacts, images,
  scope picking), except items deferred in `platform-and-operational.md`
  §Out of scope.
- **D-SUCCESS-2** — Genuinely native and polished on Android — Material 3
  navigation/gestures (incl. predictive back), smooth streaming, native
  camera/photo-picker capture, Oak's brand without borrowed iOS chrome.
- **D-SUCCESS-3** — Full structural answer fidelity: reasoning, citations,
  inference/uncertainty flags, format tag, sprites, tables.

Adoption signals (installs, rating, retention) are aspirational, not
primary, same as iOS.

## Priority guidance for the architect

1. **Foundation** — SSE streaming client, guest session, core chat loop.
2. **Accounts & access** — OTP sign-in, sessions, rate limits, continuity,
   deletion.
3. **History & teams** — history in Chat tab, team builder, Teams Assistant.
4. **Artifact viewer** — bottom-sheet artifacts, entity drill-down.
5. **Camera/photo input** — native capture/picker into the existing
   pipeline.
6. **Polish & Play Store readiness** — design fidelity, accessibility,
   data-safety disclosures (submission itself deferred).

## Relationship to existing docs

`docs/features/iphone-app/requirements/` and the underlying web feature docs
define canonical shared behavior this doc set indexes against. `CLAUDE.md`
anticipates a sibling client folder (e.g. `android/`) alongside `web/` and
`ios/`, talking to the same `POST /api/chat` (SSE) seam with no LLM keys or
DB access on the client.
