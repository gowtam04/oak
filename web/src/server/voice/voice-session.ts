/**
 * Voice-session server module (server-only; the voice-mode plan §5, workstream
 * S). Three responsibilities, all consumed by the `/api/voice/*` routes:
 *
 *   - `voiceToolDefs()`        — Oak's tool layer, minus `submit_answer`, in the
 *                                FLATTENED xAI Responses function shape the
 *                                realtime session accepts (same flattening as
 *                                runtime.ts::toProviderToolDefs). 16 tools.
 *   - `mintEphemeralToken()`   — mint a short-lived client secret from xAI so the
 *                                browser can open the realtime socket directly
 *                                (no WebSocket proxy through us).
 *   - `buildSessionBootstrap() — compose the instructions (Pokédex persona +
 *                                injected conversation digest) and the tunable
 *                                session config the browser feeds into
 *                                `session.update`.
 *
 * Env gotcha: this module touches `@/env` (which throws at import without
 * XAI_API_KEY), so the routes DYNAMIC-import it inside their handlers — the same
 * discipline `/api/chat` uses for its env-touching imports.
 */

import "server-only";

import { env } from "@/env";
import { tools } from "@/agent/tools";
import { buildVoiceInstructions } from "@/agent/prompts/voice";
import type { ChatMessage } from "@/agent/types";
import type { Format } from "@/data/formats";
import type {
  VoiceSessionBootstrap,
  VoiceToolDefWire,
} from "@/lib/voice/voice-types";
import {
  VOICE_IDLE_TIMEOUT_MS,
  VOICE_MAX_SESSION_MS,
  VOICE_MODEL,
  VOICE_NAME,
  VOICE_REASONING_EFFORT,
  VOICE_TOKEN_TTL_SECONDS,
} from "@/server/voice/voice-config";

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

/**
 * The realtime-session tool list: Oak's full tool layer EXCEPT `submit_answer`
 * (voice speaks its answer — there is no OakAnswer output contract), mapped into
 * xAI's flattened Responses function shape. This is also the allowlist the
 * `/api/voice/tool` route validates a socket-driven call against, so the model
 * can never drive `submit_answer` or an unknown name into `dispatch`.
 */
export function voiceToolDefs(): VoiceToolDefWire[] {
  return tools
    .filter((tool) => tool.name !== "submit_answer")
    .map((tool) => ({
      type: "function" as const,
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    }));
}

// ---------------------------------------------------------------------------
// Ephemeral token
// ---------------------------------------------------------------------------

/**
 * Mint a short-lived xAI client secret the browser uses as the realtime socket
 * subprotocol (`xai-client-secret.<token>`). Throws on any non-OK response or an
 * unexpected body shape — the token route maps that to a clean 502.
 */
export async function mintEphemeralToken(): Promise<{
  value: string;
  expires_at: number;
}> {
  const res = await fetch(`${env.XAI_BASE_URL}/realtime/client_secrets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expires_after: { seconds: VOICE_TOKEN_TTL_SECONDS },
    }),
  });

  if (!res.ok) {
    throw new Error(`xAI client_secrets mint failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as { value?: unknown; expires_at?: unknown };
  if (typeof data.value !== "string" || typeof data.expires_at !== "number") {
    throw new Error("xAI client_secrets mint returned an unexpected shape");
  }
  return { value: data.value, expires_at: data.expires_at };
}

// ---------------------------------------------------------------------------
// Session bootstrap
// ---------------------------------------------------------------------------

/** Per-message truncation and total-digest caps (the voice-mode plan §5). */
const DIGEST_PER_MESSAGE_CHARS = 400;
const DIGEST_TOTAL_CHARS = 4000;
const DIGEST_MAX_MESSAGES = 20;

/**
 * Condense prior text-chat history into a compact digest to inject into the
 * voice session's instructions. Takes the last 20 turns, truncates each to 400
 * chars, then drops the OLDEST lines until the whole digest fits ~4000 chars.
 * Returns `undefined` for an empty history so the prompt omits the section.
 */
function buildHistoryDigest(history: ChatMessage[]): string | undefined {
  if (history.length === 0) return undefined;

  const lines = history.slice(-DIGEST_MAX_MESSAGES).map((m) => {
    const speaker = m.role === "user" ? "User" : "Oak";
    const text =
      m.content.length > DIGEST_PER_MESSAGE_CHARS
        ? `${m.content.slice(0, DIGEST_PER_MESSAGE_CHARS)}…`
        : m.content;
    return `${speaker}: ${text}`;
  });

  // Oldest-first eviction until the joined digest is under the total cap.
  while (lines.length > 0 && lines.join("\n").length > DIGEST_TOTAL_CHARS) {
    lines.shift();
  }

  return lines.length > 0 ? lines.join("\n") : undefined;
}

/**
 * Build the full session bootstrap the browser sends in `session.update`: the
 * composed instructions (persona + scope facts + optional conversation digest),
 * the tunable config (voice / reasoning effort / timeouts), and the tool list.
 */
export function buildSessionBootstrap(opts: {
  format: Format;
  history: ChatMessage[];
}): VoiceSessionBootstrap {
  const historyDigest = buildHistoryDigest(opts.history);
  const instructions = buildVoiceInstructions({
    format: opts.format,
    historyDigest,
  });

  return {
    model: VOICE_MODEL,
    voice: VOICE_NAME,
    instructions,
    reasoning_effort: VOICE_REASONING_EFFORT,
    idle_timeout_ms: VOICE_IDLE_TIMEOUT_MS,
    max_session_ms: VOICE_MAX_SESSION_MS,
    tools: voiceToolDefs(),
  };
}
