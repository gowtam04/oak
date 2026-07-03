# Voice mode

Real-time, spoken conversation with Oak — the "Pokédex" persona, talking out loud instead of
rendering an `OakAnswer` card. Built on xAI's Grok Voice Agent realtime API. **Signed-in users
only** for v1; guests see a sign-in nudge on the mic button instead of a working session. Web is
the only shipped client — the three server endpoints are already Bearer-compatible
(`getCurrentAccount()` accepts both the web cookie and iOS Bearer), so a native iOS voice client is
a fast-follow with no server changes required.

## 1. What it is

The user taps the mic button next to the composer's attach button, talks, and Oak answers out
loud. Mid-conversation, Oak's real Postgres-backed tools (species data, moves, abilities, damage
math, usage stats, etc.) still answer data questions — the voice model calls them as realtime
function calls, exactly like the text-chat agent calls tools, just without the `submit_answer`
structured-output step. A finished voice turn (user transcript + assistant transcript) is written
into the signed-in conversation as a normal message pair, so voice and text chat share one unified
history: switch back to text and the conversation continues from what was said out loud.

## 2. Architecture

The browser talks **directly** to xAI over WebSocket — there is no WebSocket proxy through Oak's
own server, so the Next/Fly deployment is unchanged. The server's job is narrower: mint a
short-lived token, relay tool calls into the existing tool layer, and persist finished turns.

```
Browser ──POST /api/voice/token──────▶ Next server ──POST {XAI_BASE_URL}/realtime/client_secrets──▶ xAI
        ◀─ token + session bootstrap ─┘
Browser ══ WebSocket wss://api.x.ai/v1/realtime?model=… (subprotocol xai-client-secret.<token>) ══▶ xAI
Browser ──POST /api/voice/tool (per function_call)──▶ Next server → dispatch(name, args, ctx) → Postgres
Browser ──POST /api/voice/transcript (per finished turn)──▶ Next server → conversation repo
```

The **grok-voice model is the brain of the voice session** — not Oak's `runtime.ts` tool loop.
Oak's `OakAnswer` output schema, its existing prompts, and the provider loop are all untouched;
voice is a parallel surface that reuses the tool layer and nothing else from the agent internals.
`web/src/server/voice/voice-session.ts` composes everything the browser needs into one
`VoiceSessionBootstrap` (instructions, voice, reasoning effort, timeouts, tool defs), which the
client feeds into a single `session.update` after the socket opens. The client-side counterpart,
`web/src/lib/voice/voice-session.ts`, is a framework-free state machine (`VoiceSession`) that owns
the whole lifecycle — token fetch, socket open, mic streaming, phase transitions, tool-call
batching, transcript posting — behind an injected-seams interface (`VoiceSessionSeams`) so it's
unit-testable without a real WebSocket, `AudioContext`, or `getUserMedia`. The real DOM-bound audio
implementation lives in `web/src/lib/voice/audio-io.ts` (AudioWorklet capture, queued
`AudioBufferSourceNode` playback); `web/src/components/voice/VoiceOverlay.tsx` is the UI shell
(phase indicator, live captions, tool-activity ticker, elapsed time, End button), opened from the
mic button in `web/src/components/chat/Composer.tsx`.

## 3. The three endpoints

All three are `runtime = "nodejs"`, `dynamic = "force-dynamic"`, dynamic-import their env-touching
modules inside the handler (same discipline as `/api/chat`), and gate on `getCurrentAccount()` —
a guest gets a clean `401 sign_in_required` before any other work happens. Wire types are in
`web/src/lib/voice/voice-types.ts` (client-safe, no `@/env`/`server-only`/db imports, mirroring
`@/lib/sse/sse-types`).

- **`POST /api/voice/token`** (`web/src/app/api/voice/token/route.ts`) — mints the ephemeral xAI
  client secret and returns it plus the full session bootstrap. Body: `VoiceTokenRequestBody`
  (`session_id`, `format`). Rate limit: 5/min per account (token mints are cheap to abuse and each
  opens a billable realtime session). Loads the conversation's prior history (best-effort — a DB
  blip degrades to an empty history, not a 500) to build the injected digest. An xAI mint failure
  is a clean `502 voice_upstream_error`, never a 500. Response: `VoiceTokenResponseBody`.
- **`POST /api/voice/tool`** (`web/src/app/api/voice/tool/route.ts`) — relays one realtime
  `function_call` into Oak's existing `dispatch()`. Body: `VoiceToolRequestBody` (`session_id`,
  `format`, `name`, `arguments` — the raw JSON string xAI delivers). Rate limit: 60/min per account
  (a single spoken turn can fan out into several parallel calls). The `name` MUST be one of the
  voice-advertised tools (Oak's full tool layer minus `submit_answer`) — an unknown or disallowed
  name is a `400 unknown_tool`, defense against the client-driven socket ever pushing
  `submit_answer` or an arbitrary name into `dispatch`. Malformed `arguments` JSON returns a `200`
  with an in-domain `{ output: { error: "invalid_input", ... } }` — the voice model should hear the
  miss and recover, not see a transport fault. A genuinely thrown fault (e.g. a DB outage) is a
  clean `502 tool_dispatch_error`. Response: `VoiceToolResponseBody` (`{ output }`).
- **`POST /api/voice/transcript`** (`web/src/app/api/voice/transcript/route.ts`) — persists one
  finished voice turn. Body: `VoiceTranscriptRequestBody` (`session_id`, `format`, `user_text`,
  `assistant_text` — both required non-empty, else `400`). Rate limit: 30/min per account.
  Synthesizes the minimal valid `answered` `OakAnswer` (`answer_markdown` = the assistant's spoken
  text, empty citations/inferences, `generation_basis` derived from `format` via
  `basisForFormat`), validates it against the real `oakAnswerSchema` before writing, then calls
  `appendTurnPair` (`web/src/data/repos/conversation-repo.ts`) — the exact same signed-in
  turn-pair write `/api/chat` uses. Response: `{ ok: true }`.

## 4. Protocol summary (xAI Grok Voice Agent, realtime)

- **Mint**: `POST {XAI_BASE_URL}/realtime/client_secrets`, `Authorization: Bearer <XAI_API_KEY>`,
  body `{ expires_after: { seconds: 600 } }` → `{ value, expires_at }`.
- **Connect**: `wss://api.x.ai/v1/realtime?model=grok-voice-latest`, WebSocket subprotocol
  `xai-client-secret.<token>` (browsers strip `Authorization` headers on a WS upgrade, hence the
  subprotocol-as-auth trick). Audio is 16-bit signed little-endian mono PCM, base64 in JSON, at the
  browser's native `AudioContext.sampleRate` (nearest xAI-supported rate if exotic).
- **Configure**: one `session.update` right after connect, carrying `instructions`, `voice`,
  `turn_detection: { type: "server_vad", idle_timeout_ms }`, input/output audio format +
  transcription model, `reasoning: { effort }`, and the flattened `tools` list.
- **Client → server events**: `input_audio_buffer.append` (~100 ms PCM16 chunks),
  `conversation.item.create` with a `function_call_output` item (one per finished tool call),
  `response.create` (sent once after all outputs for a batch are in), `pong` (echoing `ping`).
- **Server → client events the client handles**: `session.created`/`session.updated`;
  `input_audio_buffer.speech_started` — **barge-in**: flush local playback immediately, before any
  other bookkeeping; `speech_stopped`/`committed`; `response.created`;
  `response.output_audio.delta` (base64 PCM16 → playback queue);
  `response.output_audio_transcript.delta` (assistant caption text, accumulated until
  `…transcript.done`); `conversation.item.input_audio_transcription.completed` (the user's
  transcript for the turn); `response.function_call_arguments.done` (`{ name, call_id, arguments }`
  — `arguments` is a JSON string; may fire multiple times before any audio for parallel calls — all
  are executed, one `function_call_output` sent per `call_id`, then a single `response.create`);
  `response.done` (closes either a tool-call batch or a spoken turn); `ping`/`error`. xAI does not
  emit `conversation.item.done`, `input_audio_transcription.failed`, or `rate_limits.updated`, so
  the client never waits on those.
- **Turn completion**: when `response.done` arrives with no pending tool calls and both a user and
  an assistant transcript are non-empty, the client fire-and-forgets `POST /api/voice/transcript`
  and resets its per-turn caption/tool-activity state.

## 5. Knobs & ops

All tunables live in one file, `web/src/server/voice/voice-config.ts`:

| Constant | Value | Purpose |
|---|---|---|
| `VOICE_MODEL` | `"grok-voice-latest"` | The realtime model the browser connects to. |
| `VOICE_NAME` | `"rex"` | Voice persona; one knob to change (xAI offers `eve`/`ara`/`rex`/`sal`/`leo`). |
| `VOICE_REASONING_EFFORT` | `"none"` | Latency-first; flip to `"high"` if answer quality demands it. |
| `VOICE_TOKEN_TTL_SECONDS` | `600` | Ephemeral-token lifetime requested from xAI. |
| `VOICE_IDLE_TIMEOUT_MS` | `30_000` | How long the session tolerates user silence after a response before the model may re-engage. |
| `VOICE_MAX_SESSION_MS` | `600_000` (10 min) | Client-side hard auto-end for a single session. |

Rate limits (per signed-in account, defined alongside each route): token mint 5/min, tool relay
60/min, transcript write 30/min.

**Pricing**: xAI bills voice at **$0.05 per minute of audio (~$3/hour)**. As of this writing xAI
has **not published** whether the billable minute is wall-clock session time or actual audio
transmitted — treat the 10-minute client session cap as the primary cost control until that's
confirmed, not the $/min figure alone.

**Signed-in only**: there is no guest voice path. A guest sees the mic button with a sign-in nudge
(`voiceReady = false` in `Composer.tsx`); the three endpoints 401 regardless of what the client
does, so this is enforced server-side, not just hidden in the UI.

**Prompt parity exemption**: `web/src/agent/prompts/voice.ts` (`buildVoiceInstructions`) is a new
prompt surface and is explicitly **exempt** from the `domain.ts`/`domain-grok.ts` parity rule in
`CLAUDE.md` — the voice model is the direct brain of the realtime session (not driven through
`runtime.ts`), and it speaks answers rather than emitting a structured `OakAnswer`, so this prompt
has no output-contract/citation machinery and is free to diverge in structure and wording from the
text-chat prompts. It does still pull the same single-source domain facts (`gen-info.ts`,
`CHAMPIONS_REGULATION`) so the two surfaces never disagree on facts, just on how they're phrased.

## 6. Testing

- **No Docker needed**: the jsdom component tests —
  `web/src/components/voice/voice-session.test.tsx` (drives the `VoiceSession` state machine with
  scripted fake seams — socket events, audio IO, HTTP calls — asserting phase transitions,
  barge-in flush ordering, parallel-function-call batching, and transcript posting) and
  `web/src/components/voice/VoiceOverlay.test.tsx`; and the pure-module tests
  `web/src/lib/voice/voice-protocol.test.ts` and `web/src/agent/prompts/voice.test.ts` (structure
  pins: persona present, tool-announce rule present, Champions regulation mentioned, per-gen facts
  mentioned, history-digest section appears/disappears correctly, no `submit_answer` or markdown
  instructions).
- **Needs Docker** (Testcontainers Postgres, node project): the three route tests
  (`web/src/app/api/voice/token/route.test.ts`, `.../tool/route.test.ts`,
  `.../transcript/route.test.ts` — 401/400/429/502 paths plus happy-path dispatch against the
  `seed: "tools"` fixture DB) and `web/src/server/voice/voice-session.test.ts` (bootstrap
  composition, history digest truncation/eviction, tool-def flattening).

Run everything from `web/`: `npx vitest run --project jsdom` for the Docker-free set, or target an
individual file directly, e.g. `npx vitest run src/agent/prompts/voice.test.ts`.
