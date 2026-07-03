# Oak for Android — Chat Experience

> The core of the app: reasoned-answer chat, native streaming, multi-turn
> context, image input, and the six-scope chip. IDs scoped `D-`. Append;
> never renumber.

## Index — iPhone requirements applicability

| iPhone ID | Status | Note |
|---|---|---|
| M-CHAT-US-1 (core chat) | Same | Reasoned/cited `OakAnswer`; in-domain failures render as normal answers, never a crash; tables/sprites wrap/scroll without clipping. |
| M-CHAT-US-2 (multi-turn context) | Same | Follow-ups reflect earlier turns; thread scrolls as one conversation. |
| M-CHAT-US-3 (new conversation) | Same | Starting fresh drops prior context. |
| M-CHAT-US-4 (streaming & live activity) | Same | Token-by-token streaming, live tool-activity indicators, clear in-progress/done state, recoverable stream-interruption error. |
| M-CHAT-US-5 (image input) | Modified | Same outcome; Android's capture/selection mechanism and permission model differ — see D-CH-2/D-CH-3. |
| M-CHAT-US-6 (Champions toggle) | **Replaced** | No longer exists product-wide. Android ships the current six-scope chip — see D-CH-1. |
| M-BR-CHAT-1..5 | Same | Online-only for new answers; no model/scope leaked as tool input; images consume-on-turn; limits enforced server-side; answer fidelity non-negotiable. |

## Android-specific requirements

### D-CH-1 — Scope chip (six-scope model)

A compact scope chip, always visible from the chat surface, shows the
current turn's resolved scope (e.g. "Champions", "Scarlet/Violet", "Gen 7").
Tapping it opens a picker of all **six** scopes — Champions (default),
Scarlet/Violet, and mainline Gen 5–8 — with the current pick marked. A pick
seeds the **next** message sent (no retroactive re-scoping of on-screen
answers); the picker is disabled while a turn streams. The app also honors
server-resolved scope signals (an in-message mention, the conversation's
sticky scope, or the default) and reflects whichever scope the backend
actually resolved, not just the chip's last pick — the chip and every
answer's scope tag never disagree for the same turn. The empty-chat state
hints at the scope model in plain language (Champions is the default;
mention a game or use the chip). The picker only ever offers the six known
scopes — scope is never a free-form value the chat text can widen beyond
what the server resolves.

### D-CH-2 — Photo picker + camera capture

From the composer: pick image(s) via the **Android Photo Picker** (system
picker, not a full gallery-access grant) or **capture a photo with the
camera**, up to **4 images per turn** (more is prevented with a clear
message). Attached images show as removable thumbnails before send; a turn
may be sent with images and empty text. Backend image rejection (bad type,
too large, too many) shows a specific, actionable message — never a silent
drop or crash. **Permission model**: the Photo Picker needs **no runtime
permission** on supported Android versions (out-of-process, hands back only
selected URIs) — use it instead of requesting broad media access. **Camera
permission is requested only when the camera action is tapped**, with a
clear purpose string; if denied, the app explains how to enable it in
Settings and still allows picker-based attachment.

### D-CH-3 — Image re-encoding (server compatibility)

- **D-BR-CH-3** — The backend accepts **JPEG/PNG/GIF/WebP only — no
  HEIC/HEIF** and sniffs the true format from magic bytes. Because Android
  camera/gallery sources can produce HEIC, the app **re-encodes every
  attached image to JPEG or PNG before upload**, matching the backend's
  decoded-byte/dimension caps (mirrors the iPhone encoder's caps and
  fit/quality loop, via Android image APIs).

## Business rules

- **D-BR-CHAT-1** — Same as M-BR-CHAT-1: online-only, no on-device answering.
- **D-BR-CHAT-2** — Same as M-BR-CHAT-2, current model: the scope chip
  (D-CH-1) is the only data-scope control; model selection is never exposed.
- **D-BR-CHAT-3** — Same as M-BR-CHAT-3: images are consume-on-turn, never
  stored/replayed history.
- **D-BR-CHAT-4** — Same as M-BR-CHAT-4: input/rate limits enforced
  server-side; the app surfaces them gracefully.
- **D-BR-CHAT-5** — Same as M-BR-CHAT-5: the renderer represents every
  `OakAnswer` field the web app renders.

## Dependencies & notes

- Depends on the streaming client foundation and guest session
  (`accounts-and-access.md`).
- The image pipeline reuses the backend's existing validation; the app's job
  is native capture/selection, client-side re-encoding, and clear error
  surfacing — not re-implementing validation.
- Tappable entities/citations open the artifact viewer (`artifact-viewer.md`).
- The scope chip's six values, `scope_seed`, and the `scope` SSE event are
  wire-contract facts detailed in the architecture doc set.
