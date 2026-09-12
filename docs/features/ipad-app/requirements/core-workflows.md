# Oak for iPad — Core Workflows

> End-to-end journeys with happy path plus empty, failure, permission,
> and conflict states. Each step is layout/interaction on iPad; agent
> and account behavior inherit the shipping iPhone app.
>
> Personas: guest and signed-in. Entities: conversation, team, artifact,
> usage snapshot (read-only), calc scenario (ephemeral). Depends on all
> destination files.

## WF1 — Launch and ask (guest or signed-in)

**Happy path**

1. App opens on iPad into **Chat** (`P-SHELL-BR-1`). Sidebar is visible
   in landscape; compact width uses rail/overlay.
2. Signed-in: list | thread, current or new thread selected. Guest:
   sign-in prompt in the list column, ephemeral thread.
3. Empty thread shows the iPad empty workbench (`P-CHAT-US-3`).
4. User types (or taps an existing example prompt) and sends. Optional
   images via library, camera, or drag-and-drop.
5. Thread shows in-progress / tool activity, then streams the answer.
   Prose is readable width; tables/calcs/charts go wide.
6. Follow-up stays in the same thread.

**Empty** — New thread / guest: workbench empty state, not a blank
white column (`P-CHAT-AC-3.1`).

**Failure** — Transport drop: retry, no ambiguous half-answer
(`P-CHAT-AC-2.4`). Rate limit: existing specific message; guest is
told sign-in raises the limit. In-domain agent failure: rendered as a
normal answer.

**Permission** — Camera/library denied: explain how to enable; library
and/or drag-and-drop still work (`P-CHAT-AC-4.3`).

**Conflict** — Fifth image or non-image drop: visible rejection, no
silent attach (`P-SHELL-AC-7.4`).

- **P-WF-US-1** — As any user, I want to launch and get a cited answer
  on iPad without using iPhone chrome.
  - **P-WF-AC-1.1** — Given a fresh launch on iPad, when I send a
    non-empty question, then I see my message and a streamed,
    field-complete answer in the thread column with sidebar (or
    compact rail) present.
  - **P-WF-AC-1.2** — Given no network, when I send, then I see the
    existing no-connection state and retry — not a hang.

## WF2 — Inspect an artifact from Chat

**Happy path**

1. In Chat, tap a structured entity or rich block.
2. Trailing inspector opens; thread remains (`P-ART-AC-1.1`).
3. Drill into a linked entity; back returns; dismiss closes inspector.
4. Optional: pin (signed-in); pin strip on the thread reopens the
   inspector (`P-ART-US-2`).

**Empty** — Guest: no pin strip. Nothing tappable in free text
(M-BR-ART-3).

**Failure** — Artifact for on-screen data still opens without a full
round-trip wait (`P-ART-AC-1.4`). If a drill-down fetch fails, the
inspector shows a recoverable error and keeps the previous artifact
on the back stack.

**Conflict** — Opening inspector on medium width **hides the list
first** (`P-CHAT-AC-1.6`). Rotation stacks inspector under the thread
without losing the back stack (`P-SHELL-AC-5.5`).

- **P-WF-US-2** — As any user, I want co-visibility of answer and
  artifact on iPad.
  - **P-WF-AC-2.1** — Given a structured Pokémon mention in an answer,
    when I tap it on the Chat destination, then the inspector shows
    that profile and the thread is still readable.
  - **P-WF-AC-2.2** — Given the inspector open, when I rotate to
    portrait, then the inspector is stacked under the thread and the
    same artifact is still shown.

## WF3 — Edit a team with companion chat

**Happy path**

1. Signed-in user opens **Teams**. Companion is closed
   (`P-SHELL-AC-2.1`).
2. Library | canvas | slot inspector (or stacked portrait). Select a
   slot; change a move / Stat Points; save (warn-but-allow).
3. Reveal companion (or Teams Assistant). Context chip = open team.
   Ask to swap a Pokémon; agent proposes; user **explicitly applies**.
4. Canvas/inspector reflect the written team.

**Empty** — Zero teams: empty library with New / Import
(`P-TEAM-AC-6.1`). Empty slot: selectable and fillable.

**Failure** — Save/network error: retry, team not silently lost.
Usage/Dex hops from a slot do not wipe unsaved inspector fields
without the same confirmation iPhone already uses (if iPhone has no
confirm, iPad must not invent a new discard-without-warning rule —
match iPhone).

**Permission** — Guest: sign-in unlock, no teams listed
(`P-TEAM-AC-1.1`).

**Conflict** — Companion already open from Dex: thread continues; chip
**replaces** to the team (`P-TEAM-AC-4.4`). Tapping an entity in
companion opens a **centered panel**, not a fourth column
(`P-SHELL-AC-4.5`). Switching to Chat dismisses that panel
(`P-SHELL-AC-6.1`).

- **P-WF-US-3** — As a signed-in user, I want to edit a team and ask
  Oak about it on the same screen.
  - **P-WF-AC-3.1** — Given an open team on a wide iPad, when I reveal
    companion, then I see the current Chat thread beside the canvas
    with a team context chip.
  - **P-WF-AC-3.2** — Given a proposal from Oak, when I have not
    confirmed apply, then the saved team is unchanged.

## WF4 — Dex profile with usage; optional companion

**Happy path**

1. Open Dex. Pick Pokémon in the index; profile fills.
2. Usage section on the profile shows live Doubles (default) data
   (`P-DEX-AC-2.1`).
3. Optionally reveal companion; chip = that Pokémon; ask a question.

**Empty** — Search with no hits: existing empty copy in the index.

**Failure** — Usage down: section fail-soft, profile remains
(`P-DEX-AC-2.2`). Index unavailable: destination error + retry.

**Conflict** — Open in Dex from Chat inspector: switch to Dex with
that profile; companion open/closed unchanged (`P-DEX-AC-1.5`).

- **P-WF-AC-4.1** — Given Garchomp in the Dex index, when I select it,
  then the profile pane shows its Dex fields and a Usage section for
  that species (or the usage unavailable copy).

## WF5 — Calculate damage and explain

**Happy path**

1. From `/calc` or a damage block, open Calc workspace.
2. Attacker | Defender side by side; result visible.
3. Change move / Stat Points; estimate updates as on iPhone.
4. Explain this calc → current thread (companion if still on Calc).

**Empty** — Missing species/move: same as iPhone calc (no fabricated
number).

**Failure** — Estimate error: existing calc error copy; editors remain.

**Conflict** — Done returns to the previous destination with its work
intact (`P-CALC-AC-1.1`, `P-SHELL-AC-5.5`).

- **P-WF-AC-5.1** — Given Calc open in landscape, when both sides and a
  move are specified as on iPhone, then the estimate is visible without
  scrolling it off the canvas.
- **P-WF-AC-5.2** — Given Calc open, when I tap Explain, then the
  current Chat thread receives that explain turn.

## WF6 — Guest signs in mid-thread

**Happy path**

1. Guest asks in Chat (ephemeral thread).
2. Sign-in from list-column prompt, Teams unlock, or Settings —
   **centered panel**, email + OTP autofill.
3. Session becomes signed-in; guest thread is imported as the first
   saved conversation (iPhone M-AC-4.1). Chat list now shows history.
4. Teams/history unlock.

**Failure** — Wrong/expired OTP: error, retry/resend (M-AC-2.2).
Network: panel stays, retry.

**Permission** — N/A (email OTP).

**Conflict** — Switching destination while the OTP panel is open
**dismisses the panel** without signing in (`P-SHELL-AC-6.1`). Rotate
does **not** dismiss it (`P-SHELL-AC-6.2`).

- **P-WF-AC-6.1** — Given a guest thread on screen, when OTP succeeds,
  then that thread is still readable and appears in the conversation
  list as saved.

## WF7 — Attach a screenshot at a desk

**Happy path**

1. Drag a PNG/JPEG onto the composer, or pick from the library.
2. Thumbnail appears; send (with or without text).
3. Turn consumes images (not stored in history), same as iPhone.

**Failure** — Unsupported type / too large: specific message
(`P-CHAT-AC-4.3`).

**Permission** — Library denied: drag-and-drop and/or camera still
available, plus how-to-enable copy.

**Conflict** — Drop 5th image or a PDF: rejected with a message
(`P-SHELL-AC-7.4`).

- **P-WF-AC-7.1** — Given a composer with 0–3 images, when I drop one
  more valid photo, then a thumbnail is attached and I can send.
- **P-WF-AC-7.2** — Given 4 images already attached, when I drop
  another, then no fifth thumbnail appears and a cap message is shown.

## WF8 — Rotate and Split View

**Happy path**

1. Landscape Teams with companion open and slot 3 selected.
2. Rotate to portrait: workspace on top (majority), companion bottom;
   same team, same slot, same thread, chip still the team.
3. Drag Oak to 50% Split View: sidebar → rail/overlay; columns stack;
   state remains.

**Failure** — None specific; if the system kills the app, restore
matches iPhone session restore (signed-in without new OTP).

**Conflict** — Inspector + list + thread cannot all fit: drop list
first, then stack inspector (`P-SHELL-AC-5.4`). Centered panel open
during rotate: panel stays and reflows (`P-SHELL-AC-6.2`).

- **P-WF-AC-8.1** — Given any destination with in-progress work, when I
  rotate or enter Split View, then I do not return to a blank Chat and
  I do not see the iPhone tab dock.
- **P-WF-AC-8.2** — Given companion open, when I rotate, then companion
  remains open and the thread scroll position is not reset to a
  different conversation.

## WF9 — Voice (signed-in)

**Happy path**

1. Signed-in user starts Voice. App shows Chat destination; thread
   canvas becomes the Voice workspace (`P-CHAT-AC-5.1`).
2. Spoken turn streams into the same thread; on end, the usual answer
   card appears as on iPhone.
3. Leave Voice → typed composer on that thread.

**Permission** — Mic denied: existing gate copy; typed chat still
works.

**Failure** — Voice session drop: existing retry/end copy; thread
preserved.

**Conflict** — Guest: cannot start Voice (`P-CHAT-AC-5.4`). Starting
Voice from Teams switches to Chat (`P-CHAT-AC-5.3`).

- **P-WF-AC-9.1** — Given a signed-in user in Teams, when they start
  Voice, then they are in the Chat destination Voice workspace on the
  current thread.

## WF10 — Settings, deletion, overlays

**Happy path**

1. Settings list | detail. Open account; sign out or delete via
   centered confirm.
2. Deletion matches iPhone in-app deletion (account and its data).

**Empty** — Guest Settings: sign-in row, appearance, about — no
deletion.

**Failure** — Deletion/network error: existing error, account remains.

**Conflict** — Deletion panel + destination switch: panel dismisses,
no delete (`P-SHELL-AC-6.1`).

- **P-WF-AC-10.1** — Given a signed-in user, when they complete account
  deletion on iPad, then they are a guest and cannot see that
  account’s teams or history.
- **P-WF-AC-10.2** — Given a deletion confirm panel, when they switch
  to Chat, then deletion has not run.

## Business rules (workflow-level)

- **P-WF-BR-1** — No journey may require an iPhone-only control (bottom
  tab dock, phone bottom sheet) to complete a current iPhone capability.
- **P-WF-BR-2** — Explicit apply/save/delete confirms stay explicit;
  layout changes must not auto-apply agent team proposals.
- **P-WF-BR-3** — A destination switch never signs the user out or
  clears the live thread.
