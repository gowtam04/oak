/**
 * Shared voice-mode constants (single source of truth; the voice-mode plan §4).
 *
 * Pure constants — no env, no SDK. The voice-session module and the routes read
 * these; the browser client receives the tunable ones inside the session
 * bootstrap. Each is a single knob to change:
 *   - VOICE_NAME / VOICE_REASONING_EFFORT are quality-vs-latency dials.
 *   - VOICE_TOKEN_TTL_SECONDS bounds how long a minted ephemeral token lives.
 *   - VOICE_MAX_SESSION_MS is the client-side hard auto-end.
 */

/** The xAI Grok Voice Agent model the browser connects to. */
export const VOICE_MODEL = "grok-voice-latest";

/** Pokédex voice; single knob to change the persona's voice. */
export const VOICE_NAME = "rex";

/** Latency-first; flip to "high" if answer quality demands it. */
export const VOICE_REASONING_EFFORT: "none" | "high" = "none";

/** Ephemeral-token lifetime requested from xAI (seconds). */
export const VOICE_TOKEN_TTL_SECONDS = 600;

/** Server VAD idle timeout — how long silence runs before the turn ends. */
export const VOICE_IDLE_TIMEOUT_MS = 30_000;

/** Client-side hard cap on a single voice session (auto-end). */
export const VOICE_MAX_SESSION_MS = 10 * 60_000;
