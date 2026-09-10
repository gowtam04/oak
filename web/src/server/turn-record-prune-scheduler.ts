/**
 * Daily in-process tick that strips aged `turn_record` blobs (B-26).
 *
 * Started from `instrumentation.ts` on the always-on Node server. Fail-soft:
 * errors log and never crash the web process. Skipped in tests. Not hooked to
 * Fly `release_command`.
 */

import {
  PRUNE_INTERVAL_MS,
  runPruneExclusive,
} from "@/data/repos/turn-record-retention";
import { logger } from "@/server/logger";

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

export function shouldStartTurnRecordPruneScheduler(): boolean {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") {
    return false;
  }
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return false;
  }
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return false;
  }
  return true;
}

export async function runScheduledTurnRecordPrune(
  now: number = Date.now(),
): Promise<void> {
  try {
    const { pool } = await import("@/data/db");
    const outcome = await runPruneExclusive(pool, { now });
    if (outcome.skipped === "lock") {
      logger.info(
        { event: "turn_record_prune_skipped", reason: "lock" },
        "oak_turn_record_prune_skipped",
      );
      return;
    }
    if (outcome.skipped === "interval") {
      logger.info(
        {
          event: "turn_record_prune_skipped",
          reason: "interval",
          last_run_at: outcome.lastRunAt,
        },
        "oak_turn_record_prune_skipped",
      );
      return;
    }
    logger.info(
      {
        event: "turn_record_prune",
        scanned: outcome.result.scanned,
        stripped_guest: outcome.result.strippedGuest,
        stripped_signed: outcome.result.strippedSigned,
      },
      "oak_turn_record_prune",
    );
  } catch (err) {
    logger.error(
      {
        event: "turn_record_prune_failed",
        err: err instanceof Error ? err.message : String(err),
      },
      "oak_turn_record_prune_failed",
    );
  }
}

/** Fire once on boot (catch-up after deploy), then every 24h. Idempotent. */
export function startTurnRecordPruneScheduler(): void {
  if (started) return;
  if (!shouldStartTurnRecordPruneScheduler()) return;
  started = true;
  void runScheduledTurnRecordPrune();
  timer = setInterval(() => {
    void runScheduledTurnRecordPrune();
  }, PRUNE_INTERVAL_MS);
  timer.unref();
}

/** Test-only: drop the started flag so a suite can re-enter. */
export function _resetTurnRecordPruneSchedulerForTests(): void {
  started = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
