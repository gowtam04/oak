# Chat QoL — Data and entities

Business-level only. Not a schema.

## Entities this pack touches

### Conversation (existing)

Account-owned. Already has title, format/sticky scope, timestamps,
ordered turns, conversation-level pin.

**This pack adds:**

- Optional **folder** membership (one folder or unfiled).
- **Archived** flag (independent of folder).
- **Per-turn pins** (ordered set of assistant turn identities in that
  conversation).

Lifecycle: still created on first successful signed-in turn (or guest
import on sign-in). Archive hides; delete is still permanent
(**BR-H8**). Deleting a conversation does **not** revoke its share
snapshots.

### Turn / pair (existing)

User message + assistant `OakAnswer`. Stopped/undone turns never
become a pair.

**This pack adds no new stored answer schema.** Retry and edit
**replace** the last pair on success; they do not accumulate versions.

Voice turns remain whatever transcript/minimal answer is stored today.
Retry/edit of those become text turns.

Images remain consume-on-turn and are **not** a stored entity.

### Folder (new, signed-in)

A named grouping owned by one account. No nesting. May be empty.

Lifecycle: user creates, renames, deletes. Deleting a folder unfiles
its conversations; it does not delete them.

### Share snapshot (new, signed-in owner)

An immutable copy of **one** user question + one full structured
answer, created at share time. Has an unguessable public identity, a
created time, and a revoked-or-live state.

Lifecycle: create → live (anyone with the URL can view) → revoke
(unavailable forever). Not mutated by retry, edit, or conversation
delete. Not indexed for search engines.

Does **not** include consume-on-turn images.

Ownership: the creating account. Viewers do not own the snapshot.
Importing a proposed team creates a **new Team** on the viewer’s
account.

### Team mention (turn-scoped binding)

A reference from a user message to one or more account-owned Teams,
resolved at send time to a stable team identity and bound for that
turn only.

If the team cannot be resolved at send, the turn does not start.
Renames later do not rewrite old message text.

### Scope preference / MRU (signed-in)

Existing `last_used_scope` remains the default for a **new** chat.

**This pack:** a chip pick with no message updates that preference
immediately, and a signed-in MRU list of scopes (chip picks + scopes
that actually resolved on sent turns) is remembered for picker
ordering.

Guests: sticky scope on the current session/conversation only; no
account MRU.

### Team (existing)

Unchanged except: public-share “Open in Oak” may **create a new team**
from a proposed-team snapshot; `@mention` binds an existing team for
the current turn.

## Relationships

```
Account
  ├── Conversations
  │     ├── Turns (user + OakAnswer)
  │     ├── Per-turn pins → assistant turns
  │     ├── Folder? (0..1)
  │     └── archived?
  ├── Folders
  ├── Teams
  ├── last_used_scope + scope MRU
  └── Share snapshots (live | revoked)
        └── optional proposed team (copied into viewer's Teams on import)
```

## Ownership and isolation

All new durable objects are strictly account-scoped (**BR-A9** /
**BR-H1**). A share snapshot is the only object a **non-owner** may
read, and only via the unguessable URL while live. No cross-account
list, search, or revoke.

## What is deliberately not an entity

- Saved prompts
- Share report / flag
- Image blobs on history or on the snapshot
- Chip lists on `OakAnswer`
- Calculator or compare artifacts
- Version history of regenerated answers
