/**
 * In-process voice tool-trace buffer (ADR-8). Keyed by conversation /
 * voice `session_id`, appended from `POST /api/voice/tool`, read by
 * `runVoiceCompile`. TTL 30 min; missing/expired → empty calls so compile
 * can still run on speech alone. Not persisted (single Fly machine).
 */

export const VOICE_TRACE_TTL_MS = 30 * 60 * 1000;

export type VoiceTraceCall = {
  name: string;
  input: unknown;
  output: unknown;
};

export type VoiceTrace = {
  conversationId: string;
  calls: VoiceTraceCall[];
  updatedAt: number;
};

type TraceEntry = {
  calls: VoiceTraceCall[];
  updatedAt: number;
};

const globalForTrace = globalThis as typeof globalThis & {
  __oakVoiceTrace?: Map<string, TraceEntry>;
};

function store(): Map<string, TraceEntry> {
  if (!globalForTrace.__oakVoiceTrace) {
    globalForTrace.__oakVoiceTrace = new Map();
  }
  return globalForTrace.__oakVoiceTrace;
}

function expired(entry: TraceEntry, now: number): boolean {
  return now - entry.updatedAt >= VOICE_TRACE_TTL_MS;
}

/** Append one tool call to the session's in-process buffer. */
export function appendVoiceTrace(
  sessionId: string,
  call: VoiceTraceCall,
  now: number = Date.now(),
): void {
  const map = store();
  const existing = map.get(sessionId);
  if (!existing || expired(existing, now)) {
    map.set(sessionId, { calls: [call], updatedAt: now });
    return;
  }
  existing.calls.push(call);
  existing.updatedAt = now;
}

/**
 * Read the session's buffered calls. Missing or past TTL → empty `calls`
 * (fail-soft; never throws).
 */
export function getVoiceTrace(
  sessionId: string,
  now: number = Date.now(),
): VoiceTrace {
  const map = store();
  const existing = map.get(sessionId);
  if (!existing || expired(existing, now)) {
    if (existing) map.delete(sessionId);
    return { conversationId: sessionId, calls: [], updatedAt: now };
  }
  return {
    conversationId: sessionId,
    calls: existing.calls,
    updatedAt: existing.updatedAt,
  };
}

/** Test-only: drop every buffered session. */
export function _resetStoreForTests(): void {
  store().clear();
}
