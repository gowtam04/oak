/**
 * Next.js instrumentation hook — Node server process start.
 *
 * Starts the B-26 daily `turn_record` prune tick. Fail-soft inside the
 * scheduler: a prune fault must never crash boot. Skipped on the Edge
 * runtime, during `next build`, and in tests.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startTurnRecordPruneScheduler } = await import(
    "@/server/turn-record-prune-scheduler"
  );
  startTurnRecordPruneScheduler();
}
