# Chat QoL — Leave the app

Human copy, public share links, and conversation export. Copy is for
guests and signed-in users. Share and export are signed-in only. Web,
iOS, and Android (share sheet on native; download on web).

Depends on: existing answer-card tree, existing “Copy for agents,”
existing team import, chat-history persistence for signed-in threads.

## User stories

### COPY-US-1 — Copy answer as human text

As a guest or signed-in user, I want a Discord/Notes/Reddit paste of an
answer so that I am not stuck with machine markdown.

- **COPY-AC-1.1** — Given any assistant card (not only the last), when
  I choose Copy as human text, then the clipboard contains: the answer
  prose, the fact table, user-facing uncertainty/caveats, and — if the
  card has a proposed team — a Showdown paste of that team.
- **COPY-AC-1.2** — Given I copy as human text, then the clipboard does
  **not** include the “Copy for agents” citation schema, internal field
  labels, or a reasoning dump that was not part of the user-facing
  prose.
- **COPY-AC-1.3** — Given the existing Copy for agents action, when this
  pack ships, then that action still exists and is distinct from human
  copy.

### SHARE-US-1 — Create a public share link

As a signed-in user, I want to snapshot one turn to a public URL so
that I can show an answer without giving someone my account.

- **SHARE-AC-1.1** — Given I am signed in and viewing any assistant
  card, when I choose Share, then Oak creates an **immutable snapshot**
  of that turn’s user question and the full structured answer, at an
  unguessable public URL, and gives me that URL (web copy; native share
  sheet).
- **SHARE-AC-1.2** — Given I am a guest, when I view an assistant card,
  then there is no Share action.
- **SHARE-AC-1.3** — Given I share after a later Retry or Edit of that
  same last pair, when the new pair replaces the old one, then any
  **already created** share of the old snapshot is unchanged.
- **SHARE-AC-1.4** — Given the turn had consume-on-turn images, when I
  share, then the public page includes the question text and the
  answer card and does **not** include the images (they were never
  stored). Share is still allowed.

### SHARE-US-2 — View a public share

As anyone with the URL (signed-in or not), I want to read the shared
card without an account.

- **SHARE-AC-2.1** — Given a live (not revoked) share URL, when I open
  it without signing in, then I see the user question and the same
  answer-card tree the owner saw, with no live data refetch required
  to render the snapshot.
- **SHARE-AC-2.2** — Given a live share URL, when a crawler or browser
  requests it, then the page is marked **noindex** and still has
  open-graph tags so Discord, X, and iMessage unfurl.
- **SHARE-AC-2.3** — Given a revoked or unknown share URL, when I open
  it, then I see a dedicated “this share is unavailable” state — not
  a signed-in app shell and not a blank page.

### SHARE-US-3 — Revoke a share

As the signed-in owner, I want to kill a public link so that a post I
regret stops resolving.

- **SHARE-AC-3.1** — Given I created a share, when I Revoke it from the
  original card **or** from Shared-by-me, then that URL shows the
  unavailable state (SHARE-AC-2.3) and cannot be restored.
- **SHARE-AC-3.2** — Given I Retry, Edit, or delete the source
  conversation, when those actions complete, then existing share URLs
  from that conversation **remain live** until I explicitly Revoke
  them.
- **SHARE-AC-3.3** — Given I am not the owner, when I view a public
  share, then I have no Revoke control. There is no public report
  button in this pack.

### SHARE-US-4 — Shared-by-me list

As a signed-in user, I want a list of my live share links so that I
can revoke one after I have left or deleted the thread.

- **SHARE-AC-4.1** — Given I have at least one live share, when I open
  Shared-by-me (from Account or an equivalent signed-in surface), then
  I see each live link with enough to recognize it (conversation title
  at share time or current title, date shared) and a Revoke action.
- **SHARE-AC-4.2** — Given I have no live shares, when I open
  Shared-by-me, then I see an empty state, not an error.
- **SHARE-AC-4.3** — Given I revoke the last live share, when the list
  refreshes, then that item is gone.

### SHARE-US-5 — Open in Oak from a public share

As a viewer of a shared card, I want a path into Oak that does not
open the owner’s private thread.

- **SHARE-AC-5.1** — Given the snapshot includes a proposed team and I
  am signed in, when I choose Open in Oak, then Oak **imports that
  proposal as a new team** on my account (it does not overwrite an
  existing team) and I can open that team.
- **SHARE-AC-5.2** — Given the snapshot includes a proposed team and I
  am a guest, when I choose Open in Oak, then I am asked to sign in
  first; after sign-in the import in SHARE-AC-5.1 runs.
- **SHARE-AC-5.3** — Given the snapshot has **no** proposed team, when
  I choose Open in Oak, then Oak opens the normal empty-chat / home
  desk for my identity. It does **not** open the owner’s conversation
  and does **not** prefill the owner’s question.
- **SHARE-AC-5.4** — Given I imported a proposed team, when I start a
  chat about it from that import success path, then that team is
  bound the same way a saved team is bound for `@mention` (see
  [composer-and-navigation.md](./composer-and-navigation.md)).

### EXP-US-1 — Export a conversation as Markdown

As a signed-in user, I want one conversation as readable Markdown so
that a team-build thread can leave the app.

- **EXP-AC-1.1** — Given I am signed in and have a non-empty
  conversation open, when I export as Markdown, then I receive a
  Markdown file for **that conversation only**, containing each user
  question, each assistant answer, and tables, in turn order.
- **EXP-AC-1.2** — Given I export, then the file does **not** include
  the live tool-activity trace.
- **EXP-AC-1.3** — Given I am a guest, when I look for export, then it
  is not offered.
- **EXP-AC-1.4** — Given the conversation has no turns, when I look
  for export, then it is disabled or hidden.

### EXP-US-2 — Export a conversation as PDF

As a signed-in user, I want the same conversation as a simple PDF.

- **EXP-AC-2.1** — Given I am signed in and have a non-empty
  conversation open, when I export as PDF, then I receive a simple
  printable PDF of the same content as EXP-AC-1.1 (questions, answers,
  tables; no tool-activity trace).
- **EXP-AC-2.2** — Given I export from iOS or Android, when the file
  is ready, then the system share sheet is offered. On web, a download
  starts.

## Business rules

- **COPY-BR-1 — Human copy is a projection, not a new answer.** It is
  derived from the already-rendered structured answer. It does not
  call the model.
- **COPY-BR-2 — Agent export stays.** Human copy does not replace Copy
  for agents.
- **SHARE-BR-1 — Signed-in to create; anyone to view.** Creating a
  share requires the owning signed-in account. Viewing a live share
  requires no account.
- **SHARE-BR-2 — Snapshot is immutable.** The public page is the
  question + full `OakAnswer` as they were at share time. Later retry,
  edit, or new turns do not mutate it.
- **SHARE-BR-3 — Revoke is the only kill switch.** Deleting the
  conversation, retrying, or editing does not revoke. Revoke is
  explicit, permanent, and owner-only.
- **SHARE-BR-4 — Link-only distribution.** Share pages are **noindex**.
  They are not a public gallery and not a search corpus. Open-graph
  tags exist so a pasted URL unfurls.
- **SHARE-BR-5 — One turn, not a thread.** A share is exactly one user
  question + one assistant answer. Whole-conversation sharing is out
  of pack.
- **SHARE-BR-6 — No live reads required to render.** The public viewer
  must not depend on current index data, the owner’s history, or an
  active turn to show the snapshot. “Open in Oak” / import is a
  separate, opt-in action.
- **SHARE-BR-7 — Proposed-team import is a copy.** Import creates a
  **new** team on the viewer’s account. It never writes the owner’s
  teams and never opens the owner’s conversation.
- **SHARE-BR-8 — No public report queue.** This pack does not add a
  report button or operator flag inbox. The owner revokes; existing
  operator visibility of turns is unchanged.
- **SHARE-BR-9 — Images are omitted.** Consume-on-turn images are not
  stored on the snapshot.
- **EXP-BR-1 — Signed-in, one conversation, Q+A+tables.** Export is
  not available to guests, is never a zip of all history, and never
  includes tool-activity.
- **EXP-BR-2 — Privacy of export.** The file is produced for the
  owner. It is not published. Sharing the file after download is the
  user’s action.

## Edge, empty, and conflict states

| State | Behavior |
|---|---|
| Guest on a card | Human copy yes; Share/Export no. |
| Shared-by-me empty | Empty state (SHARE-AC-4.2). |
| Revoked URL | Unavailable state (SHARE-AC-2.3). |
| Voice-turn card | Copy/share/export use whatever the card currently shows (thin voice transcript if that is all that was stored). |
| Import while at team cap (if a cap exists) | Existing team-create error; snapshot still viewable. |
| Owner deleted their account | Existing account-deletion rules apply to owned shares; record the resolution under Open Questions if deletion today does not mention shares. |

## Privacy disclosure

Public shares are a new way user-authored **questions** and Oak
**answers** leave the private account. Privacy-policy / operator-access
copy must disclose: a signed-in user can publish a snapshot to anyone
with the link; the page is noindex; the owner can revoke; Oak’s
operator visibility of turns is unchanged.

## Out of this file

Pin/fork/folders — [organize.md](./organize.md). Persist-images — out
of pack. Indexable Q&A and a public gallery — out of pack.
