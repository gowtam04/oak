# Oak for iPhone — Chat Experience

> The core of the app: the reasoned-answer chat, native streaming, multi-turn
> context, image input via camera/photo library, and the Champions-mode toggle.
> Behavior mirrors the web app (`docs/agent-design/ux-design.md`,
> `README.md`); this file specifies the **native iPhone** expression of it.
> IDs scoped `M-` (mobile). Append; never renumber.

## Overview

Chat is Oak's product. The user types (or speaks via the keyboard) a
natural-language Pokémon question; the app sends it to the existing backend and
streams back a structured `OakAnswer` — rendered field-by-field with reasoning,
cited sources, inference/uncertainty flags, and the generation/format tag. The
conversation is multi-turn: follow-ups build on earlier turns. Optionally the
user attaches images (now via the iPhone camera or photo library) and toggles
Champions mode to switch the data scope.

## User stories

### Core chat

- **M-CHAT-US-1** — As any user, I want to type a Pokémon question and get a
  reasoned, cited answer, so that I can use Oak's core value on my phone.
  - **M-AC-1.1** — Given a non-empty question, when I send it, then the app
    displays my message in the thread and begins showing the agent's response.
  - **M-AC-1.2** — The rendered answer shows, at minimum: the answer text, the
    reasoning, cited sources, any inference/uncertainty flag, and the
    generation/format tag — matching the fields the web `AnswerCard` renders.
  - **M-AC-1.3** — When the agent returns an in-domain failure (e.g. entity not
    found, insufficient data, out-of-scope), the app renders that as a normal
    answer with the appropriate status — **not** as an app error/crash.
  - **M-AC-1.4** — Tables, sprites/images, and structured blocks within an answer
    render legibly on a phone screen (wrap/scroll as needed), without horizontal
    clipping of important content.

- **M-CHAT-US-2** — As any user, I want my follow-up questions to remember the
  conversation, so that I can refine without restating context.
  - **M-AC-2.1** — Given an ongoing conversation, when I ask a context-dependent
    follow-up ("what about its hidden ability?"), then the answer reflects the
    earlier turns in that thread.
  - **M-AC-2.2** — The thread scrolls as a single conversation; previous turns
    remain visible by scrolling up.

- **M-CHAT-US-3** — As any user, I want to start a new conversation, so that I
  can change topics without polluting context.
  - **M-AC-3.1** — When I start a new conversation, the agent no longer has the
    prior thread's context, and a fresh empty thread is shown.

### Streaming & live activity

- **M-CHAT-US-4** — As any user, I want to see the answer build in real time with
  an indication of what the agent is doing, so the wait feels responsive and I
  trust the reasoning.
  - **M-AC-4.1** — The answer text streams **token-by-token** as it arrives (not
    a single delayed dump).
  - **M-AC-4.2** — While the agent is using tools, the app shows **live
    tool-activity indicators** (e.g. "looking up move priority…"), mirroring the
    web experience, then transitions to the streamed answer.
  - **M-AC-4.3** — A clear in-progress state is visible from send until the
    terminal answer; the user can tell the difference between "working" and
    "done."
  - **M-AC-4.4** — If the stream is interrupted by a transport/connection fault,
    the app surfaces a clear, recoverable error (e.g. retry) and does not leave a
    half-rendered answer in an ambiguous state. (See `platform-and-operational.md`
    for offline/connection behavior.)

### Image input (camera + photo library)

- **M-CHAT-US-5** — As any user, I want to attach photos to a question — taken
  with the camera or chosen from my library — so I can ask things like "what is
  this Pokémon?" or "rate this team sheet."
  - **M-AC-5.1** — From the chat composer I can **take a photo with the camera**
    or **pick image(s) from the photo library**, and attach them to the turn.
  - **M-AC-5.2** — I can attach up to **4 images per turn** (the existing backend
    cap); attempting more is prevented with a clear message.
  - **M-AC-5.3** — Attached images show as thumbnails in the composer before
    send, and each can be removed before sending.
  - **M-AC-5.4** — A turn may be sent with **images and empty text** (image-only
    question is valid).
  - **M-AC-5.5** — When the backend rejects an image (unsupported type, too
    large, too many), the app shows a clear, specific message and lets the user
    fix it — it does not silently drop the image or crash.
  - **M-AC-5.6** — The app requests camera and photo-library permission only when
    the user invokes those actions, with a clear purpose string; if permission is
    denied, the app explains how to enable it and still allows the other input
    methods.

### Champions mode

- **M-CHAT-US-6** — As any user, I want to switch Oak's entire data scope between
  the standard Scarlet/Violet index and the Champions regulation format, so my
  answers match the format I care about.
  - **M-AC-6.1** — A visible, easily reachable toggle switches between standard
    and Champions mode.
  - **M-AC-6.2** — When Champions mode is on, answers are scoped to the Champions
    format (the agent has no way to widen scope), and answers indicate the format
    they're based on.
  - **M-AC-6.3** — The current mode is obvious at a glance while chatting (the
    user always knows which scope they're in).

## Business rules

- **M-BR-CHAT-1** — **Online-only for new answers.** Producing a new answer
  requires the backend (the model lives server-side); there is no on-device
  answering. Offline behavior is specified in `platform-and-operational.md`.
- **M-BR-CHAT-2** — **No model/scope choice leaks to the user as agent input.**
  Champions mode is the only data-scope control; the app does not expose model
  selection (the active model is operator-controlled server-side, per `CLAUDE.md`).
- **M-BR-CHAT-3** — **Images are consume-on-turn.** Attached images ride only on
  the current turn and are not part of stored/replayed history — consistent with
  the backend's existing image handling. Reopening a past turn does not re-attach
  or re-upload images.
- **M-BR-CHAT-4** — **Input limits and rate limits are enforced server-side**
  (input-length cap, per-session rate limit). The app must surface these limits
  gracefully (see `accounts-and-access.md` for rate-limit UX), not assume they
  won't happen.
- **M-BR-CHAT-5** — **Answer fidelity is non-negotiable.** The native renderer
  must represent every `OakAnswer` field the web app renders; it must not drop
  citations, flags, or the format tag for visual brevity.

## Dependencies & notes

- Depends on the **streaming client foundation** and **guest session** (see
  `accounts-and-access.md`) — chat works for guests with no sign-in.
- The image pipeline reuses the backend's existing validation (count cap,
  magic-byte MIME sniff, per-image/total byte caps); the app's job is native
  capture/selection and clear error surfacing, not re-implementing validation.
- Tappable entities/citations within an answer open the **artifact viewer** —
  specified in `artifact-viewer.md`.
