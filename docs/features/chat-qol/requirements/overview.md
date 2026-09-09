# Chat quality of life — Business Requirements

> Product discovery for the Chat QoL pack selected from
> `docs/product-ideas.md` §1. This is a **delta on existing chat**, not a
> new product. IDs are namespaced per area and are stable; append, never
> renumber.
>
> **No application code ships from this document set.** Next step after
> approval is `/architecture-blueprint`.

## Overview

Oak already answers well. Daily chat still punishes small mistakes and
keeps good answers trapped in a private scroll. This pack makes the
existing thread faster to recover, easier to organize, and able to leave
the app — without adding a calculator, a compare page, or add-to-team.

It is one requirements pack. All seventeen selected items are in scope.
Architecture may phase the build; nothing here is optional or deferred.

### Why it exists

A typo, a missed generation name, or a thin answer currently costs a
whole retyped turn. History is pin / rename / search / format-filter
only. The only export is “Copy for agents.” A scope-chip pick with no
follow-up message is forgotten. Returning signed-in users still land on
a blank desk.

The cost of the status quo is wasted turns, lost work, and answers that
cannot be shown to a Discord or VGC group without a screenshot.

### Goals

- Recover from a bad last turn without retyping (retry, edit, undo).
- Let an answer leave Oak as human text, a public snapshot link, or a
  conversation export.
- Let signed-in users pin, fork, folder, and archive threads so long
  team-build chats stay navigable.
- Bind a named team and offer only follow-up hops that already have a
  surface (scope, Dex, Teams, usage, new chat).
- Make web keyboard users able to jump without discovering Teams or Dex
  by accident.
- Make the empty desk useful for people who already have history, and
  make a scope-chip pick stick the moment it changes.

### Success criteria

- A signed-in or guest user can regenerate the last answer and, on
  success, see exactly one current answer for that last question; a
  failed or stopped regenerate leaves the previous answer.
- A signed-in or guest user can correct the last user message or undo a
  send within about three seconds without retyping from scratch.
- A human-readable copy (prose + fact table + caveats, plus a Showdown
  paste when a team was proposed) lands on the clipboard; “Copy for
  agents” still exists.
- A signed-in user can publish one turn to a public, noindex,
  unguessable URL, revoke it later from the card or Shared-by-me, and a
  viewer can import a proposed team into their own account.
- A signed-in user can export one conversation as Markdown and as a
  simple PDF.
- A signed-in user can pin several turns in a thread, fork from a
  chosen turn, put conversations in one folder or none, archive without
  deleting, and bulk-delete / bulk-archive / bulk-move.
- `@team` binds a saved team for that turn; a dead mention blocks send.
- Follow-up chips never invent a surface this pack does not have.
- A chip pick with no message is still the conversation’s sticky scope
  (and signed-in last-used scope). Signed-in scope pickers show MRU
  first.
- The same behaviors land on **web, iOS, and Android** except the
  command palette and keyboard shortcuts, which are web-only.

## Users and personas

Inherited from account-creation and chat-history. This pack splits
capabilities by identity, not by a new role.

| Persona | What they get in this pack |
|---|---|
| **Guest** | Retry, edit last, undo send, human copy, follow-up chips that do not need an account (`Switch to {scope}`, `Open {entity} in Dex`), slashes that have a surface on that client (`/new`, `/dex`, `/usage` where the page exists), guest empty starters, chip pick sticks for **this session/thread only**. No history list, no share, no export, no pin, no fork, no folders, no `@mention`, no MRU ranking. |
| **Registered user (signed-in)** | Everything a guest gets, plus public share + revoke + Shared-by-me, export, pin, fork, folders/archive/bulk, `@mention`, returning-user empty state, durable MRU scopes, last-used-scope on chip pick. |
| **Operator** | No new report queue and no new admin surface in this pack. Existing operator read access to turns still applies. Public shares are owner-revoked. |

There is no collaborator, no shared inbox, and no end-user model picker.

## Document map

| File | Contents |
|---|---|
| [overview.md](./overview.md) | Vision, personas, success, priorities, out of scope |
| [turn-recovery.md](./turn-recovery.md) | Retry, edit last message, undo send |
| [leave-the-app.md](./leave-the-app.md) | Human copy, public share, export |
| [organize.md](./organize.md) | Pin a turn, fork, folders, archive, bulk actions |
| [composer-and-navigation.md](./composer-and-navigation.md) | `@mention`, chips, slashes, palette, shortcuts, empty state, scope persist, MRU |
| [data-and-entities.md](./data-and-entities.md) | Business entities, ownership, lifecycle |
| [auth-and-permissions.md](./auth-and-permissions.md) | Guest vs signed-in rules |
| [ui-and-experience.md](./ui-and-experience.md) | Screens, control placement, empty/error states |
| [operational.md](./operational.md) | NFRs, privacy, constraints, open questions |

## Priority guidance

All seventeen items are in scope for this pack. If architecture must
phase, prefer this order (recovery first, then leave-the-app, then
organize, then composer/navigation). That is **build order**, not a
cut list.

1. Retry, edit last, undo send, persist chip pick, MRU scopes.
2. Human copy, public share + revoke + Shared-by-me + Open in Oak, export.
3. Pin a turn, fork, folders/archive/bulk.
4. `@mention`, follow-up chips, slashes, empty state.
5. Web command palette and shortcuts.

## Assumptions

None. Discovery was not on the speed path.

## Out of scope

Treat as a hard boundary.

- Persist attached images in history (images stay consume-on-turn).
- Paste detection, saved prompts / prompt library.
- Filter history by kind, semantic search over history.
- Cross-scope compare in one turn.
- Visible rate-limit remaining, turn-still-running banner.
- Damage calculator, compare page, add-to-team from artifacts.
- `/calc`, `/compare`, “Open this calc,” “Add {species} to a team” as
  chips or slashes.
- Whole-conversation sharing; indexable public Q&A; a public report
  button or flag queue.
- Guest share, guest export, guest pin/fork/folders, guest `@mention`.
- Command palette or keyboard shortcuts on iOS/Android.
- Changing the agent’s tool contract, `OakAnswer` schema, or games-only
  policy, except: server-bind of `@mention` tokens on the current turn
  (same class of binding the old active-team chip used).
- New onboarding / first-run tour.

## Selected catalog items (traceability)

From `docs/product-ideas.md` §1:

1. Retry / regenerate the last turn
2. Edit last message and resend
3. Copy answer as human text
4. Share this answer as a public read-only link
5. Export a conversation as Markdown or PDF
6. Pin a turn inside a conversation
7. Branch / fork a conversation
8. Undo send
9. `@mention` a saved team in the composer
10. Suggested follow-ups that do work (surfaces that already exist)
11. Command palette (web)
12. Keyboard shortcuts (web)
13. Slash commands (existing surfaces only)
14. Conversation folders, archive, bulk delete
15. Better empty state for returning users
16. Persist a scope-chip pick with no follow-up message
17. Most-recently-used scopes at the top
