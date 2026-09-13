# Oak for iPad — Chat and Artifacts

> The Chat destination, answer layout, artifact inspector, pin strip, Voice
> workspace, image attach, and empty canvas. Capability rules inherit the
> current iPhone chat (`docs/features/iphone-app/requirements/chat-experience.md`
> and `artifact-viewer.md`) except where this file **replaces the layout**.
> Personas: guest and signed-in. Depends on `shell-and-adaptation.md`.

## Chat destination layout

Mail-style **conversation list | thread**. Artifacts add a trailing
**inspector** on the Chat destination only.

- **P-CHAT-US-1** — As a signed-in user, I want to see my chats and the
  open thread at once, so I can jump between saved conversations without
  leaving the canvas.
  - **P-CHAT-AC-1.1** — Given a signed-in user on a wide landscape Chat
    destination with no inspector open, when the destination is shown,
    then a leading **conversation list** and the **open thread** are both
    visible. Selecting a row updates the thread in place (no full-screen
    push that hides the list).
  - **P-CHAT-AC-1.2** — The list supports the same history actions as
    iPhone: identify by title + recency, search, pin, rename, delete,
    new conversation. Touch swipe actions remain; pointer secondary-click
    exposes the same actions (`P-SHELL-AC-7.2`).
  - **P-CHAT-AC-1.3** — Starting a **new conversation** shows a fresh
    empty thread in the thread column; the agent does not have the prior
    thread’s context (same as iPhone M-AC-3.1).
  - **P-CHAT-AC-1.4** — Reopening a conversation makes it the live
    thread with full answer fidelity (same as M-AC-H3.1/H3.2).
  - **P-CHAT-AC-1.5** — Given a guest, when Chat is shown, then the list
    column is **not** a fake empty history: it presents **sign-in to
    save conversations** (and the existing unobtrusive sign-in action).
    The thread column is the ephemeral guest chat.

### Tight width (Chat)

Follow `P-SHELL-AC-5.4`:

- **P-CHAT-AC-1.6** — Medium width: if the inspector is open, the
  conversation list is hidden and reachable via a control; thread |
  inspector remain.
- **P-CHAT-AC-1.7** — Portrait / Mini: the thread uses the canvas; the
  list is a leading overlay or back-to-list, not a permanent skinny
  column. If the inspector is open, it **stacks under the thread**; the
  thread keeps the larger share.
- **P-CHAT-AC-1.8** — Given a wide Chat destination with a persistent
  list, when I collapse conversations, then the list column is gone,
  the thread (and inspector if open) grow, and a Conversations control
  restores the persistent list. Compact / medium+inspector still use
  the existing overlay (`P-CHAT-AC-1.6–1.7`). Collapse is opt-in and
  independent of the enamel sidebar (`P-SHELL-US-8`). Session-only
  (`ADR-P7`): cold launch shows the list again.

## Answers on the wide thread

- **P-CHAT-US-2** — As any user, I want Oak’s written answer easy to
  read and its data easy to scan, so the extra width is used without
  super-wide paragraphs.
  - **P-CHAT-AC-2.1** — The **direct answer text and reasoning** render
    at a **comfortable reading width** inside the thread column (not
    stretched to a 13-inch line length).
  - **P-CHAT-AC-2.2** — **Tables, damage calcs, type charts, candidate
    lists, and team sheets** expand to the **thread column’s full
    width**. They must not be a phone-width card floating in empty
    space, and they must not clip horizontally; wrap or internal scroll
    is allowed only when the block is denser than the column.
  - **P-CHAT-AC-2.3** — Citations, inference/uncertainty flags, and the
    regulation/format tag stay **attached to the answer** (stacked with
    it), not a separate column.
  - **P-CHAT-AC-2.4** — Streaming and live tool-activity remain in the
    thread, token-by-token, with a clear in-progress vs done state
    (iPhone M-CHAT-US-4). A transport drop shows retry; it does not
    leave an ambiguous half-answer.
  - **P-CHAT-AC-2.5** — Follow-up chips, slash/mention pickers, and
    turn actions stay with the thread/composer — same capabilities as
    iPhone, laid out in the thread column.

In-domain failures still render as normal answers (M-AC-1.3).

## Empty Chat canvas

- **P-CHAT-US-3** — As any user on a new or empty thread, I want the
  empty canvas to feel like a workbench, not a stretched phone empty
  state.
  - **P-CHAT-AC-3.1** — The empty thread shows Oak’s identity, a short
    Champions-coach line, and the **existing example prompts** as a
    **spacious set** (grid or large chips) that uses the thread column.
  - **P-CHAT-AC-3.2** — Tapping an example sends **the same prompt
    text** as iPhone. No new example questions, no tutorial, no
    onboarding flow.

## Artifact inspector (Chat destination)

Replaces the iPhone **bottom sheet** on iPad when the user is in Chat.

- **P-ART-US-1** — As any user, I want to inspect a Pokémon, move,
  ability, item, type, table, comparison, calc, or team sheet **beside**
  the answer, so I do not lose the conversation.
  - **P-ART-AC-1.1** — Tapping an openable entity or rich block in the
    thread opens a **trailing inspector** with that artifact’s full
    profile/detail for Champions (same data as iPhone artifacts). The
    thread stays visible.
  - **P-ART-AC-1.2** — Dismissing the inspector returns the thread to
    the remaining width. The conversation is not lost.
  - **P-ART-AC-1.3** — Drill-down inside the inspector **pushes a back
    stack** (one artifact visible at a time). Back returns to the
    previous artifact; dismissing the inspector returns to chat-only.
  - **P-ART-AC-1.4** — Opening an artifact for data already on screen
    feels effectively instant (M-AC-A4.1).
  - **P-ART-AC-1.5** — Inspector content stays visually consistent with
    answers (grounded, cited, regulation-tagged) — not an unsourced
    dump.
  - **P-ART-AC-1.6** — Existing artifact verbs remain: Open in Dex, Add
    to team (signed-in), Compare with…, Pin (signed-in, rich artifacts),
    Open in calculator, Copy Showdown / copy TSV where iPhone already
    offers them. Add-to-team and Compare pickers are **centered
    panels**. Confirming add-to-team **switches to the Teams
    destination** with that team and slot open (existing outcome, iPad
    shell).

Only structured entities/blocks are tappable (M-BR-ART-3).

## Pin strip

Existing conversation pins (up to five, signed-in, hidden when empty).

- **P-ART-US-2** — As a signed-in user, I want pins on the thread so I
  can reopen an artifact without hunting the transcript.
  - **P-ART-AC-2.1** — The pin strip sits **with the open thread**. It
    is hidden when empty or when the user is a guest.
  - **P-ART-AC-2.2** — Tapping a pin opens that artifact in the
    **inspector**. Unpin from the strip remains available.
  - **P-ART-AC-2.3** — The cap remains **five** pins per conversation
    (same as iPhone).

## Images

Same product as iPhone (≤4 images, Champions screenshot / team-sheet
intent, consume-on-turn, never stored in history) with iPad-first
sources.

- **P-CHAT-US-4** — As any user, I want to attach screenshots easily at
  a desk.
  - **P-CHAT-AC-4.1** — From the composer I can **pick from the photo
    library** and **take a photo with the camera**. Library and
    **drag-and-drop** are first-class; camera remains available.
  - **P-CHAT-AC-4.2** — Thumbnails appear before send; each can be
    removed. Image-only send remains valid (M-AC-5.4).
  - **P-CHAT-AC-4.3** — Cap, rejection messages, and permission-on-use
    match iPhone (M-AC-5.2, 5.5, 5.6). If camera or library permission
    is denied, the other methods (including drag-and-drop) still work
    and the app explains how to enable the denied one.
  - **P-CHAT-AC-4.4** — Drag-and-drop follows `P-SHELL-AC-7.3` and
    `P-SHELL-AC-7.4`.

## Voice

Signed-in only, same spoken-chat product as iPhone. No new voice
features.

- **P-CHAT-US-5** — As a signed-in user, I want Voice to use the Chat
  canvas, so it is not a tiny phone overlay on a 13-inch screen.
  - **P-CHAT-AC-5.1** — Entering Voice **takes over the Chat
    destination’s thread canvas** (orb + live transcript). The
    conversation list may remain on wide layouts.
  - **P-CHAT-AC-5.2** — Voice is the **same thread** as the current
    Chat conversation. Leaving Voice returns to that thread’s typed
    chat.
  - **P-CHAT-AC-5.3** — If the user starts Voice from another
    destination, the app **switches to the Chat destination** and
    enters Voice on the current thread. Companion is not a Voice
    surface.
  - **P-CHAT-AC-5.4** — Guests still cannot start Voice; the existing
    signed-in gate applies. Mic permission-on-use and denial copy match
    iPhone.

## Composer

- **P-CHAT-AC-6.1** — The composer lives at the **bottom of the thread
  column** (or companion chat pane). It supports text, attach, send,
  slash/mentions, and image thumbnails as on iPhone.
- **P-CHAT-AC-6.2** — The keyboard (on-screen or hardware) never covers
  the composer; the thread/companion pane adjusts.
- **P-CHAT-AC-6.3** — Regulation remains the **display-only chip** in
  chrome, not a scope picker (Champions-first).

## Business rules

- **P-CHAT-BR-1** — **One artifact visible at a time** in the inspector
  (back stack), same as M-BR-ART-1.
- **P-CHAT-BR-2** — Artifacts remain **ephemeral** except where iPhone
  already persists **pins** on a conversation.
- **P-CHAT-BR-3** — On the Chat destination, artifacts open in the
  **inspector**, not a bottom sheet and not a centered panel.
- **P-CHAT-BR-4** — Outside Chat, artifacts from companion open in a
  **centered panel** (`P-SHELL-AC-4.5`).
- **P-CHAT-BR-5** — Guests have **no history list** and **no pins**.
- **P-CHAT-BR-6** — Voice is **signed-in only** and **Chat-destination
  only**.

## Cross-links

- Companion placement and context chip: `shell-and-adaptation.md`
- Add-to-team landing: `teams-workbench.md`
- Open in Dex / Usage: `reference-and-tools.md`
