# Chat QoL — Access and permissions

No new roles. The only split is **guest vs signed-in**, plus **anyone
with a live share URL**.

## Roles

| Role | Identity | History | This pack |
|---|---|---|---|
| Guest | Session only | Ephemeral, not server-persisted (**BR-H1**) | Recovery + human copy + non-account chips/slashes + in-session chip persist |
| Signed-in user | Account | Durable, account-scoped | Everything in this pack |
| Public viewer | None required | None | View a live share; import a proposed team only after sign-in |
| Operator | Existing admin allowlist | Existing cross-account read | No new report queue, no new share-moderation inbox |

## Capability matrix

| Capability | Guest | Signed-in | Public viewer |
|---|---|---|---|
| Retry / edit last / undo send | Yes | Yes | — |
| Human copy | Yes | Yes | Not on the public page unless we also offer copy there — **yes, copy on the public card is allowed** (it is already public). Share/export/pin/fork are not. |
| Create share | No | Yes (own turns) | No |
| View live share | Yes (as viewer) | Yes | Yes |
| Revoke share / Shared-by-me | No | Own shares only | No |
| Export conversation | No | Own conversations only | No |
| Pin turn / fork / folders / archive / bulk | No | Own conversations only | No |
| `@mention` team | No | Own teams only | No |
| Open {team} chip | No | Yes | No |
| Switch scope / Open Dex chips | Yes | Yes | Dex links on a public card may open public Dex pages |
| `/new` `/dex` | Yes | Yes | — |
| `/team` | Opens guest Teams/sign-in empty | Opens Teams | — |
| `/usage` | If that client has the page | Same | — |
| Command palette / shortcuts | Web: yes, without signed-in jumps | Web: full | — |
| Returning empty state | No (keep starters) | Yes | — |
| Persist chip pick | This session/thread | Conversation + last-used-scope | — |
| MRU scopes | No | Yes | — |
| Import proposed team from share | After sign-in | Yes (new team on *their* account) | After sign-in |

## Rules

- **AUTH-BR-1 — No new auth method.** Email/OTP (and existing session)
  stay. This pack does not add passkeys or Sign in with Apple.
- **AUTH-BR-2 — Share view is unauthenticated.** A live URL must
  render without cookies. Revoke and Shared-by-me require the owning
  session.
- **AUTH-BR-3 — Import is the viewer’s team.** Open in Oak never
  writes the owner’s teams or opens the owner’s conversation.
- **AUTH-BR-4 — Dead or foreign team mention cannot send.** A mention
  of another account’s team, or a deleted team, is treated as unbound
  (**MEN-BR-2**).
- **AUTH-BR-5 — History organize never leaks across accounts.** Folder
  names, pins, archive state, and bulk actions run only on the
  caller’s conversations (**BR-H1**).
- **AUTH-BR-6 — Guests cannot escalate by URL.** Knowing a
  conversation id, turn id, or folder id must not grant share, export,
  pin, fork, or organize. Those stay session-authenticated to the
  owner.

## Permission-deny states (observable)

- Guest taps a signed-in-only control that is hidden: they should not
  see it. If a stale client calls an owner-only action, the product
  result is “not available / sign in,” never another user’s data.
- Non-owner opens Shared-by-me: their own list only (possibly empty).
- Non-owner tries to revoke a share: no effect; URL stays live.
- Signed-in user mentions a team they do not own: send blocked.

## Session expectations

Existing session and guest `session_id` rules stay. Background turns
stay one-per-conversation. Recovery actions (retry/edit/undo) must
honor that cap so a second device still gets `turn_in_progress`
rather than a silent second generate.
