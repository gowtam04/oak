# Spend Controls — Business Requirements

> IDs in this document are namespaced with `SC-` to stay distinct from the
> main app and from other features. IDs are stable: append new ones, never
> renumber.

## Overview

Oak currently has **no daily spend bound** and **no way to stop a single
account**. The only chat throttle is a per-minute request cap (20/min guest,
60/min signed-in). That cap never fires for a heavy human user: one account
(`jogyehyeong199@gmail.com`) ran **169 agent turns in ~2.5 days** (~76 on the
peak day, max 13/hour) and drove essentially **all** of the last week's model
cost (~$18/day run-rate).

This feature adds two operator-controlled spend gates, checked **before any
model call**:

1. **Account denylist** — a signed-in account whose email is on the list cannot
   start agent turns on chat, Teams Assistant, or voice.
2. **Daily turn cap** — a shared **UTC-day** budget of agent turns. Launch
   defaults: **25 turns / signed-in account / UTC day** and **10 turns / guest
   IP / UTC day**. The operator can change both numbers in the admin panel
   without a deploy.

The existing per-minute limiter is **unchanged**. These gates are additional,
not a replacement.

The denylist ships **empty**. The operator adds the current heavy user (or
anyone else) from the panel after deploy — v1 does not pre-load any email.

### Goals

- Stop a single account from running unbounded model spend.
- Give the operator a denylist and a daily cap they can change without a
  deploy or a code change.
- Fail closed on the agent path: if the check cannot be completed, Oak does
  **not** start a model turn.
- Tell the user honestly why they were stopped, on every client that can start
  an agent turn (web, iOS, Android).
- Leave ordinary light use (a handful of chats a day) untouched.

### Success Criteria

- A denylisted account cannot start a chat turn, a Teams Assistant turn, or a
  voice session; no model call is made.
- A signed-in non-admin account that has already used 25 admitted agent turns
  since the current UTC midnight is refused the 26th, with a “try tomorrow”
  message that includes the reset time.
- A guest IP that has already used 10 admitted agent turns since the current
  UTC midnight is refused the 11th, with the same class of message.
- Allowlisted admin emails (`ADMIN_EMAILS`) are never denylisted or capped.
- The per-minute limiter still behaves exactly as today.
- Changing the denylist or the two cap numbers in the admin panel takes effect
  on the **next** admission attempt, with no deploy.

### Priority Notes (for the architect)

Ship denylist and daily cap together. The empty denylist is intentional (SC-BR-12);
do not bake in a specific email at launch.

## Users and Personas

- **The Owner / Operator (you).** Sole admin. Pays the model bill. Needs to
  denylist an account by email and to raise/lower the daily caps without
  waiting on a deploy. Already uses `/admin` (allowlisted via `ADMIN_EMAILS`).
- **Signed-in end user.** Chats, uses Teams Assistant, and (if they use it)
  voice. Light users never notice the cap. A power user who hits 25 turns in a
  UTC day is stopped until the next UTC midnight.
- **Guest.** Chat only (no Teams Assistant, no voice — those remain signed-in
  only). Capped per client IP, not denylistable.
- **Denylisted signed-in user.** Can still sign in, browse history, and use
  non-agent surfaces. Cannot start agent turns. Honest copy tells them the
  account cannot use chat (and the equivalent on Assistant / voice).

Non-admin users never see the denylist or the cap numbers in the admin panel.

## User Stories

### Operator — denylist

- **SC-US-1** — As the operator, I want to denylist a signed-in account by
  email from the admin panel, so that that person cannot start another paid
  agent turn without a deploy.
  - **SC-AC-1.1** — Given I am signed in as an allowlisted admin, when I add a
    normalized email that belongs to an existing non-admin account to the
    denylist, then the next chat / Teams Assistant / voice admission for that
    account is refused **before** a model call.
  - **SC-AC-1.2** — Given a denylisted email, when that person signs out, signs
    back in, or creates a new account with the **same** email, then they are
    still refused (identity is the email, not a particular account id).
  - **SC-AC-1.3** — Given I add an email that is on `ADMIN_EMAILS`, when I
    submit, then the panel rejects the add and the admin account remains able
    to use agent turns (SC-BR-6).
  - **SC-AC-1.4** — Given the denylist is empty (launch state), when any
    non-admin signed-in user is under their daily cap, then they are admitted
    the same as today aside from the new daily counter.

- **SC-US-2** — As the operator, I want to remove an email from the denylist,
  so that I can restore access without a deploy.
  - **SC-AC-2.1** — Given an email is on the denylist, when I remove it, then
    the next admission attempt for that account is evaluated only against the
    daily cap and the existing per-minute limiter.
  - **SC-AC-2.2** — Given I am not an allowlisted admin, when I call any
    denylist read or write, then I receive no denylist data and no mutation
    (same gating as the rest of `/admin`).

- **SC-US-3** — As the operator, I want to see who is currently denylisted, so
  that I know who I have blocked.
  - **SC-AC-3.1** — Given one or more denylisted emails, when I open the spend-
    controls admin surface, then I see each email and when it was added.
  - **SC-AC-3.2** — Given no emails are denylisted, when I open that surface,
    then I see an empty list, not a placeholder “blocked user.”

### Operator — daily cap

- **SC-US-4** — As the operator, I want to set the signed-in daily turn cap and
  the guest daily turn cap in the admin panel, so that I can tighten or loosen
  spend without a deploy.
  - **SC-AC-4.1** — Launch defaults, until the operator changes them: signed-in
    cap = **25** admitted agent turns per account per UTC day; guest cap =
    **10** admitted agent turns per client IP per UTC day.
  - **SC-AC-4.2** — Given I change either number to a positive integer, when I
    save, then the new number applies to the **next** admission attempt. Turns
    already admitted today still count toward the new cap (lowering the cap
    below today’s usage means further turns are refused until UTC midnight).
  - **SC-AC-4.3** — Given I try to set a cap to 0, a negative number, or a
    non-integer, when I save, then the panel rejects the change and the
    previous value remains in force.

### Signed-in user — under and over cap

- **SC-US-5** — As a signed-in non-admin user under the daily cap and not
  denylisted, I want chat, Teams Assistant, and voice to work as they do today.
  - **SC-AC-5.1** — Given I have 24 admitted agent turns so far today (UTC),
    when I send a 25th chat message, then the turn runs normally (model is
    called).
  - **SC-AC-5.2** — Given I have 25 admitted agent turns so far today, when I
    send a 26th chat message, then the request is refused **before** a model
    call, no answer is generated, and I see an honest banner: daily limit
    reached, try tomorrow, with the **UTC midnight reset time** shown.
  - **SC-AC-5.3** — Given I am over the cap on chat, when I try Teams Assistant
    or voice, then those are refused too — one shared budget (SC-BR-4).
  - **SC-AC-5.4** — The same over-cap banner behavior appears on **web, iOS,
    and Android**, in the same place those clients already show a per-minute
    rate-limit refusal (composer / assistant error / equivalent).
  - **SC-AC-5.5** — Given I was over cap, when the next UTC day starts, then I
    can send agent turns again up to the cap.

### Denylisted user

- **SC-US-6** — As a denylisted signed-in user, I want to be told I cannot use
  chat rather than hanging on a spinner or getting a generic failure.
  - **SC-AC-6.1** — Given my email is denylisted, when I send a chat message on
    web, iOS, or Android, then I see an honest banner that **this account
    can’t use chat**, and no model call is made.
  - **SC-AC-6.2** — Given my email is denylisted, when I try Teams Assistant,
    then I see an honest refusal that this account can’t use the assistant, and
    no model call is made.
  - **SC-AC-6.3** — Given my email is denylisted, when I try to start voice,
    then the voice session does not connect to the model provider and I am
    told this account can’t use voice.
  - **SC-AC-6.4** — Given I am denylisted, when I browse history, saved teams,
    account settings, or other non-agent surfaces, then those still work.
  - **SC-AC-6.5** — The denylist message is distinguishable from the daily-cap
    message and from the existing per-minute rate-limit message (three
    different user-visible reasons).

### Guest

- **SC-US-7** — As a guest, I want a lower daily cap than signed-in users, keyed
  the same way the existing guest per-minute limiter is keyed (client IP).
  - **SC-AC-7.1** — Given my IP has 9 admitted guest agent turns today, when I
    send a 10th, then it runs.
  - **SC-AC-7.2** — Given my IP has 10 admitted guest agent turns today, when I
    send an 11th, then it is refused before a model call, with the daily-limit
    banner and reset time.
  - **SC-AC-7.3** — Guests cannot be denylisted. Adding an email to the denylist
    has no effect on guest chat.
  - **SC-AC-7.4** — Guest daily counts and signed-in daily counts are
    **independent** (same isolation idea as BR-A8): signing in does not inherit
    the guest IP’s count, and a guest session cannot spend an account’s cap.

### Admin exemption

- **SC-US-8** — As an allowlisted admin, I want my own agent turns never gated
  by these controls, so I can keep using Oak while investigating a heavy user.
  - **SC-AC-8.1** — Given my email is on `ADMIN_EMAILS`, when I send a 26th (or
    100th) agent turn in a UTC day, then it is admitted.
  - **SC-AC-8.2** — Given my email is on `ADMIN_EMAILS`, I cannot appear as
    denylisted; attempts to add that email fail (SC-AC-1.3).

## Functional Requirements

### Surfaces that are gated

An **agent turn** for this feature is any request that would otherwise start
the paid model:

- main chat (text, with or without images)
- Teams Assistant
- voice (starting a voice session, and any subsequent voice turn that would
  call the voice model)

Not gated: history reads, team CRUD, public dex/search/sprite reads, auth OTP,
admin reads, Stop on an already-running turn, reattaching to an in-flight
stream.

### Admission order

Before a model call, evaluate in this order:

1. Denylist (signed-in, by email) → refuse with denylist copy.
2. Daily turn cap (account or guest IP) → refuse with cap copy + reset time.
3. Existing per-minute limiter → unchanged behavior.

A refusal at (1) or (2) never reaches the model and does **not** increment the
daily counter.

### What counts toward the daily cap

- Every agent turn **admitted** to run (the model is allowed to start),
  including turns that later fail, time out, or are user-Stopped.
- In-flight admitted turns count. A new request is refused if
  `completed_today + in_flight_today >= cap`.
- Refusals (denylist, daily cap, per-minute rate limit, validation 4xx) do
  **not** count.
- Chat, Teams Assistant, and voice share **one** counter per signed-in
  account per UTC day.
- Guests share one counter per client IP per UTC day, across guest chat
  only (they have no Assistant/voice).

### Day boundary

- The day is **UTC**, midnight to midnight.
- The user-visible reset time is that next UTC midnight, shown in a form the
  user can understand (include the timezone, not a bare clock).

### Operator surface

- Lives in the existing admin panel (web, allowlisted admins only). No admin
  UI on iOS/Android.
- Denylist: add by email, remove, list (email + added-at).
- Caps: two integers (signed-in daily turns, guest daily turns) with the
  launch defaults above.
- These writes are a deliberate exception to the panel’s original read-only
  rule (ADMIN-BR-2), in the same class as the existing Settings → active-model
  write. They must **not** mutate user conversations, teams, or account rows
  other than spend-control state.

### Client UX

- Same interaction pattern as today’s per-minute rate-limit refusal: hard
  stop, banner/error on the composer (chat), on the assistant, and on voice
  start; the user is not left in a streaming/in-progress state.
- Distinct copy for denylist vs daily cap vs per-minute (SC-AC-6.5).
- Daily-cap copy includes “try tomorrow” and the reset time.
- Web, iOS, and Android all implement the three messages. A web-only banner
  with silent mobile failure is not acceptable.

### Recording / operator visibility

- Admission refusals from denylist and daily cap are recorded in the same
  spirit as today’s `rate_limited` turn records: visible in the admin panel,
  no model/token cost, prompt may be stored, no answer. This is so the
  operator can see that the gate fired.

## Business Rules

- **SC-BR-1 — No model call on refuse.** Denylist and daily-cap refusals
  happen before the model is invoked. They never open a provider stream.
- **SC-BR-2 — Denylist identity is email.** The denylist key is the
  normalized account email (the same identity as BR-A2). Blocking survives
  sign-out, new sessions, and a new account row for that email.
- **SC-BR-3 — Denylist is signed-in only.** Guests cannot be denylisted.
  Guest spend is bounded only by the guest daily cap and the existing guest
  per-minute limiter.
- **SC-BR-4 — One shared daily budget per subject.** For a signed-in account,
  chat + Teams Assistant + voice share one UTC-day counter. For a guest, the
  counter is per client IP.
- **SC-BR-5 — Independent pools.** Guest IP counts and account counts never
  add together (mirrors BR-A8).
- **SC-BR-6 — Admins are exempt.** Emails on `ADMIN_EMAILS` skip denylist and
  daily cap. They cannot be added to the denylist.
- **SC-BR-7 — Per-minute limiter unchanged.** Do not change the 20/min guest
  or 60/min signed-in request caps, their keys, or their fail-open policy.
- **SC-BR-8 — Fail closed on the agent path.** If spend-control state cannot
  be read, Oak refuses the agent turn (no model call) rather than admitting
  it unpaid. This is intentionally **stricter** than the per-minute limiter’s
  fail-open policy. Non-agent routes are unaffected.
- **SC-BR-9 — In-flight turns complete.** Denylisting or lowering the cap
  does not cancel a turn that was already admitted. Only new admissions are
  refused. The user can still Stop an in-flight turn themselves.
- **SC-BR-10 — UTC day.** Counters reset at UTC midnight. There is no
  per-user timezone.
- **SC-BR-11 — Admitted turns count, refusals do not.** See “What counts
  toward the daily cap.”
- **SC-BR-12 — Empty denylist at launch.** v1 does not pre-load any email.
  The operator adds addresses after deploy.
- **SC-BR-13 — Caps are positive integers.** A cap must be ≥ 1. Changing a
  cap does not rewrite history; it only changes the threshold for the next
  admission.
- **SC-BR-14 — Honest, distinguishable copy.** Denylist, daily cap, and
  per-minute refusals are three different user-visible reasons. Denylist
  copy is not euphemized to “unavailable.”
- **SC-BR-15 — Cross-platform.** Any client that can start an agent turn
  (web, iOS, Android) must surface SC-US-5 / SC-US-6 / SC-US-7. The admin
  write UI is web-only.

## Non-Functional Requirements

- **Latency.** The admission check adds negligible delay relative to a model
  turn; it must complete before the stream would have opened, on the same
  “reject before work” path as today’s per-minute limiter.
- **Reliability.** If the spend-control store is down, agent turns are
  refused (SC-BR-8); browsing and auth keep working.
- **Security.** Denylist and cap values are admin-only. A non-admin cannot
  read or change them. End users cannot raise their own cap.
- **Privacy.** Denylist stores emails the operator already has on the
  account. No new PII class. Refusal recording follows the existing operator-
  access disclosure (guest/signed-in prompts may be stored).
- **Platform.** Enforcement is server-side (clients cannot bypass it).
  Banners on web + iOS + Android. Admin configuration on web only.
- **Scale.** Designed for Oak’s current size (single-digit / low-dozens of
  accounts). Correctness under a few concurrent turns per account matters
  more than throughput.

## UI/UX Vision

### End users (web, iOS, Android)

- **Daily cap:** composer-level (or assistant/voice equivalent) error banner,
  same visual family as the existing rate-limit banner. Text: daily limit
  reached, try tomorrow, reset time with timezone. Guest banner does **not**
  need to say “sign in to raise the daily cap” unless that copy is already
  natural next to the per-minute guest hint; do not imply that signing in
  bypasses a denylist.
- **Denylist:** same banner slot, different sentence: this account can’t use
  chat / the assistant / voice. No spinner, no empty answer card.
- **No quota chrome** on the happy path (no “12/25 turns left” indicator in
  v1).

### Operator (admin panel, web)

- A spend-controls section (Settings or Accounts — architect’s layout call)
  with:
  - denylist: email field + add, list with remove, empty state
  - two cap fields with current values and launch defaults shown as
    placeholders/help
- Immediate success/error feedback on save. No “deploy to apply” language.

## Constraints and Preferences

> Inputs for the solution architect — not decisions made here.

- **Existing stack.** Next.js monolith, admin panel already gated by
  `ADMIN_EMAILS`, dual-backend state tier (in-process / Redis) already used
  by the per-minute limiter. Prefer extending that world over a new system.
- **ADMIN-BR-2 amendment.** The original admin panel is read-only except the
  later Settings → active-model write. Denylist and cap writes are a second
  explicit exception, limited to spend-control state. Do not open general
  account editing, conversation deletion, or session revocation in this
  feature.
- **Existing per-minute limiter (BR-A8) stays.** Do not retune 20/60.
- **Voice cost.** Refusing voice must happen before Oak mints/uses a
  provider voice session, so a denylisted or over-cap user does not incur
  voice-provider charges.
- **Cross-platform bug rule.** Chat/assistant/voice banners are a
  three-client change. Admin UI is web-only and exempt.

## Assumptions

None. The interview locked the product forks (daily **turns**, honest hard
stop, admin panel, all three agent surfaces, admin exemption, empty denylist
at launch, guest per-IP cap). Launch guest default of **10** is the concrete
“lower than 25” counterpart of that decision.

## Open Questions

None that block architecture. Tuning the two integers after launch is an
operator action, not a spec gap.

## Out of Scope

A builder should not add these without them being moved into scope:

- Tightening or redesigning the **per-minute** 20/60 limiter.
- Pre-loading `jogyehyeong199@gmail.com` (or any email) into the denylist at
  deploy time.
- Dollar- or token-denominated budgets (v1 is turns).
- A separate, tighter cap just for team-from-box turns (that workload is
  handled by the companion `team-from-box` spec).
- Happy-path quota UI (“N turns left”).
- Paywall, subscriptions, or billing.
- IP denylist, device denylist, or guest denylist.
- Cancelling in-flight turns when someone is denylisted.
- Per-user timezone for the day boundary.
- Admin UI on iOS/Android.
- Changing agent quality, tools, or prompts (see `team-from-box`).
- Cache-aware admin cost estimates.
- Alerting / emails when someone hits the cap.
- Auto-denylist from heuristics.
- User self-service “request more turns.”
