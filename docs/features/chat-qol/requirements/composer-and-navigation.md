# Chat QoL — Composer and navigation

`@mention` a saved team, follow-up chips that hop to existing surfaces,
slash commands, the web command palette and shortcuts, a returning-user
empty state, and scope-chip persist + MRU.

Web, iOS, and Android except palette and shortcuts (web only).

Depends on: existing scope chip and resolver, existing Dex routes,
existing Teams, existing web usage/`/meta` pages, existing history
list, existing empty-desk starters.

## User stories

### MEN-US-1 — @mention a saved team

As a signed-in user, I want to mention a saved team in the composer so
that Oak binds that team instead of guessing its name.

- **MEN-AC-1.1** — Given I am signed in and have at least one saved
  team, when I type `@` in the composer, then an autocomplete lists my
  teams by current name and I can insert one or more mentions.
- **MEN-AC-1.2** — Given I send a message that contains one or more
  valid mentions, when the turn starts, then the server binds those
  teams onto the turn the same way the old per-conversation active-team
  chip was bound — Oak does not have to string-match the display name.
- **MEN-AC-1.3** — Given a mention refers to a team that was deleted
  or is not mine, when I try to send, then send is **blocked**, the
  dead mention is highlighted, and no turn starts.
- **MEN-AC-1.4** — Given I rename a team after I already sent a
  message that mentioned it, when I reopen that old message, then the
  text still shows the name as typed. New autocomplete uses the new
  name.
- **MEN-AC-1.5** — Given I am a guest, when I type `@`, then there is
  no team autocomplete (guests have no saved teams).

### CHIP-US-1 — Suggested follow-ups that hop to a real surface

As a guest or signed-in user, I want follow-up chips that do something
real so that I am not offered “tell me more.”

- **CHIP-AC-1.1** — Given an assistant answer that implies another
  format (for example a Champions miss that exists in Scarlet/Violet,
  or prose that names another generation already in the eleven scopes),
  when the card renders, then at most **one** chip offers “Switch to
  {that scope}.” Choosing it changes the header scope chip (and
  therefore the next send’s seed / sticky pick — SCOPE-US-1).
- **CHIP-AC-1.2** — Given an assistant answer whose primary subjects
  include species, moves, abilities, or items that have Dex pages,
  when the card renders, then up to **three** “Open {entity} in Dex”
  chips are shown. Choosing one opens the Dex profile (web route or
  native Dex screen).
- **CHIP-AC-1.3** — Given the turn bound or mentioned a saved team and
  I am signed in, when the card renders, then at most **one** “Open
  {team}” chip is shown. Choosing it opens that team. Guests do not
  see this chip.
- **CHIP-AC-1.4** — Given an answer, when chips render, then there is
  **no** chip for add-to-team, open-in-calculator, compare-as-a-page,
  or a dead-end “tell me more.” Copy, share, retry, edit, pin, and
  fork are card actions, not suggestion chips.
- **CHIP-AC-1.5** — Given an answer with nothing to hop to, when it
  renders, then no empty chip row is shown.

### SLASH-US-1 — Slash commands for existing surfaces

As a guest or signed-in user, I want a few slashes so that I can leave
the composer for a surface I already have.

- **SLASH-AC-1.1** — Given I submit `/new`, when it is handled, then a
  new empty chat starts (same as New chat). The slash is not sent as
  a user message.
- **SLASH-AC-1.2** — Given I submit `/team` or `/team {name}`, when it
  is handled, then Teams opens (list, or that team if the name matches
  one of mine). Guests hitting `/team` open the existing guest Teams
  empty/sign-in state, not a chat turn.
- **SLASH-AC-1.3** — Given I submit `/dex` or `/dex {name}`, when it is
  handled, then Dex opens (index, or that entity if it resolves).
- **SLASH-AC-1.4** — Given I submit `/usage` **and** this client has a
  usage/meta page, when it is handled, then that page opens. If this
  client has **no** usage page, `/usage` is treated as unknown text
  and is sent as a normal message (SLASH-AC-1.5).
- **SLASH-AC-1.5** — Given I submit an unknown slash (including
  `/calc`, `/compare`, and `/usage` on a client without that page),
  when I send, then the composer text is sent as a **normal user
  message**. It is not an error and not stripped.
- **SLASH-AC-1.6** — Given I am mid-sentence and the text is not a
  leading slash command, when I send, then it is a normal message
  even if it contains a later `/word`.

### NAV-US-1 — Command palette (web)

As a signed-in or guest web user, I want ⌘K so that I can jump without
leaving the composer to hunt through the rail.

- **NAV-AC-1.1** — Given I am on web, when I press the palette shortcut
  (⌘K on macOS, Ctrl+K on other desktops) or open the palette from
  UI, then I can search and run: New chat, jump to a conversation
  (signed-in), open a Dex entry, open a saved team (signed-in) or the
  Teams surface, open the usage page if it exists.
- **NAV-AC-1.2** — Given I am a guest, when I open the palette, then
  conversation and saved-team jumps are absent or disabled; New chat,
  Dex, and usage (if present) still work.
- **NAV-AC-1.3** — Given I am on iOS or Android, when I look for a
  command palette, then there is none.
- **NAV-AC-1.4** — Given I skipped saved prompts in this pack, when the
  palette lists actions, then there is no prompt-library entry.

### NAV-US-2 — Keyboard shortcuts (web)

As a web user, I want documented shortcuts for the daily chat actions.

- **NAV-AC-2.1** — Given I am on web, when shortcuts are active, then
  there are dedicated shortcuts for: new chat, focus composer, Stop,
  open history search (signed-in), open the scope picker, pin/unpin
  the current conversation (signed-in), and the palette itself.
- **NAV-AC-2.2** — Given I open Account or the `?` overlay on web, when
  I view it, then those shortcuts are listed. Exact key chords are an
  implementation choice that must not steal ordinary typing from the
  focused composer (except the documented palette / focus / Stop
  chords).
- **NAV-AC-2.3** — Given I am on iOS or Android, when I look for these
  shortcuts, then they are not required.

### EMPTY-US-1 — Returning-user empty state

As a signed-in user opening a new empty chat, I want a desk that
continues my work, not only four random starters.

- **EMPTY-AC-1.1** — Given I am signed in, I have at least one past
  conversation or saved team, and the current thread is empty, when
  the desk renders, then I see: continue last conversation (if any),
  last saved team I used or opened (if any), the current/last scope,
  **and** the existing four starters (Battle / Dex / Rules / Meta).
- **EMPTY-AC-1.2** — Given I am a guest and the thread is empty, when
  the desk renders, then I see the existing four starters and not a
  continue-last row.
- **EMPTY-AC-1.3** — Given I am signed in but have no conversations and
  no teams yet, when the desk renders, then the continue-last / last
  team rows are omitted and the four starters remain.
- **EMPTY-AC-1.4** — Given there is no standalone calculator in this
  pack, when the desk renders, then there is no “last unanswered calc”
  row.

### SCOPE-US-1 — Persist a scope-chip pick with no follow-up message

As a guest or signed-in user, I want a chip pick to stick even if I
never send, so that the chip does not feel broken.

- **SCOPE-AC-1.1** — Given I change the header scope chip and I do
  **not** send a message, when I immediately inspect the chip and the
  conversation’s sticky scope, then both match the pick I just made.
- **SCOPE-AC-1.2** — Given I am signed in and I change the chip with no
  message, when the pick is stored, then `account.last_used_scope` is
  also updated to that pick (same as a sent turn that resolved to it).
- **SCOPE-AC-1.3** — Given I am a guest and I change the chip with no
  message, when I stay in this session/thread, then the pick sticks
  for this conversation. It is not an account preference (guests have
  none). A new guest session still defaults to national-dex.
- **SCOPE-AC-1.4** — Given existing resolver precedence, when I later
  send a message, then an explicit in-message signal still outranks
  the chip/sticky pick. This pack does not change that order except
  that a chip pick is no longer “forgotten if you never send.”

### SCOPE-US-2 — Most-recently-used scopes at the top

As a signed-in user, I want recently used games first in the picker.

- **SCOPE-AC-2.1** — Given I am signed in and I have used at least one
  scope via a **chip pick** or via a **resolved sent turn**, when I
  open the scope picker, then those scopes appear first (most recent
  first), then the remaining scopes in the existing release-date
  order.
- **SCOPE-AC-2.2** — Given I am a guest, when I open the scope picker,
  then order stays release-date descending (already shipped). Guests
  do not get MRU ranking.
- **SCOPE-AC-2.3** — Given I have never picked or resolved a given
  scope, when I open the picker, then that scope is not in the MRU
  group.

## Business rules

- **MEN-BR-1 — Mentions are server-bound, not name-matched.** A valid
  `@team` on send is resolved to a stable team identity the agent
  receives as bound context for **that turn**. The model is not asked
  to guess which saved team was meant.
- **MEN-BR-2 — Dead mention blocks send.** A mention that cannot be
  bound (deleted, not owned, malformed) prevents the turn from
  starting. The user must fix it.
- **MEN-BR-3 — Multiple mentions allowed.** All valid mentions on the
  message are bound. There is no one-team cap.
- **MEN-BR-4 — Guests cannot mention.** No autocomplete, no bind.
- **CHIP-BR-1 — Chips only hop to surfaces that already exist.** Scope
  chip, Dex, Teams (signed-in). No new product surfaces in the chip
  row.
- **CHIP-BR-2 — Caps.** At most one scope-switch chip, three Dex
  chips, one team chip. No empty chip row.
- **CHIP-BR-3 — Chips are derived from the structured answer and turn
  context**, not from a new model-authored “suggestions” field. This
  pack does not add a chip list to `OakAnswer`.
- **SLASH-BR-1 — Known slashes navigate; unknown slashes are text.**
  Known: `/new`, `/team`, `/dex`, and `/usage` only when that client
  has a usage page. `/calc` and `/compare` are unknown in this pack.
- **SLASH-BR-2 — A handled slash is not a chat turn.** It must not
  consume a completed ask or write a user/assistant pair.
- **NAV-BR-1 — Palette and shortcuts are web-only.** Native clients do
  not implement them in this pack.
- **NAV-BR-2 — Shortcuts must not eat composer typing** except the
  documented chords (palette, focus composer, Stop).
- **EMPTY-BR-1 — Guests keep today’s starters.** Continue-last is
  signed-in and omitted when there is nothing to continue.
- **SCOPE-BR-1 — A chip pick is immediately sticky.** It does not wait
  for a send. Signed-in picks also update last-used-scope.
- **SCOPE-BR-2 — MRU is signed-in and includes both chip picks and
  resolved turn scopes.** Guests stay on release-date order.
- **SCOPE-BR-3 — Resolver precedence is otherwise unchanged.**
  In-message signal still outranks seed/sticky/preference/default.

## Edge, empty, and conflict states

| State | Behavior |
|---|---|
| No saved teams | `@` shows an empty/no-teams state, not a crash. Send without a mention still works. |
| `/team` name does not match | Open Teams list, not a chat turn. |
| `/dex` name does not resolve | Open Dex index or a not-found Dex empty state, not a chat turn. |
| Usage page missing on iOS/Android | `/usage` sends as normal text (SLASH-AC-1.4). Palette omits usage. |
| Scope picker disabled while a turn streams | Existing rule stays. A pick made after the turn can still persist (SCOPE-US-1). |
| New signed-in user, no last conversation | EMPTY-AC-1.3. |

## Out of this file

Saved prompts, paste detection, semantic search, visible rate-limit —
out of pack. Damage calculator and compare page — out of pack; do not
reintroduce them as slashes or chips.
