/**
 * Client-safe wire types for the voice-mode HTTP endpoints (`/api/voice/*`).
 *
 * Mirrors the style of `@/lib/sse/sse-types` — a PURE, portable module (no
 * `@/env`, no `server-only`, no db/repo imports) so both the browser voice
 * client (workstream F) and the server routes (workstream S) can share one
 * definition. `Format` comes from `@/data/formats`, which is already the pure
 * mode↔format source of truth.
 *
 * These are the contracts three surfaces integrate on:
 *   - `POST /api/voice/token`      → mint an ephemeral xAI token + session
 *                                    bootstrap the browser feeds into
 *                                    `session.update`.
 *   - `POST /api/voice/tool`       → relay one realtime function call to Oak's
 *                                    tool layer and return its JSON result.
 *   - `POST /api/voice/transcript` → persist one completed voice turn (user +
 *                                    assistant transcript) into the signed-in
 *                                    conversation.
 *
 * The grok-voice model (NOT Oak's runtime.ts loop) is the brain of the voice
 * session; it calls Oak's tools as realtime function calls and the browser
 * relays each one here. See the shared voice-mode plan, §5.
 */

import type { Format } from "@/data/formats";

/** Request body for `POST /api/voice/token`. */
export interface VoiceTokenRequestBody {
  session_id: string;
  format: Format;
}

/**
 * One tool advertised to the realtime voice model (xAI's FLATTENED Responses
 * function shape: `{ type, name, description, parameters }`, not the nested
 * `{ function: {…} }` Chat-Completions shape). `parameters` is the tool's JSON
 * Schema (kept `unknown` to stay SDK-free on the wire).
 */
export interface VoiceToolDefWire {
  type: "function";
  name: string;
  description: string;
  parameters: unknown;
}

/**
 * Everything the browser needs to configure the realtime session via a single
 * `session.update` after the socket opens (plus the client-side auto-end cap).
 */
export interface VoiceSessionBootstrap {
  model: string;
  voice: string;
  instructions: string;
  reasoning_effort: "none" | "high";
  idle_timeout_ms: number;
  max_session_ms: number;
  tools: VoiceToolDefWire[];
}

/** Response body for `POST /api/voice/token`. */
export interface VoiceTokenResponseBody {
  token: string;
  /** Unix seconds — when the ephemeral token expires. */
  expires_at: number;
  session: VoiceSessionBootstrap;
}

/**
 * Request body for `POST /api/voice/tool` — one realtime function call relayed
 * from the socket. `arguments` is the raw JSON STRING xAI delivers (parsed +
 * validated server-side; malformed args return an in-domain error, not a fault).
 */
export interface VoiceToolRequestBody {
  session_id: string;
  format: Format;
  name: string;
  arguments: string;
}

/**
 * Response body for `POST /api/voice/tool` — the tool's structured result,
 * echoed back to the socket as a `function_call_output`. `output` is whatever
 * shape Oak's tool layer returned (the model reasons over it).
 */
export interface VoiceToolResponseBody {
  output: unknown;
}

/** Request body for `POST /api/voice/transcript` — one completed voice turn. */
export interface VoiceTranscriptRequestBody {
  session_id: string;
  format: Format;
  user_text: string;
  assistant_text: string;
}
