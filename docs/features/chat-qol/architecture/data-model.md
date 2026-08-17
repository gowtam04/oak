# Chat QoL — Data Model

Brownfield. Additive migration. No backfill of existing conversations
(folder_id NULL, archived 0, pinned 0 on messages, empty MRU, no shares).

Logical FKs only (schema convention). Every account-scoped query
filters `account_id`. Epoch-ms `bigint` with `mode: "number"`. Booleans
are `integer` 0/1.

## Textual ERD

```text
account 1──* conversation
account 1──* conversation_folder
account 1──* account_scope_mru
account 1──* shared_answer

conversation 0..1──* conversation   (folder_id → conversation_folder.id)
conversation 1──* conversation_message
conversation_message.pinned (assistant rows only)

shared_answer is a SNAPSHOT: question_text + answer_json at share time.
conversation_id is optional (conversation delete does not revoke).
account delete DELETES shared_answer rows.
```

## Caps (abuse backstops — CQ-OQ-3)

| Cap | Value | On exceed |
|---|---|---|
| Folders per account | 50 | 409 `folder_limit` |
| Folder name | 1–40 chars, unique per account (ILIKE) | 409 `folder_name_taken` / 400 |
| Pins per conversation | 50 assistant turns | 409 `pin_limit` |
| Live (unrevoked) shares per account | 200 | 409 `share_limit` |
| Fork title | existing title cap 120 | truncate `"{title} (fork)"` |

## Entities

### conversation (existing, altered)

| Field | Type | Required | Notes |
|---|---|---|---|
| id | text PK | yes | client `session_id` |
| account_id | text | yes | owner |
| title | text | yes | existing |
| format | text | yes | sticky scope; **now updated on chip pick** (SCOPE-BR-1) |
| pinned | int 0/1 | yes | conversation pin (HIST-US-9) — unchanged |
| **folder_id** | text NULL | no | logical FK → `conversation_folder.id`. NULL = unfiled (ORG-BR-1) |
| **archived** | int 0/1 | yes | default 0 (ORG-BR-2) |
| created_at / updated_at | bigint | yes | existing |

- **Ownership:** account
- **Lifecycle:** archive hides from default list; delete still hard-deletes messages + conversation. Share rows are **not** deleted (SHARE-BR-3). Folder delete sets `folder_id` NULL.
- **Indexes:** keep `(account_id, updated_at)`. Add `(account_id, folder_id)` and `(account_id, archived)`.
- **Requirement trace:** ORG-US-1/2, ORG-BR-1/2/3

### conversation_folder (new)

| Field | Type | Required | Notes |
|---|---|---|---|
| id | text PK | yes | UUID |
| account_id | text | yes | owner |
| name | text | yes | 1–40, unique per account ILIKE |
| created_at | bigint | yes | |

- **Lifecycle:** user create/rename/delete. Delete unfiles conversations in one transaction (ORG-AC-1.5).
- **Index:** unique `(account_id, lower(name))`; list `(account_id, name)`.
- **Requirement trace:** ORG-US-1, ORG-BR-1

### conversation_message (existing, altered)

| Field | Type | Required | Notes |
|---|---|---|---|
| *(existing columns unchanged)* | | | |
| **pinned** | int 0/1 | yes | default 0. Meaningful on `role = 'assistant'` only |

- **Pin strip:** `WHERE conversation_id = ? AND pinned = 1 AND role = 'assistant' ORDER BY seq`.
- **replaceLastPair:** in the conversation row lock (existing `FOR UPDATE` in `appendTurnPair`), delete the max-seq user+assistant pair (the last two rows if they are user then assistant), then insert the new pair with the next seq values (reuse the same seq numbers: lastUser.seq and lastAsst.seq). Guest: replace last two session-store entries.
- **Requirement trace:** PIN-US-1, REC-BR-2

### account_scope_mru (new)

| Field | Type | Required | Notes |
|---|---|---|---|
| account_id | text | yes | |
| format | text | yes | one of eleven `Format`s |
| last_used_at | bigint | yes | chip pick **or** resolved sent turn |

PK `(account_id, format)`. Upsert on every qualifying event.

Picker order: `ORDER BY last_used_at DESC`, then remaining formats in existing `SCOPE_PICKER_ORDER` / release-date.

- **Requirement trace:** SCOPE-US-2, SCOPE-BR-2

`account.last_used_scope` stays the single default for a **new** chat (SCOPE-AC-1.2). Chip pick with no message updates it immediately.

### shared_answer (new)

| Field | Type | Required | Notes |
|---|---|---|---|
| id | text PK | yes | `nanoid(21)`, unguessable |
| account_id | text | yes | owner (revoke / Shared-by-me / deleteAccount) |
| conversation_id | text NULL | no | informational; NULL after conversation delete is fine |
| conversation_title | text | yes | snapshot of title at share time |
| question_text | text | yes | user message at share time |
| answer_json | text | yes | full `OakAnswer` JSON — same fidelity as `conversation_message.answer_json` |
| created_at | bigint | yes | |
| revoked_at | bigint NULL | no | NULL = live |

- **Ownership:** creating account
- **Lifecycle:** create (live) → revoke (`revoked_at` set, never restored) **or** hard-delete on `deleteAccount`. Conversation delete does **not** touch this row.
- **Permissions:** anyone may **read a live** row by id. Only owner lists/revokes.
- **Indexes:** PK id; `(account_id, created_at)` for Shared-by-me (live = `revoked_at IS NULL`).
- **No images.**
- **Requirement trace:** SHARE-US-1..4, SHARE-BR-1..6, SHARE-BR-9, CQ-OQ-1

### Team mention (not a table)

Turn-scoped. Client sends `mentioned_team_ids: string[]` on `POST /api/chat`. Server loads each via `getTeam(accountId, id)`. Any miss → 400 `unbound_mention` (no turn starts). Bound teams go on `AgentContext.boundTeams` for this turn only. Not persisted as a join table (the user message text keeps the display `@Name`).

- **Requirement trace:** MEN-US-1, MEN-BR-1..3

## replaceLastPair (persist rule)

Used only when `recovery` is `"retry"` or `"edit"` and the new turn **succeeds**.

Signed-in (`appendTurnPair` path):

1. Lock conversation (`FOR UPDATE`), as today.
2. Load last two messages by `seq DESC`. If they are not `[user, assistant]` (in seq order), 409 `nothing_to_replace`.
3. `DELETE` those two rows.
4. `INSERT` the new user + assistant rows using the **same two seq values** (keeps order dense).
5. Bump `updated_at`. Do not change title on retry/edit.

Guest (`session-store`): drop the last `{role:assistant}` and its preceding `{role:user}`; append the new pair.

Stopped / transport error: do not call replace (REC-BR-2, REC-BR-4).

## deleteAccount cascade (add)

Existing transaction already deletes `conversation_message`, `conversation`, `team`, sessions, `turn_record`, `auth_event`, `otp_code`.

Add, **before** `conversation` delete (folder_id references):

1. `shared_answer` where `account_id`
2. `account_scope_mru` where `account_id`
3. `conversation_folder` where `account_id`

Then existing conversation/message deletes. Folder_id on conversation does not need a physical FK.

- **Requirement trace:** AUTH / CQ-OQ-1 (confirmed: shares die with the account)

## Relationships

| From | To | Cardinality | Cascade |
|---|---|---|---|
| account | conversation | 1..* | delete account → delete conversations |
| account | conversation_folder | 1..* | delete account → delete folders |
| folder | conversation | 0..1..* | delete folder → SET folder_id NULL |
| conversation | conversation_message | 1..* | delete conversation → delete messages; shares stay |
| account | shared_answer | 1..* | delete account → delete shares |
| account | account_scope_mru | 1..* | delete account → delete MRU |

## Migrations

One additive SQL migration: `web/drizzle/0019_chat_qol.sql` (next number after current journal — builder must use the actual next id from `web/drizzle/meta/_journal.json`).

- `ALTER TABLE conversation ADD folder_id text NULL, ADD archived integer NOT NULL DEFAULT 0;`
- `ALTER TABLE conversation_message ADD pinned integer NOT NULL DEFAULT 0;`
- `CREATE TABLE conversation_folder ...`
- `CREATE TABLE account_scope_mru ...`
- `CREATE TABLE shared_answer ...`
- indexes as above

Apply via existing `npm run db:migrate`. No ingest change. No seed.

Existing rows: unfiled, not archived, no pins, no MRU, no shares. Compatible with old clients that ignore new GET fields.
