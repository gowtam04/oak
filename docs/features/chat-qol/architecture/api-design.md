# Chat QoL — API Design

## Conventions

- Existing JSON helpers (`json(status, body)`). Errors: `{ error: string, message?: string }` — match current conversation/chat routes (`turn_in_progress`, `too_many_turns`, etc.).
- Auth: `getCurrentAccount()`. Guest = `null`. Cookie or Bearer.
- Signed-in-only routes: **401** `{ error: "unauthenticated" }` for guests.
- Not found / not owned: **404** (do not leak existence).
- `runtime = "nodejs"`, `dynamic = "force-dynamic"`, **dynamic import** of db/env-touching modules (same as `/api/chat`).
- No new rate-limit class except public share **view** uses existing `PUBLIC_READ_CONFIG` (same as `/api/entity`).

## Wire contract — `POST /api/chat` (high detail)

`web/src/lib/sse/sse-types.ts` — **portable**. Natives must ship the same fields in the same change.

```ts
interface ChatRequestBody {
  session_id: string;
  message: string;
  images?: ChatRequestImage[];
  champions_mode?: boolean;      // existing, deprecated
  scope_seed?: Format;           // existing
  /** Replace last pair on success. Omit for a normal append. */
  recovery?: "retry" | "edit";
  /** Stable team UUIDs to bind this turn. Max 6, unique. */
  mentioned_team_ids?: string[];
}
```

SSE event stream **unchanged** (`turn` → `scope` → … → `answer` | `error` | `stopped`).

### Recovery

| | |
|--|--|
| Purpose | Retry or edit last pair (REC-US-1/2) |
| When `recovery` omitted | Existing append path |
| 409 `turn_in_progress` | Existing cap — includes retry/edit |
| 409 `nothing_to_replace` | `recovery` set but last messages are not a completed user+assistant pair |
| Persist | On **successful** `answer` only: `replaceLastPair`. Stopped/error: no write |
| Guest | Same flag; session-store replace last pair |
| Images | Still consume-on-turn from this request. Missing images are a **client** warning, not a server error |

### Mentions

| | |
|--|--|
| Purpose | Bind teams (MEN-US-1) |
| Auth | If `mentioned_team_ids` is non-empty and guest → **400** `unbound_mention` (guests cannot mention) |
| Resolve | `getTeam(accountId, id)` for each. Any miss → **400** `{ error: "unbound_mention", id }` **before** `startTurn` |
| Bind | `ctx.boundTeams`; ephemeral prompt segment |
| Side effects | None persisted |

## `PUT /api/scope`

| | |
|--|--|
| Purpose | Persist chip pick with no message (SCOPE-US-1) |
| Auth | Guest allowed (session scope only) |
| Request | `{ format: Format, conversation_id?: string \| null }` |
| 400 | unknown format |
| 404 | signed-in + conversation_id not owned |
| Signed-in + conversation_id | `updateConversationFormat` + `updateLastUsedScope` + MRU `touch` |
| Signed-in + no conversation_id | `updateLastUsedScope` + MRU `touch` |
| Guest | `setSessionScope(session)` — client must send `session_id` as `?session_id=` or body `session_id` (same as stop-for-guest) |
| Response | `200 { format, lastUsedScopes?: Format[] }` (`lastUsedScopes` omitted for guests) |
| Side effects | no turn, no model |

Guest `session_id`: require query/body `session_id` matching the chat session (same ownership pattern as `POST .../stop`).

## `GET /api/auth/me` (additive)

Signed-in body **adds** `lastUsedScopes?: Format[]` (MRU, may be empty array). Keep `lastUsedScope` (singular) as today. Old clients ignore the new field.

## Folders

### `GET /api/folders` — list (signed-in)

`200 { folders: { id, name, createdAt }[] }`

### `POST /api/folders` — create (signed-in)

Request `{ name: string }` (trim, 1–40). 409 `folder_limit` / `folder_name_taken`.  
`201 { id, name, createdAt }`

### `PATCH /api/folders/:id` — rename (signed-in)

Request `{ name }`. 404 / 409 name taken. `200 { id, name }`

### `DELETE /api/folders/:id` — (signed-in)

Unfiles conversations; does not delete them. `204`.

## Conversations (existing routes, additive)

### `GET /api/conversations`

Query adds:

- `folder_id` — `unfiled` (literal) or folder UUID
- `archived` — `0` (default list) \| `1` (Archive view)
- `include_archived` — `1` on search only (ORG-AC-2.4)

Default: `archived=0` (ORG-BR-3).

Summary adds: `archived: boolean`, `folderId: string | null`.

### `GET /api/conversations/:id`

Detail adds: `archived`, `folderId`, `pinnedMessageIds: string[]` (assistant ids, seq order).

### `PATCH /api/conversations/:id`

Body may include existing `title` / `pinned` plus:

- `archived?: boolean`
- `folder_id?: string | null` (null = unfile)

404 if folder not owned.

## `POST /api/conversations/bulk` (signed-in)

```ts
{ ids: string[]; action: "delete" | "archive" | "unarchive" | "move"; folder_id?: string | null }
```

- `delete` — same as N single deletes (permanent). Confirm is **UI-only**.
- `move` requires `folder_id` (or null).
- Unknown/not-owned ids are skipped (not 404 for the whole batch) — `200 { updated: string[], skipped: string[] }`.
- Empty `ids` → 400.

## `POST /api/conversations/:id/pins` (signed-in)

Request `{ message_id: string, pinned: boolean }`.  
Message must be an **assistant** row in that conversation. 409 `pin_limit` when pinning over 50.  
`200 { pinnedMessageIds: string[] }`

## `POST /api/conversations/:id/fork` (signed-in)

Request `{ through_message_id: string }` (assistant message).  
`201 { id, title }` — client then `GET` the new conversation and navigates.  
In-flight turns are not copied (FORK edge table).

New conversation `id`: **server-minted UUID** (unlike normal chats where the client mints `session_id`). Client must treat the returned id as the new `session_id`.

## `GET /api/conversations/:id/export?format=md|pdf` (signed-in)

- `md` → `text/markdown; charset=utf-8` attachment `{title}.md`
- `pdf` → `application/pdf` attachment `{title}.pdf`
- Empty conversation → 400 `empty_conversation`
- Body: questions, answers, tables; **no** tool-activity (EXP-BR-1)

## Shares

### `POST /api/shares` (signed-in)

Request `{ conversation_id: string, assistant_message_id: string }`.  
Loads that assistant row + the immediately preceding user row. 404 if missing. 409 `share_limit`.  
`201 { id, url }` where `url` is origin-absolute `/a/{id}`.

### `GET /api/shares` (signed-in) — Shared-by-me

`200 { shares: { id, url, conversationTitle, createdAt }[] }` — **live only**.

### `DELETE /api/shares/:id` (signed-in)

Owner revoke. `204`. Non-owner 404.

### `GET /api/shares/public/:id` (public)

JSON for native + OG. Live only; revoked/unknown → 404.

```ts
{ id, question: string, answer: OakAnswer, conversationTitle: string, createdAt: number }
```

Rate-limit with `PUBLIC_READ_CONFIG`. **no** auth.

### `POST /api/shares/:id/import-team` (signed-in)

If snapshot `answer.proposed_team` missing → 400 `no_proposed_team`.  
`createTeam` on the **caller** account. `201 { team_id }`. Guest 401.

## `GET /a/[id]` (public HTML)

- Server component: load live snapshot or render unavailable page.
- Metadata: `robots: { index: false, follow: false }`. OG title = conversation title; description = first ~160 chars of question.
- `Cache-Control: private, no-store` on the HTML response (revoke immediacy).
- Renders question + existing AnswerCard (client island) + Open in Oak.
- Open in Oak: if `proposed_team`, button → sign-in then `POST .../import-team` then `/teams/{id}`; else link to `/`.
- Human copy allowed. No retry/edit/share/pin/fork.

## Internal interfaces (builders must not invent)

```ts
// conversation-repo.ts
replaceLastPair(accountId: string, conversationId: string, userText: string, answer: OakAnswer): Promise<void>
forkConversation(accountId: string, sourceId: string, throughAssistantMessageId: string, newId: string): Promise<{ id: string; title: string }>

// session-store.ts
replaceLastPair(sessionId: string, userContent: string, assistantContent: string): Promise<void>

// bound-teams.ts
type BoundTeam = { id: string; name: string; format: Format };
resolveBoundTeams(accountId: string, ids: string[]): Promise<
  | { ok: true; teams: BoundTeam[] }
  | { ok: false; error: "unbound_mention"; id: string }
>;

// share-repo.ts
createShare(input: { accountId, conversationId, conversationTitle, questionText, answer: OakAnswer }): Promise<{ id: string }>
getLiveShare(id: string): Promise<ShareRow | null>  // null if missing OR revoked
listLiveShares(accountId: string): Promise<ShareRow[]>
revokeShare(accountId: string, id: string): Promise<boolean>
deleteSharesForAccount(accountId: string): Promise<void> // used by deleteAccount
countLiveShares(accountId: string): Promise<number>

// oak-answer-human-md.ts
oakAnswerToHumanMarkdown(answer: OakAnswer): string
```

## iOS / Android

Speak the same paths. No extra native backends.

- Share sheet: `url` from `POST /api/shares`.
- Public view: `GET /api/shares/public/:id` then native AnswerCard (do not parse HTML).
- Export: download bytes from export route, then system share sheet.
- Undo: existing stop endpoint.
- Scope persist: `PUT /api/scope`.
- Fork: navigate to returned `id`.
