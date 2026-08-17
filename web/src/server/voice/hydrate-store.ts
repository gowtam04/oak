/**
 * In-process voice hydrate registry (ADR-7, VOICE-BR-5). States: running /
 * failed. A real chat turn calls `abortVoiceCompile` so an in-flight compile
 * cannot overwrite the new turn. Retry (`setHydrateRunning` again) preempts
 * the previous compile — it does not 409. Failed entries expire after ~30 min.
 */

export const HYDRATE_TTL_MS = 30 * 60 * 1000;

export type HydrateStatus = "running" | "failed";

export type HydrateState = {
  assistant_message_id: string;
  status: HydrateStatus;
};

type HydrateEntry = {
  assistantMessageId: string;
  status: HydrateStatus;
  controller: AbortController;
  updatedAt: number;
};

const globalForHydrate = globalThis as typeof globalThis & {
  __oakVoiceHydrate?: Map<string, HydrateEntry>;
};

/** Tests reset this to 0 so TTL assertions can pass an absolute `now`. */
let nowOverride: number | undefined;

function nowMs(): number {
  return nowOverride ?? Date.now();
}

function store(): Map<string, HydrateEntry> {
  if (!globalForHydrate.__oakVoiceHydrate) {
    globalForHydrate.__oakVoiceHydrate = new Map();
  }
  return globalForHydrate.__oakVoiceHydrate;
}

function publicState(entry: HydrateEntry): HydrateState {
  return {
    assistant_message_id: entry.assistantMessageId,
    status: entry.status,
  };
}

/** Mark hydrate running for this conversation (preempts a prior running compile). */
export function setHydrateRunning(
  conversationId: string,
  assistantMessageId: string,
): void {
  const map = store();
  const prev = map.get(conversationId);
  if (prev && !prev.controller.signal.aborted) {
    prev.controller.abort();
  }
  map.set(conversationId, {
    assistantMessageId,
    status: "running",
    controller: new AbortController(),
    updatedAt: nowMs(),
  });
}

/** Mark hydrate failed so Reload can offer Retry (VOICE-AC-3.1). */
export function setHydrateFailed(
  conversationId: string,
  assistantMessageId: string,
): void {
  const map = store();
  const prev = map.get(conversationId);
  if (prev && !prev.controller.signal.aborted) {
    prev.controller.abort();
  }
  map.set(conversationId, {
    assistantMessageId,
    status: "failed",
    controller: prev?.controller ?? new AbortController(),
    updatedAt: nowMs(),
  });
}

/** Drop the entry (success path; `done` is omitted from GET conversation). */
export function clearHydrate(conversationId: string): void {
  store().delete(conversationId);
}

/**
 * Abort an in-flight compile and mark failed for Retry (VOICE-BR-5).
 * No-op when nothing is running.
 */
export function abortVoiceCompile(conversationId: string): void {
  const entry = store().get(conversationId);
  if (!entry) return;
  if (!entry.controller.signal.aborted) {
    entry.controller.abort();
  }
  entry.status = "failed";
  entry.updatedAt = nowMs();
}

/** Current hydrate state, or undefined if missing / failed-TTL expired. */
export function getHydrate(
  conversationId: string,
  now: number = nowMs(),
): HydrateState | undefined {
  const map = store();
  const entry = map.get(conversationId);
  if (!entry) return undefined;
  if (entry.status === "failed" && now - entry.updatedAt >= HYDRATE_TTL_MS) {
    map.delete(conversationId);
    return undefined;
  }
  return publicState(entry);
}

/** AbortSignal for the conversation's current compile, if any. */
export function getHydrateSignal(
  conversationId: string,
): AbortSignal | undefined {
  return store().get(conversationId)?.controller.signal;
}

/**
 * True when `signal` is still this conversation's current compile generation.
 * A Retry/`setHydrateRunning` swap yields a new controller — the replaced
 * compile must not write or mark failed (VOICE-BR-5).
 */
export function isCurrentHydrateSignal(
  conversationId: string,
  signal: AbortSignal | undefined,
): boolean {
  if (!signal) return false;
  return store().get(conversationId)?.controller.signal === signal;
}

/** Test-only: drop every entry and pin the clock at 0 for TTL cases. */
export function _resetStoreForTests(): void {
  store().clear();
  nowOverride = 0;
}
