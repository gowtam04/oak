# Chat QoL — Organize

Pin turns inside a thread, fork a conversation from a chosen turn, and
manage history with folders, archive, and bulk actions. **Signed-in
only.** Web, iOS, and Android.

Depends on: chat-history (list, pin conversation, rename, search,
format filter, permanent delete). Conversation-level pin (**HIST-US-9**)
stays and is independent of per-turn pins.

## User stories

### PIN-US-1 — Pin a turn inside a conversation

As a signed-in user, I want to pin useful assistant cards in a long
thread so that a calc or a legal six is not buried.

- **PIN-AC-1.1** — Given I am signed in and viewing an assistant card,
  when I Pin it, then that turn appears in a compact jump-list strip
  at the **top of that conversation**, and tapping an item jumps to
  that card.
- **PIN-AC-1.2** — Given several pins in one conversation, when I look
  at the strip, then they are listed in **thread order** (not pin
  time). There is no one-pin cap.
- **PIN-AC-1.3** — Given a pinned turn, when I Unpin from the strip or
  from the card, then it leaves the strip. Other pins stay.
- **PIN-AC-1.4** — Given I pin or unpin a conversation in the **history
  sidebar**, when I open the thread, then the per-turn strip is
  unchanged. The two pins are independent.
- **PIN-AC-1.5** — Given I am a guest, when I view a card, then there
  is no Pin-turn action and no strip.
- **PIN-AC-1.6** — Given a conversation has no pinned turns, when I
  open it, then there is no empty strip chrome.

### FORK-US-1 — Fork a conversation from a chosen turn

As a signed-in user, I want to branch from a chosen turn so that “try
rain instead of sun” does not overwrite the original line.

- **FORK-AC-1.1** — Given I am signed in and viewing any assistant
  card, when I Fork, then Oak creates a **new** conversation that
  contains every turn **through that card** (each user message and
  assistant answer in that prefix), and I land in the fork with the
  composer ready.
- **FORK-AC-1.2** — Given I fork, when the original conversation is
  inspected, then it is unchanged — including turns after the fork
  point.
- **FORK-AC-1.3** — Given the prefix had per-turn pins, when the fork
  opens, then those prefix pins exist on the fork’s strip. Pins on
  turns after the fork point are not copied.
- **FORK-AC-1.4** — Given I fork, then the new conversation has the
  original’s **sticky scope**, is **not archived**, is **unfiled**
  (no folder), and has a distinct title that still identifies the
  source (for example `{original title} (fork)`).
- **FORK-AC-1.5** — Given I am a guest, when I view a card, then there
  is no Fork action.

### ORG-US-1 — Folders

As a signed-in user, I want optional folders so that VGC, ladder, and
in-game threads do not share one undifferentiated list.

- **ORG-AC-1.1** — Given I am signed in, when I create a folder with a
  non-empty name, then it appears as a filter/view in history.
- **ORG-AC-1.2** — Given a conversation, when I move it into a folder,
  then it sits in **that one folder**. A conversation is in one folder
  or is **unfiled**, never in two folders.
- **ORG-AC-1.3** — Given I view a folder, when the list renders, then
  I see only non-archived conversations in that folder (archived stay
  in Archive unless I open Archive).
- **ORG-AC-1.4** — Given I rename a folder, when I look at history on
  this or another device, then conversations in it still belong to it
  under the new name.
- **ORG-AC-1.5** — Given I delete a folder, when deletion completes,
  then the folder is gone and its conversations are **unfiled**. They
  are not deleted and not archived by this action.
- **ORG-AC-1.6** — Given I am a guest, when I use history, then there
  are no folders (guests still have no history list — **BR-H1**).

### ORG-US-2 — Archive

As a signed-in user, I want to hide a thread from the default list
without deleting it.

- **ORG-AC-2.1** — Given a non-archived conversation, when I Archive
  it, then it disappears from the default history list and from folder
  views, and appears in Archive. Its folder membership is unchanged.
- **ORG-AC-2.2** — Given an archived conversation, when I Unarchive it,
  then it returns to the default list (and to its folder view if it
  has a folder).
- **ORG-AC-2.3** — Given the default history list, when it renders,
  then archived conversations are not shown.
- **ORG-AC-2.4** — Given search, when I search with default settings,
  then archived conversations are excluded. I can opt to include
  archived. The default list still hides them.

### ORG-US-3 — Bulk actions

As a signed-in user, I want to delete, archive, or file many
conversations at once.

- **ORG-AC-3.1** — Given I multi-select one or more conversations in
  the current history view (including Archive), when I Bulk delete and
  confirm, then those conversations are permanently removed with the
  same meaning as today’s single delete (**BR-H8** — no trash).
- **ORG-AC-3.2** — Given I multi-select, when I Bulk archive or Bulk
  unarchive, then each selected conversation changes archive state.
  No extra destructive confirm.
- **ORG-AC-3.3** — Given I multi-select, when I Bulk move to a folder
  (or to unfiled), then each selected conversation’s folder updates.
  No extra destructive confirm.
- **ORG-AC-3.4** — Given I cancel the bulk-delete confirm, when I
  return to the list, then nothing was deleted.

## Business rules

- **PIN-BR-1 — Pins are per conversation, signed-in, assistant turns.**
  Only assistant cards can be pinned. Pins persist with the
  conversation across devices. Guests have none.
- **PIN-BR-2 — Independent of conversation pin.** Sidebar pin
  (**HIST-US-9**) does not add or remove turn pins.
- **FORK-BR-1 — Fork is a copy of a prefix, then independent.** After
  creation, the fork has its own identity, title, scope, pins, folder
  (none), and future turns. The agent’s memory in the fork is only the
  copied prefix (**BR-H5** still applies inside each conversation).
- **FORK-BR-2 — Original is never truncated.** Fork does not delete
  the tail of the source thread.
- **ORG-BR-1 — One folder or unfiled.** Folders are optional. No
  nesting. No multi-folder membership.
- **ORG-BR-2 — Archive is independent of folder.** Archiving does not
  unfile. Deleting a folder does not archive or delete chats.
- **ORG-BR-3 — Default list is non-archived.** “All” means all
  non-archived conversations, every folder and unfiled.
- **ORG-BR-4 — Delete is still permanent.** Bulk delete uses the same
  confirm-and-hard-delete rule as **BR-H8**. Archive is the
  non-destructive hide.
- **ORG-BR-5 — Search default excludes archived.** Inclusion is an
  explicit opt-in for that search.
- **ORG-BR-6 — Organize is signed-in only.** Guests cannot pin, fork,
  folder, archive, or bulk-act. Their thread stays ephemeral.

## Edge, empty, and conflict states

| State | Behavior |
|---|---|
| No pins | No strip (PIN-AC-1.6). |
| Fork of first answer only | Fork has that one pair; composer ready. |
| Fork while a turn is in flight on the source | In-flight turn is not a completed card; Fork is offered on completed assistant cards only. The in-flight turn is not copied. |
| Empty folder | Folder view shows an empty state, not an error. |
| Delete folder that is empty | Folder disappears; no conversations change. |
| Bulk select mix of archived and not | Bulk archive/unarchive applies per item; delete still confirms once for the set. |
| Delete the open conversation (single or bulk) | Existing safe-state rule (**HIST-AC-8.2**). |
| Share links on a deleted conversation | Stay live until Revoke (**SHARE-BR-3**). |

## Out of this file

Filter-by-kind and semantic search — out of pack. Conversation-level
pin/rename/search/format-filter — already shipped (chat-history).
