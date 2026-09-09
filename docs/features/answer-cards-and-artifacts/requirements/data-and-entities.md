# Data and entities (business level)

No database design. These are the objects this pack adds or extends.

## Existing entities this pack uses

| Entity | Owner | How this pack uses it |
|---|---|---|
| **Answer / OakAnswer** | The turn (guest session or signed-in conversation) | Gains optional citation-to-claim links on new answers; compact rendering; Add / Dex / calc / table / paste actions |
| **Conversation** | Signed-in account, or guest session | Hosts the pin strip; current scope feeds create-new team and `/calc` |
| **Team** | Signed-in account | Destination of Add to team; format warn-but-allow unchanged |
| **Team slot** | Belongs to a Team | Written with species + copied fields; editor opens here |
| **Artifact (live)** | In-session viewer | Unchanged: one at a time, back stack, ephemeral unless pinned |
| **Dex profile** | Public index, format-scoped | Destination of Open in Dex |
| **Proposed team** | Field on an answer | Source of Showdown copy and of per-member Add to team |
| **Voice turn** | Signed-in conversation | Spoken text first; hydrates into the same answer object |

## New / extended entities

### Citation link

A best-effort attachment from one **citation** on a new answer to one
**claim target**: a sentence in the answer body or a fact-table row.

- **Owner:** the answer / turn.
- **Lifecycle:** written when the answer is produced. Never rewritten
  on historical turns. Missing link is allowed (**CIT-BR-3**).
- **Not:** a new source type. Existing citation identity stays.

### Calculator scenario

The configured attacker set, defender set, move, documented field
knobs, format, and last computed estimate.

- **Owner:** the open overlay / full screen (anyone), or a **pinned
  calc snapshot** (signed-in, that conversation).
- **Lifecycle:** ephemeral while editing; snapshot at pin time
  (**PIN-BR-1**). Explain-this-calc copies a **description** of the
  scenario into a new user message; it does not persist the scenario
  as its own account object unless pinned.
- **Not:** a saved “calc file” library.

### Comparison (user-built)

Two subjects, each a species plus a format, plus the computed side-by-
side fields (stats, types, abilities, speed, movepool diff, matchup
diff).

- **Owner:** the live viewer, or a pinned comparison snapshot.
- **Lifecycle:** created by Compare with… or by opening an answer
  block. Snapshot at pin time. Exactly two subjects.

### Pinned artifact

A snapshot of a **rich** artifact (team sheet, comparison, calc)
attached to one conversation.

- **Owner:** the signed-in account that owns the conversation.
- **Cardinality:** at most **five** per conversation.
- **Lifecycle:** created on Pin, removed on Unpin or conversation
  delete or account delete. Reopen shows pin-time data, not a live
  re-read.
- **Not:** a share, not a global library, not an entity profile.

### Compact/full preference

A single default: **full** or **compact**.

- **Signed-in:** account preference, all clients.
- **Guest:** device-only, not a server object.
- **Lifecycle:** default **full** until set. Per-card override is
  view state, not this entity.

## Relationships

```
Account
  ├── Teams
  │     └── Slots  ← Add to team writes here
  ├── Conversations
  │     ├── Turns / Answers
  │     │     ├── Citations ──(optional link)──► claim on that answer
  │     │     ├── Proposed team ──► Showdown copy; per-member Add
  │     │     └── Voice origin + hydration state
  │     └── Pinned artifacts (0–5 snapshots)
  └── Compact/full preference

Guest session
  ├── Ephemeral answers (links, table pin-in-table, compare, calc)
  └── Device compact/full only — no pins, no teams
```

## Ownership and isolation

- Pins, teams, and account compact preference never leak across
  accounts (**AUTH-BR-2**).
- A guest cannot address a pin or a team by id and get data
  (**AUTH-BR-3**).
- Snapshots contain whatever was on the artifact at pin time
  (including species names and numbers). They are the owner’s
  conversation data, same privacy class as the thread.

## Lifecycle notes for architecture (product constraints, not schema)

- Citation links must be durable on the stored answer so resume and
  all three clients can highlight without re-asking the model.
- Pins must survive client relaunch; they are not `sessionStorage`.
- Voice hydration upgrades **the same turn**, not a second row.
- Calculator compute does not create a turn. Explain does.

## Out of this file

Physical tables, API shapes, and whether citation links live inside
`OakAnswer` JSON vs a sidecar are architecture decisions. The product
constraint is: new answers can highlight; old answers never fake it;
pins are snapshots on the conversation.
