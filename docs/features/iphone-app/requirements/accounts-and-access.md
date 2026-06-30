# Oak for iPhone — Accounts & Access

> Guest mode, email one-time-code (OTP) sign-in, sessions, tiered rate limits,
> guest→sign-in continuity, and in-app account deletion. Mirrors the web auth
> model (`docs/features/account-creation/requirements/requirements.md`) on a
> native iPhone surface. IDs scoped `M-`. Append; never renumber.

## Overview

Oak is usable immediately as a **guest**, with no sign-in wall. Signing in is an
**upgrade**, not a gate: it raises usage limits and unlocks durable history
(`history-and-teams.md`) and the team builder. Authentication is **passwordless**
— the user enters an email, receives a 6-digit one-time code, and verifies it; a
new email creates an account, an existing email logs into the same one. There are
**no passwords, no social logins, no magic links** in v1. **Sign in with Apple is
not included in v1** (with first-party email-OTP login, Apple does not require it;
see `platform-and-operational.md`).

The **same account** spans web and iPhone — signing in on the phone with an email
already used on the web reaches the same account, history, and teams.

## User stories

### Guest mode

- **M-ACCT-US-1** — As a first-time user, I want to use Oak without signing in,
  so I can try it instantly.
  - **M-AC-1.1** — On first launch, I can ask questions and get answers with no
    sign-in step.
  - **M-AC-1.2** — As a guest I'm subject to the **lower guest rate limit**, and
    durable history / team builder are presented as sign-in-gated upgrades, not
    broken features.
  - **M-AC-1.3** — A guest's conversation lives only for the session (ephemeral,
    not persisted to an account); the app does not imply it's saved.
  - **M-AC-1.4** — An unobtrusive, always-available way to sign in is present
    (not a blocking modal on launch).

### Email OTP sign-in

- **M-ACCT-US-2** — As a user, I want to sign in with just my email and a code,
  so I have no password to manage.
  - **M-AC-2.1** — I enter my email; the system sends a 6-digit code to it.
  - **M-AC-2.2** — Entering the correct code within its validity window signs me
    in; a wrong/expired code shows a clear error and lets me retry or resend.
  - **M-AC-2.3** — A new email creates an account automatically; a returning
    email logs into the **same** account (no duplicate account).
  - **M-AC-2.4** — On iPhone, the OTP entry supports the **system one-time-code
    autofill** (the code surfaced from Messages) for low-friction entry.
  - **M-AC-2.5** — After sign-in, the session is **long-lived** — I stay signed
    in across app launches until I sign out or the session expires; I am not
    re-prompted for a code on every launch.

- **M-ACCT-US-3** — As a signed-in user, I want to sign out, so I can leave the
  account on a shared or old device.
  - **M-AC-3.1** — Signing out returns me to guest mode and removes my
    credentials/session from the device.

### Guest → sign-in continuity

- **M-ACCT-US-4** — As a guest who signs in mid-conversation, I want to keep the
  conversation I already have on screen, so signing in costs me nothing.
  - **M-AC-4.1** — When I sign in while a guest conversation is on screen, that
    conversation is preserved and becomes my first saved conversation in history
    (consistent with the web's guest-continuity rule).
  - **M-AC-4.2** — The pre-sign-in turns remain intact and readable after the
    transition.

### Rate limits

- **M-ACCT-US-5** — As any user, I want to understand when I've hit a usage
  limit, so I'm not confused by a sudden failure.
  - **M-AC-5.1** — When the backend rate limit is reached, the app shows a clear,
    specific message (what happened, and that signing in raises the limit for
    guests) — not a generic error.
  - **M-AC-5.2** — Signing in raises the limit to the signed-in tier without
    losing the current conversation.

### Account deletion (App Store requirement)

- **M-ACCT-US-6** — As a signed-in user, I want to delete my account and its data
  from within the app, so I control my data (and so the app meets App Store
  policy).
  - **M-AC-6.1** — A clearly reachable in-app flow lets a signed-in user request
    **account deletion** (not merely sign-out).
  - **M-AC-6.2** — The flow explains what will be deleted (account, durable
    history, saved teams) and requires explicit confirmation.
  - **M-AC-6.3** — On confirmation, the account and its associated personal data
    are deleted on the backend, and the app returns to guest mode.

## Business rules

- **M-BR-ACCT-1** — **Guest is never a wall.** Core chat must work fully without
  an account; sign-in only adds capability and higher limits.
- **M-BR-ACCT-2** — **One account per verified email.** A returning email always
  resolves to the same account; the same account is shared across web and iPhone.
- **M-BR-ACCT-3** — **Strict per-account isolation.** A signed-in user sees only
  their own conversations and teams; no cross-account visibility (inherited from
  web BR-A9). There is no admin role.
- **M-BR-ACCT-4** — **Tiered limits, no bypass.** Guests get the lower limit,
  signed-in users the higher; the app must not let one account multiply its
  allowance by cycling guest sessions (enforcement is server-side; the app must
  not work around it).
- **M-BR-ACCT-5** — **Credentials live only in secure device storage.** Session
  tokens/credentials are stored in the iOS secure store and are removed on sign-
  out and on account deletion. (Mechanism is the architect's call; the
  requirement is secure storage + clean removal.)
- **M-BR-ACCT-6** — **Account deletion is real deletion**, processed on the
  backend — not just a local sign-out — to satisfy App Store Guideline 5.1.1(v).

## Dependencies & notes

- Email delivery, OTP generation/validation, session issuance, and rate-limit
  enforcement are **existing backend responsibilities**; the app consumes them.
  Any mobile-specific need (e.g. a deletion endpoint if one doesn't exist yet) is
  a candidate "new mobile endpoint" — see `platform-and-operational.md`.
- Durable history and team builder are unlocked by sign-in and specified in
  `history-and-teams.md`.
