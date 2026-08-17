# Chat QoL — Component Design

Each component: one job, what it exposes, what it depends on, where it lives.

## Data / repos

### conversation-repo (modify)

- **Owns:** `appendTurnPair`, **new** `replaceLastPair`, list filters (`folder_id`, `archived`, `include_archived`), `setArchived`, `setFolder`, `bulkUpdate`, `forkConversation`, pin helpers on messages.
- **Exposes:** existing functions plus those. Still **always** filters `accountId`.
- **Depends on:** `schema.ts`, `db`.
- **Lives:** `web/src/data/repos/conversation-repo.ts`

`forkConversation(accountId, sourceId, throughAssistantMessageId, newId)`: copy conversation row (new id, title ADR-14, same format, pinned=0, archived=0, folder_id=null); copy messages with `seq <= through.seq` (both user and assistant rows); copy `pinned` flags; return new id.

`replaceLastPair`: see [data-model.md](./data-model.md).

### folder-repo (new)

- **Owns:** create/rename/delete/list folders; delete-folder transaction (unfile).
- **Lives:** `web/src/data/repos/folder-repo.ts`

### share-repo (new)

- **Owns:** create snapshot, get live by id (public), list live by account, revoke, deleteAllForAccount, count live.
- **Lives:** `web/src/data/repos/share-repo.ts`

### scope-mru-repo (new)

- **Owns:** `touch(accountId, format, at)`, `list(accountId): Format[]`.
- **Lives:** `web/src/data/repos/scope-mru-repo.ts`

### accounts-repo (modify)

- **Owns:** add share/folder/mru deletes inside `deleteAccount`.
- **Lives:** `web/src/data/repos/accounts-repo.ts`

### session-store (modify)

- **Owns:** `replaceLastPair(sessionId, userContent, assistantContent)` for guests.
- **Lives:** `web/src/server/session-store.ts`

## Chat / agent seam

### ChatRequestBody (modify)

- **Owns:** wire fields `recovery?`, `mentioned_team_ids?`.
- **Lives:** `web/src/lib/sse/sse-types.ts` (portable — iOS/Android must mirror).

### bound-teams (new)

- **Owns:** `resolveBoundTeams(accountId, ids): BoundTeam[] | { error: "unbound_mention", id }`.
- **Depends on:** `getTeam`.
- **Lives:** `web/src/server/chat/bound-teams.ts`

### AgentContext (modify)

```ts
boundTeams?: BoundTeam[]; // { id, name, format }[] — this turn only
```

- **Lives:** `web/src/agent/types.ts`, bind in `web/src/agent/context.ts` / route.

### prompts (modify)

- **Owns:** ephemeral bound-teams segment (id, name, format + “call get_team”). **Not** in the cached prefix. Omit when `boundTeams` is empty.
- **Lives:** `web/src/agent/prompts/index.ts` (or a tiny `bound-teams.ts` imported from the style wrappers’ extra segment path — must not change byte-stable prefix segments).

### chat route + run-turn (modify)

- **Owns:** parse `recovery` / `mentioned_team_ids`; 400 unbound; persist append vs replace; fire-and-forget MRU touch on resolved format (signed-in); existing scope persist **plus** callers of PUT /api/scope for no-message picks.
- **Lives:** `web/src/app/api/chat/route.ts`, `web/src/server/run-turn.ts` (persist hook only).

## HTTP adapters (new or modify)

| Component | Job | Path |
|---|---|---|
| scope route | Persist chip pick; no turn | `web/src/app/api/scope/route.ts` |
| me route | Add `lastUsedScopes` | `web/src/app/api/auth/me/route.ts` |
| folders routes | CRUD | `web/src/app/api/folders/route.ts`, `[id]/route.ts` |
| shares routes | create / list / revoke / import-team | `web/src/app/api/shares/...` |
| public share page | noindex snapshot | `web/src/app/a/[id]/page.tsx` |
| export route | md / pdf | `web/src/app/api/conversations/[id]/export/route.ts` |
| fork route | copy prefix | `web/src/app/api/conversations/[id]/fork/route.ts` |
| pins route | pin/unpin assistant message | `web/src/app/api/conversations/[id]/pins/route.ts` |
| bulk route | delete / archive / move | `web/src/app/api/conversations/bulk/route.ts` |
| conversations GET/PATCH | folder, archived query/body | existing conversation routes |

Export builder: `web/src/server/export/conversation-export.ts` — `toMarkdown(messages)`, `toPdfBuffer(messages)` via pdfkit.

## Client-portable projections (new)

Must stay **pure** (no DOM/server). Three-client lockstep like agent markdown.

| Job | Web | iOS | Android |
|---|---|---|---|
| Human copy | `web/src/lib/oak-answer-human-md.ts` | `OakAnswerHumanMarkdown.swift` | `HumanMarkdown.kt` |
| Follow-up chips | `web/src/lib/chat/follow-up-chips.ts` | `FollowUpChips.swift` | `FollowUpChips.kt` |
| Slash parse | `web/src/lib/chat/slash-commands.ts` | `SlashCommands.swift` | `SlashCommands.kt` |

Chip inputs: `OakAnswer` + optional `impliedFormat` (from `exists_in_standard` / known format names already in the answer) + optional `mentionedTeam: { id, name }`. Outputs ≤ 1 scope + ≤ 3 Dex + ≤ 1 team.

Slash: if the string is a **leading** known command, return `{ type: "navigate", target }`; else `{ type: "message" }`. `/usage` is known only when `hasUsagePage` is true (web true; iOS/Android **false** until a usage surface ships — out of this pack).

## Web UI

| Component | Job | Path |
|---|---|---|
| page.tsx | Undo timer, recovery POST, scope PUT on chip, slash intercept, empty-desk recents | `web/src/app/page.tsx` |
| ReceiptsFooter | Human copy + Share + keep agent copy | `web/src/components/answer-card/ReceiptsFooter.tsx` |
| TurnActions | Retry (last asst), Edit (last user), Pin, Fork | new `web/src/components/chat/TurnActions.tsx` |
| PinStrip | Jump list | new `web/src/components/chat/PinStrip.tsx` |
| MentionAutocomplete | `@` list teams | new `web/src/components/chat/MentionAutocomplete.tsx` |
| FollowUpChipRow | Render derived chips | new `web/src/components/chat/FollowUpChipRow.tsx` |
| CommandPalette | ⌘K | new `web/src/components/chat/CommandPalette.tsx` |
| ShortcutOverlay | `?` / Account list | new `web/src/components/chat/ShortcutOverlay.tsx` |
| History sidebar | folders, archive, bulk | existing conversation list components |
| SharedByMe | Account | new `web/src/components/account/SharedByMe.tsx` |
| ScopeChip | MRU group | `web/src/components/controls/ScopeChip.tsx` |
| Public share | answer card + Open in Oak | `web/src/app/a/[id]/page.tsx` + small client island |
| history-client | new fetches | `web/src/lib/api/history-client.ts` + new `share-client.ts`, `folder-client.ts`, `scope-client.ts` |

## iOS

Mirror class-for-class. Owners:

- `ChatViewModel.swift` — recovery, undo window, mention tokens, slash, scope PUT, chips
- `ComposerView.swift` — `@` autocomplete, undo is on the bubble in the thread
- `AnswerCardView.swift` — human copy, share, pin, fork, retry
- `HistoryListViewModel.swift` / `HistoryService.swift` — folders, archive, bulk, fork
- `Account` screen — Shared-by-me
- `Scope` menu — MRU
- `ShareSnapshotView` — `GET /a/:id` via API or in-app WK; prefer fetching JSON from `GET /api/shares/public/:id` (see api-design) so native does not scrape HTML

## Android

Same split under `features/chat/`, `features/history/`, `features/account/`, `services/`.

## Privacy

- `web/src/components/admin/operator-access-disclosure.ts` — disclose user-published snapshots (question + answer, noindex, owner revoke, deleted with account).
- `web/src/app/privacy/page.tsx` already embeds that module.

## What each component must not do

- Repos do not call the model.
- Share view does not call `runOak` or any tool.
- Chips do not invent `/calc` or add-to-team.
- Palette does not exist on native.
- Clients do not persist images (consume-on-turn unchanged).
