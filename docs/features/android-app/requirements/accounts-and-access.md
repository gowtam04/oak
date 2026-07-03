# Oak for Android — Accounts & Access

> Guest mode, email OTP sign-in, sessions, tiered rate limits, guest→sign-in
> continuity, in-app account deletion. IDs scoped `D-`. Append; never
> renumber.

## Index — iPhone requirements applicability

| iPhone ID | Status | Note |
|---|---|---|
| M-ACCT-US-1 (guest mode) | Same | No sign-in wall; lower guest rate limit; ephemeral session; always-available, non-blocking sign-in entry. |
| M-ACCT-US-2 (email OTP sign-in) | Modified | Same passwordless flow and same-account-across-platforms rule; entry mechanism differs — see D-ACCT-1. |
| M-ACCT-US-3 (sign out) | Same | Returns to guest, removes credentials from the device. |
| M-ACCT-US-4 (guest→sign-in continuity) | Same | Mid-conversation sign-in preserves the on-screen thread as the first saved conversation. |
| M-ACCT-US-5 (rate limits) | Same | Clear message on limit hit; sign-in raises the limit without losing the conversation. |
| M-ACCT-US-6 (account deletion) | Modified | Same outcome (real backend deletion); framed against Play policy, not Apple 5.1.1(v) — see D-ACCT-2. |
| M-BR-ACCT-1..4, 6 | Same | Guest never a wall; one account per email; per-account isolation, no admin role; tiered limits, no client bypass; deletion is real. |
| M-BR-ACCT-5 (secure storage) | Modified | Same requirement; Android mechanism is Keystore-backed, not Keychain — see D-BR-ACCT-5. |

## Android-specific requirements

### D-ACCT-1 — OTP entry: paste support, no SMS/mail autofill

- **D-AC-ACCT1.1** — Email + 6-digit code, identical backend flow to
  web/iPhone — **codes arrive by email, not SMS**.
- **D-AC-ACCT1.2** — Correct code within its window signs in; wrong/expired
  shows a clear error with retry/resend.
- **D-AC-ACCT1.3** — **No automatic autofill.** Android has no mail-scanning
  autofill equivalent to iOS Mail AutoFill, and the code isn't SMS-delivered,
  so SMS Retriever/Autofill APIs don't apply. The entry field instead offers
  first-class **paste support** — pasting a copied 6-digit code (e.g. from
  Gmail) fills all digit slots at once.
- **D-AC-ACCT1.4** — New email creates an account; returning email logs into
  the same one (no duplicates).
- **D-AC-ACCT1.5** — Long-lived session across launches/process death; no
  re-prompt per launch.

### D-ACCT-2 — Account deletion (Play policy + product parity)

- **D-AC-ACCT2.1** — A clearly reachable in-app flow (Account tab) requests
  account deletion — not merely sign-out.
- **D-AC-ACCT2.2** — Explains what's deleted (account, history, teams);
  requires explicit confirmation.
- **D-AC-ACCT2.3** — On confirmation, deletes on the backend (reusing the
  same `DELETE /api/auth/account` the iPhone app added — no new backend
  work) and returns to guest mode.
- **D-AC-ACCT2.4** — Must be **fully in-app**, satisfying Google Play's Data
  safety/account-deletion policy (apps with in-app account creation must
  support in-app account and data deletion, reachable without contacting
  support) — Android's counterpart to Apple Guideline 5.1.1(v).

## Business rules

- **D-BR-ACCT-1..4, 6** — Same as M-BR-ACCT-1..4, 6: guest never a wall; one
  account per email shared across platforms; per-account isolation, no
  admin role; tiered limits with no client-side bypass; deletion is real
  backend deletion.
- **D-BR-ACCT-5** — **Credentials live only in Android secure storage** —
  Keystore-backed encryption (not plain `SharedPreferences`), removed on
  sign-out and account deletion. Android's equivalent of M-BR-ACCT-5's
  Keychain requirement.

## Dependencies & notes

- Email delivery, OTP validation, session issuance, Bearer auth, and rate
  limits are existing backend responsibilities (already built for iPhone);
  Android consumes them as-is — **no new backend endpoints needed**.
- Durable history and the team builder (incl. Teams Assistant) are unlocked
  by sign-in — `history-and-teams.md`.
