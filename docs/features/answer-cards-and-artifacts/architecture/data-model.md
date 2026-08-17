# Answer cards and artifacts — Data Model

Traces to [data-and-entities.md](../requirements/data-and-entities.md).
No new database product. Additive Postgres only.

## Entities

### Citation anchor (inside `OakAnswer`)

Stored on assistant `conversation_message.answer_json` (and guest
session-store answers).

```ts
// additive optional on citationSchema
anchor?: {
  target: "answer_span" | "fact_row";
  id: string; // 1–64 chars, [A-Za-z0-9_.:#-]+
};
```

| Rule | Requirement |
|---|---|
| Absent → no highlight | CIT-AC-1.2, CIT-BR-2 |
| Invalid → stripped, answer still valid | CIT-BR-3 |
| `answer_span` ids the marked span in `answer_markdown` | CIT-AC-1.1 |
| `fact_row` ids a candidate `name` or a documented fact key | CIT-AC-1.1 |
| Never rewritten on historical rows | CIT-AC-2.2 |

**Span marking (product-visible, architecture-mandated):** new answers
may include a zero-width HTML comment in `answer_markdown`:
`<!-- span:c0 -->…claim…<!-- /span:c0 -->` where `anchor.id = "c0"`.
The renderer highlights that range. If the comment is missing, no
highlight even if `anchor` exists (**CIT-BR-2**).

### Account compact preference

| Column | Type | Notes |
|---|---|---|
| `account.answer_density` | `text` NULL | `'full' \| 'compact'`. NULL = full (**COMPACT-BR-2**) |

Guest: **not stored**. `localStorage["oak-answer-density"]`.

### Conversation artifact pin

New table `conversation_artifact_pin`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `account_id` | text NOT NULL | isolation; other-account ≡ missing |
| `conversation_id` | text NOT NULL | FK logical to `conversation.id` |
| `kind` | text NOT NULL | `'team_sheet' \| 'comparison' \| 'calc'` |
| `title` | text NOT NULL | strip label, ≤ 80 |
| `snapshot_json` | text NOT NULL | versioned snapshot (below) |
| `created_at` | bigint NOT NULL | epoch-ms |

Indexes: `(account_id, conversation_id, created_at)`, unique
`(account_id, conversation_id, id)`.

**Cap 5** is enforced in the repo (`count` then insert, or insert +
count in one transaction; 6th → error `pin_cap`). Not a DB check
constraint so the error is addressable.

**Cascade:** conversation delete and account delete remove pins
(**PIN-BR-5**). Implement in the existing delete paths (repo), not
only a SQL FK (conversation id is not a formal FK today — match
that style).

### Pin snapshot shapes (versioned)

```ts
type PinSnapshotV1 =
  | { v: 1; kind: "team_sheet"; format: Format; team: ProposedTeam | SavedTeamDetail }
  | { v: 1; kind: "comparison"; left: EntitySnapshot; right: EntitySnapshot }
  | { v: 1; kind: "calc"; scenario: CalcScenario; result: CalcResult };
```

`EntitySnapshot` is the `ok` payload of `GET /api/entity` at pin
time (or a documented subset: profile fields the compare renderer
needs). Reopen **must not** re-fetch (**PIN-AC-2.1**). Unknown `v`
or `kind` → couldn’t-load + still unpin-able (**PIN** failure state).

### Voice hydrate (not a table)

In-process only:

```ts
// tool-trace-store
type VoiceTrace = {
  conversationId: string;
  calls: { name: string; input: unknown; output: unknown }[];
  updatedAt: number;
};
```

TTL 30 min. Key = conversation / voice `session_id`.

Conversation GET adds an ephemeral (computed) field, not a column:

```ts
hydrate?: {
  assistant_message_id: string;
  status: "running" | "failed" | "done";
};
```

`done` may be omitted. `running` lives in the in-process hydrate
registry (same `globalThis` pattern as the turn store). `failed` is
a short-TTL flag so Reload still shows Retry. After success the
field is absent and `answer_json` is the full card.

### Team / proposed team (unchanged)

`team.members` remains one JSON document. Add-to-team does not
change the table. Incoming slot is a `TeamMember` with species +
whatever fields the surface already had; others = `blankMember()`
defaults (**ADD-BR-2**).

## Relationships

```
account
  ├── answer_density
  ├── team[]
  └── conversation[]
        ├── conversation_message[]   (answer_json ± citation.anchor)
        └── conversation_artifact_pin[]  (0–5)
```

## Validation and permissions

| Object | Who writes | Isolation |
|---|---|---|
| `citation.anchor` | model, then sanitize | n/a |
| `answer_density` | owning account | AUTH-BR-2 |
| pin | owning account + owning conversation | AUTH-BR-1/2/3 |
| team members | owning account via existing PUT | existing team isolation (404) |

## Migration

`web/drizzle/0020_answer_card_artifacts.sql` (use the next journal
id if 0020 is taken by then):

1. `ALTER TABLE account ADD COLUMN answer_density text;`
2. `CREATE TABLE conversation_artifact_pin (…);`
3. Indexes as above.

No backfill. NULL density = full. No pin rows.

**Re-ingest is not required.** No index table changes.

## Retention

Pins live as long as the conversation. Account deletion deletes
pins (extend the existing account-delete repo). No prune job.

Guest calc/compare/table state is session-only (React / VM).
