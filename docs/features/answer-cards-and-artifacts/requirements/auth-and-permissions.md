# Access and permissions

No new roles. The only split is **guest vs signed-in**. Voice remains
an existing signed-in-only surface.

## Roles

| Role | Identity | This pack |
|---|---|---|
| Guest | Session only | Calculator, Dex hop, table tools, in-session compare, citation highlight, device compact/full, Showdown copy. **No** Add to team, **no** Pin |
| Signed-in user | Account | Everything in this pack, including Add to team, Pin, durable compact/full, voice card hydration |
| Operator | Existing admin allowlist | No new queue or settings tab. Existing turn-record read includes hydrated voice cards once they exist |

## Capability matrix

| Capability | Guest | Signed-in |
|---|---|---|
| Open in Dex from artifact | Yes | Yes |
| Citation highlight + open source | Yes | Yes |
| Candidate sort / filter / row-pin / TSV | Yes | Yes |
| Compare with… (in-session) | Yes | Yes |
| Calculator full screen + overlay + `/calc` | Yes | Yes |
| Explain this calc (starts a turn) | Yes (counts as an ask) | Yes |
| Copy proposed team Showdown paste | Yes | Yes |
| Compact/full default | Device only | Account |
| Add to team / create new team from picker | **Hidden** | Own teams only |
| Pin / unpin / pin strip | **Hidden** | Own conversations only |
| Voice card hydration | — (no guest voice) | Yes |

## Rules

- **AUTH-BR-1 — Hide, do not tease.** Guests must not see **Add to
  team** or **Pin**. If a stale client calls those actions, the
  product result is “not available / sign in,” never another user’s
  team or pin.
- **AUTH-BR-2 — Account isolation.** Add to team writes only the
  caller’s teams. Pins list only the caller’s conversation. Compact
  account preference is the caller’s.
- **AUTH-BR-3 — No escalation by id.** Knowing a team id, pin id, or
  conversation id must not let a guest or another account mutate or
  read those objects.
- **AUTH-BR-4 — Public hops do not require an account.** Calculator,
  Dex, table, compare, highlight, and Showdown copy work while
  signed out.
- **AUTH-BR-5 — Explain and voice hydrate are asks / turn work.**
  They honor existing rate limits and the one-turn-per-conversation
  cap. They do not get a side channel that bypasses those caps.
- **AUTH-BR-6 — No new auth method.** Email/OTP and existing
  sessions stay.

## Permission-deny states (observable)

- Guest UI: Add to team and Pin are absent, not disabled-looking.
- Signed-in user opens another account’s conversation by guess: existing
  history isolation; no pin strip for that id.
- Signed-in user adds to a team they no longer own / that was
  deleted: honest “team is gone,” no write.
- Sixth pin: refuse with an explanation (**PIN-AC-3.1**), not a
  403-as-empty.

## Session expectations

Existing guest `session_id` and signed-in cookie/Bearer rules stay.
Background turns stay one-per-conversation. Explain-this-calc and
voice hydration must not start a second live generate on a busy
thread.
