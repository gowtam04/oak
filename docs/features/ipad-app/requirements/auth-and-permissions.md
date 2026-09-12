# Oak for iPad — Auth and Permissions

> Same roles and gates as iPhone. This file specifies **how those gates
> appear on iPad**, not a new auth product. Canonical behavior:
> `docs/features/iphone-app/requirements/accounts-and-access.md`.

## Roles

| Role | Chat | Dex / Usage / Calc | Teams / History / Pins / Voice | Settings |
| --- | --- | --- | --- | --- |
| **Guest** | Full, guest rate limit, ephemeral thread | Full | Destinations visible; content locked behind sign-in (Voice gated) | Sign-in, appearance, about |
| **Signed-in** | Full, higher limit, durable history | Full | Full | Account, sign-out, deletion, Shared by me if present |

No admin, no paid tier, no Sign in with Apple, no social login.

- **P-AUTH-US-1** — As a guest, I want to use Oak on iPad immediately
  and see what sign-in unlocks.
  - **P-AUTH-AC-1.1** — First launch: Chat works with no sign-in wall
    (M-AC-1.1 on this shell).
  - **P-AUTH-AC-1.2** — Sidebar still shows Teams (and any other
    signed-in destination). Opening it presents the unlock, not an
    empty/broken library (`P-TEAM-AC-1.1`).
  - **P-AUTH-AC-1.3** — Chat list column explains that sign-in saves
    conversations (`P-CHAT-AC-1.5`).
  - **P-AUTH-AC-1.4** — Voice controls remain unavailable until
    signed-in (`P-CHAT-AC-5.4`).

- **P-AUTH-US-2** — As any user, I want email OTP in a panel that fits
  iPad, with the same passwordless rules.
  - **P-AUTH-AC-2.1** — Sign-in is a **centered panel**: email, then
    6-digit code. System OTP autofill works (`P-SET-AC-2.1`).
  - **P-AUTH-AC-2.2** — Correct code signs in to the **same** account
    as web/iPhone/Android. New email creates an account; existing
    email must not duplicate (M-AC-2.3).
  - **P-AUTH-AC-2.3** — Wrong/expired code: error, retry/resend. Panel
    stays open.
  - **P-AUTH-AC-2.4** — Session is long-lived across launches until
    sign-out, expiry, or deletion (M-AC-2.5).
  - **P-AUTH-AC-2.5** — Switching destination while the panel is open
    dismisses it **without** signing in (`P-SHELL-AC-6.1`). Rotate
    does not dismiss it.

- **P-AUTH-US-3** — As a guest who signs in mid-thread, I keep my
  conversation (M-ACCT-US-4).
  - **P-AUTH-AC-3.1** — The on-screen guest thread becomes the first
    saved conversation and remains the live thread (`P-WF-AC-6.1`).
  - **P-AUTH-AC-3.2** — Companion, if it was showing that thread,
    continues to show it.

- **P-AUTH-US-4** — As a signed-in user, I can sign out and delete my
  account on iPad.
  - **P-AUTH-AC-4.1** — Sign-out returns to guest and removes the
    session from the device (M-AC-3.1).
  - **P-AUTH-AC-4.2** — In-app account deletion is in Settings detail,
    confirmed in a centered panel, and has the same data-deletion
    outcome as iPhone (`P-WF-AC-10.1`). Cancel is safe.

## Rate limits

- **P-AUTH-AC-5.1** — Hitting a limit shows the existing specific
  message (guest: sign-in raises the limit). The message appears in
  the thread/companion, not as a raw system alert without copy.

## Isolation

- **P-AUTH-BR-1** — **Per-account isolation** end-to-end. iPad must
  never show another account’s conversations, teams, or pins.
- **P-AUTH-BR-2** — Guests see **no** durable history list and **no**
  pins (`P-CHAT-BR-5`).
- **P-AUTH-BR-3** — Sign-in-gated areas are **discoverable, not
  hidden** (`P-SHELL-BR-6`).
- **P-AUTH-BR-4** — No new identity providers.

## Cross-links

- Panel lifetime: `shell-and-adaptation.md`
- Settings presentation: `reference-and-tools.md`
- Guest Chat list: `chat-and-artifacts.md`
