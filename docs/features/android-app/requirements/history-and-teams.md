# Oak for Android — History & Teams

> Two signed-in features at parity with web: durable chat history and the
> team builder, including the **Teams Assistant** in-editor AI panel. IDs
> scoped `D-`. Append; never renumber.

## Index — iPhone requirements applicability

| iPhone ID | Status | Note |
|---|---|---|
| M-HIST-US-1, 3 | Same | Auto-saved, no explicit save step, synced across platforms; reopening makes a conversation live with full-fidelity earlier turns. |
| M-HIST-US-2 (browse/search/organize) | Modified | Same capabilities (search, format filter, pin/rename/delete); presented **inside the Chat tab**, not a separate tab — D-HIST-1. |
| M-BR-H1..H4 | Same | Signed-in only; per-account isolation; one format per conversation; automatic saving. |
| M-TEAM-US-1, 2, 3, 6 | Same | Create/edit full sets with native pickers; Showdown import/export via native share/clipboard; warn-but-allow; library management by format. |
| M-TEAM-US-4 (agent-assisted drafting) | **Replaced** | Superseded by the dedicated, editor-scoped **Teams Assistant** — D-TEAM-2. |
| M-TEAM-US-5 (active team) | **N/A** | Retired product-wide. No active-team selector/state anywhere; teams are referenced **by name** in ordinary chat. No Android surface exists for it. |
| M-BR-T1..T3, T5, T6 | Same | Signed-in + isolated; one format per team; warn-but-allow; Showdown round-trips; shared across platforms. |
| M-BR-T4 (explicit apply) | Modified | Same principle; current mechanism is the Teams Assistant's Apply-to-draft/Save split — D-TEAM-2. |

## A. Durable chat history (signed-in)

### D-HIST-1 — History lives inside the Chat tab

No dedicated History tab (`ui-and-experience.md` D-UI-1) — reached from
inside the Chat tab via a history affordance in the top bar. Search, filter
by format (any of the six scopes), pin, rename, delete, using Material 3
list patterns (swipe actions, overflow menu, pull-to-refresh). Selecting a
conversation makes it the live thread; follow-ups reflect its earlier turns,
rendered with full fidelity. For a guest, this entry point is visible but
presents sign-in as the unlock (D-BR-UI-2), not an empty/broken list. A
guest's pre-sign-in conversation becomes the first saved conversation on
sign-in, same as M-AC-4.1/4.2.

**D-BR-HIST-1..4** — Same as M-BR-H1..H4.

## B. Team builder (signed-in)

Same product as web/iPhone: named, per-account, format-aware teams with a
full competitive set per Pokémon, warn-but-allow. **No active team** — the
agent reasons about a saved team only when named in chat. Teams are built
**manually** on a dedicated Teams surface, and **agent-assisted inside the
editor** via the Teams Assistant.

### D-TEAM-1 — Manual team builder (same as iPhone)

Create/edit named teams (up to 6 Pokémon, full sets), Showdown import/export
via native share/clipboard, warn-but-allow validation, and library
management (list/rename/duplicate/delete by format) — same acceptance
criteria as M-TEAM-US-1/2/3/6.

### D-TEAM-2 — Teams Assistant (in-editor AI panel)

A **separate, scoped chat agent** from the main Oak chat — purpose-built for
editing the team open in the editor. Not a repeat of the main chat's
`OakAnswer` experience; a lean surface proposing concrete edits to the
draft already on screen.

- **D-AC-TEAM2.1** — A reachable entry point from the team editor opens the
  Teams Assistant as a Material 3 modal surface (bottom sheet or full-screen
  dialog) — Android's equivalent of the iPhone assistant sheet and web's
  docked `TeamsAssistantPanel`.
- **D-AC-TEAM2.2** — The assistant always sees the **live, unsaved draft**
  exactly as it stands at each message — including manual edits made
  between assistant turns, not a stale snapshot.
- **D-AC-TEAM2.3** — A lean chat thread: user bubbles, streamed Markdown
  reply, live tool-activity indication while reasoning. **No** full
  citations/inference-flag `AnswerCard` tree — that richness stays reserved
  for the main agent. An empty state offers one-tap suggested prompts (e.g.
  "fill an empty slot," "check my type coverage," "suggest an EV spread").
- **D-AC-TEAM2.4** — A reply that proposes edits shows a **"Proposed
  changes" card** listing each change in plain language (slot edits and/or
  a rename). No card when the reply is purely conversational.
- **D-AC-TEAM2.5** — **Apply to draft** writes proposed edits into the
  editor's **in-memory unsaved draft only** — never directly to saved
  storage. The user still reviews and presses the editor's own **Save** to
  persist; Apply and Save are distinct actions.
- **D-AC-TEAM2.6** — After applying, the card shows "Applied to draft" with
  **Undo**, which reverts just that application. Undo is offered only for
  the **most recently applied** proposal — a further edit (manual or
  another apply) forecloses undoing the earlier one.
- **D-AC-TEAM2.7** — A failed turn shows an inline error with **Retry**; the
  conversation and draft are not lost or corrupted. The composer is disabled
  mid-reply (no overlapping turns).
- **D-AC-TEAM2.8** — Dismissing the panel keeps any already-applied draft
  edits and does not itself save the draft. Signed-in only, scoped to the
  open team's format.

### Business rules (teams)

- **D-BR-TEAM-1..3, 5, 6** — Same as M-BR-T1..T3, T5, T6: signed-in +
  isolated, no sharing; one format per team; warn-but-allow; Showdown
  round-trips; shared across web/iPhone/Android.
- **D-BR-TEAM-4** — **Applying a Teams Assistant proposal is always an
  explicit, in-editor action, distinct from saving** (D-AC-TEAM2.5) —
  Android's expression of M-BR-T4, updated for the current mechanism.
- **D-BR-TEAM-7** — **No active-team state exists anywhere in the app** — no
  per-conversation selector, no request field carrying one; naming a team in
  chat is how the agent resolves it.

## Dependencies & notes

Both features require sign-in (`accounts-and-access.md`) and reuse existing
backend persistence, team CRUD/duplicate/export/import endpoints, and the
dedicated Teams Assistant SSE endpoint (signed-in only, separate from the
main chat endpoint) — the app does not reimplement validation, persistence,
or the assistant's reasoning. Applying a Teams Assistant proposal must use
the **same patch-application logic the backend validates against** — port
it rather than re-derive it, so a client-applied patch always matches the
backend (implementation concern, detailed in the architecture doc set).
