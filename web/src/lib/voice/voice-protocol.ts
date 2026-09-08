/**
 * Voice socket protocol — CLIENT-SAFE types + pure helpers for the browser's
 * DIRECT WebSocket to xAI's Grok Voice Agent API.
 *
 * Pure module (no `@/env`, no `server-only`, no db/DOM imports) so it is unit-
 * testable in the node project and reusable verbatim by a future RN client. It
 * mirrors the wire events named in the shared voice-mode plan §3 (verbatim xAI
 * event names, including the `response.output_audio*` ↔ `response.audio*`
 * aliases) and carries the PCM/rate conversion math the audio IO relies on.
 *
 * The socket protocol is NOT the same wire contract as `@/lib/voice/voice-types`
 * (those are our own `/api/voice/*` HTTP bodies); this file is only the xAI
 * realtime frames the client sends/receives.
 */

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/**
 * xAI realtime WebSocket base. Browsers strip Authorization headers on the
 * upgrade, so the ephemeral token rides as the `xai-client-secret.<token>`
 * subprotocol instead (see {@link clientSecretSubprotocol}). The model is a
 * query param, taken from the session bootstrap.
 */
export const VOICE_REALTIME_URL = "wss://api.x.ai/v1/realtime";

/** The transcription model xAI uses for the user's input audio (plan §3). */
export const VOICE_TRANSCRIBE_MODEL = "grok-transcribe";

/** Build the realtime connect URL for a given voice model. */
export function realtimeUrl(model: string): string {
  return `${VOICE_REALTIME_URL}?model=${encodeURIComponent(model)}`;
}

/** The WebSocket subprotocol that carries the ephemeral client secret.
 * Idempotent: a mint `value` that already includes the `xai-client-secret.`
 * prefix is returned as-is so we never double-wrap. */
export function clientSecretSubprotocol(token: string): string {
  return token.startsWith("xai-client-secret.")
    ? token
    : `xai-client-secret.${token}`;
}

// ---------------------------------------------------------------------------
// Supported audio rates
// ---------------------------------------------------------------------------

/** PCM sample rates xAI accepts (plan §3). PCM is 16-bit signed LE mono. */
export const SUPPORTED_SAMPLE_RATES = [
  8000, 16000, 22050, 24000, 32000, 44100, 48000,
] as const;

/**
 * Snap an AudioContext's native rate to the nearest xAI-supported rate. The
 * browser's hardware rate is almost always 44100/48000 (both supported); this
 * only bites on an exotic device rate.
 */
export function nearestSupportedRate(rate: number): number {
  let best = SUPPORTED_SAMPLE_RATES[0] as number;
  let bestDelta = Math.abs(rate - best);
  for (const candidate of SUPPORTED_SAMPLE_RATES) {
    const delta = Math.abs(rate - candidate);
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// PCM conversion (pure, endianness-explicit)
// ---------------------------------------------------------------------------

/** Encode 16-bit PCM samples to base64 (little-endian, as xAI expects). */
export function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < pcm.length; i += 1) {
    view.setInt16(i * 2, pcm[i]!, true); // little-endian
  }
  let binary = "";
  // Chunked to keep String.fromCharCode's argument count bounded on long
  // buffers (playback deltas can be sizeable).
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Decode base64 PCM16 (little-endian) back into 16-bit samples. */
export function base64ToInt16(b64: string): Int16Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const usable = bytes.length - (bytes.length % 2);
  const view = new DataView(bytes.buffer, 0, usable);
  const out = new Int16Array(usable >> 1);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = view.getInt16(i * 2, true);
  }
  return out;
}

/** Convert normalized Float32 audio [-1,1] to 16-bit PCM (clamped). */
export function float32ToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** Convert 16-bit PCM to normalized Float32 audio [-1,1] for playback. */
export function int16ToFloat32(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i += 1) {
    out[i] = pcm[i]! / 0x8000;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Client → server events
// ---------------------------------------------------------------------------

/** One tool advertised to the realtime model (xAI FLATTENED function shape). */
export interface RealtimeToolDef {
  type: "function";
  name: string;
  description: string;
  parameters: unknown;
}

/** The `session.update` config the client sends once the socket opens. */
export interface SessionUpdateEvent {
  type: "session.update";
  session: {
    instructions: string;
    voice: string;
    turn_detection: { type: "server_vad"; idle_timeout_ms: number };
    audio: {
      input: {
        format: { type: "audio/pcm"; rate: number };
        transcription: { model: string };
      };
      output: { format: { type: "audio/pcm"; rate: number } };
    };
    reasoning: { effort: "none" | "high" };
    tools: RealtimeToolDef[];
  };
}

export interface InputAudioAppendEvent {
  type: "input_audio_buffer.append";
  audio: string; // base64 PCM16
}

export interface FunctionCallOutputEvent {
  type: "conversation.item.create";
  item: {
    type: "function_call_output";
    call_id: string;
    output: string; // JSON string
  };
}

export interface ResponseCreateEvent {
  type: "response.create";
}

export interface PongEvent {
  type: "pong";
  ping_timestamp: number;
}

export type ClientEvent =
  | SessionUpdateEvent
  | InputAudioAppendEvent
  | FunctionCallOutputEvent
  | ResponseCreateEvent
  | PongEvent;

// ---------------------------------------------------------------------------
// Server → client events
// ---------------------------------------------------------------------------

/**
 * The realtime frames the client acts on (plan §3). Extra fields xAI may add
 * are ignored — narrowing is by `type`. Audio + transcript deltas each carry
 * two aliased type names; both are normalized by {@link parseServerEvent}.
 */
export type ServerEvent =
  | { type: "session.created" }
  | { type: "session.updated" }
  | { type: "input_audio_buffer.speech_started" }
  | { type: "input_audio_buffer.speech_stopped" }
  | { type: "input_audio_buffer.committed" }
  | { type: "response.created" }
  | { type: "response.output_audio.delta"; delta: string }
  | { type: "response.output_audio_transcript.delta"; delta: string }
  | { type: "response.output_audio_transcript.done" }
  | {
      type: "conversation.item.input_audio_transcription.completed";
      transcript: string;
    }
  | {
      type: "response.function_call_arguments.done";
      name: string;
      call_id: string;
      arguments: string;
    }
  | { type: "response.done" }
  | { type: "ping"; ping_timestamp?: number }
  | { type: "error"; code?: string; message?: string };

/** Server event type strings that are aliased to a canonical name. */
const TYPE_ALIASES: Record<string, ServerEvent["type"]> = {
  "response.audio.delta": "response.output_audio.delta",
  "response.audio_transcript.delta": "response.output_audio_transcript.delta",
  "response.audio_transcript.done": "response.output_audio_transcript.done",
};

/**
 * Parse a raw socket text frame into a normalized {@link ServerEvent}, or
 * `null` for malformed JSON / a frame with no string `type` / a `type` this
 * client does not handle. Aliased delta/transcript names collapse to their
 * canonical form so the state machine has a single case per concept.
 */
export function parseServerEvent(data: string): ServerEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.type !== "string") return null;

  const type = TYPE_ALIASES[obj.type] ?? obj.type;

  switch (type) {
    case "session.created":
    case "session.updated":
    case "input_audio_buffer.speech_started":
    case "input_audio_buffer.speech_stopped":
    case "input_audio_buffer.committed":
    case "response.created":
    case "response.output_audio_transcript.done":
    case "response.done":
      return { type };
    case "response.output_audio.delta":
    case "response.output_audio_transcript.delta":
      return typeof obj.delta === "string"
        ? { type, delta: obj.delta }
        : null;
    case "conversation.item.input_audio_transcription.completed":
      return typeof obj.transcript === "string"
        ? { type, transcript: obj.transcript }
        : null;
    case "response.function_call_arguments.done":
      return typeof obj.name === "string" &&
        typeof obj.call_id === "string" &&
        typeof obj.arguments === "string"
        ? {
            type,
            name: obj.name,
            call_id: obj.call_id,
            arguments: obj.arguments,
          }
        : null;
    case "ping":
      return {
        type,
        ping_timestamp:
          typeof obj.ping_timestamp === "number"
            ? obj.ping_timestamp
            : undefined,
      };
    case "error": {
      // xAI (and the OpenAI-compatible realtime wire) nests the payload under
      // `error: { code, message }`. Older / test frames put `code`/`message`
      // at the top level. Prefer the nested object, fall back to top-level.
      const nested =
        typeof obj.error === "object" && obj.error !== null
          ? (obj.error as Record<string, unknown>)
          : undefined;
      const code =
        typeof nested?.code === "string"
          ? nested.code
          : typeof obj.code === "string"
            ? obj.code
            : undefined;
      const message =
        typeof nested?.message === "string"
          ? nested.message
          : typeof obj.message === "string"
            ? obj.message
            : undefined;
      return { type, code, message };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Tool-activity labels (presentational; client-safe mirror of the runtime map)
// ---------------------------------------------------------------------------

/**
 * A short, friendly label for a tool the voice model calls, mirroring the
 * emoji + phrasing of the runtime's chat progress labels so the overlay ticker
 * speaks the same visual language. Presentational only — an unknown tool falls
 * back to a generic label rather than throwing.
 */
const VOICE_TOOL_LABELS: Record<string, string> = {
  resolve_entity: "🔍 Resolving name…",
  query_pokedex: "📊 Searching the Pokédex…",
  get_pokemon: "📇 Looking up Pokémon…",
  get_move: "⚔️ Looking up move…",
  get_ability: "✨ Looking up ability…",
  get_type_matchups: "🛡️ Checking type matchups…",
  get_evolution_chain: "🧬 Tracing evolution…",
  get_item: "🎒 Looking up item…",
  compute_stat: "🧮 Computing stat…",
  estimate_damage: "💥 Estimating damage…",
  get_team: "📋 Reading your team…",
  save_team: "💾 Saving your team…",
  get_encounters: "🗺️ Checking where to find it…",
  get_usage_stats: "📈 Checking live usage…",
  list_teams: "📋 Finding your teams…",
  get_learnset: "📖 Checking the learnset…",
};

export function voiceToolLabel(tool: string): string {
  return VOICE_TOOL_LABELS[tool] ?? `Running ${tool}…`;
}
