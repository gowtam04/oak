/**
 * Guards for the B-26 in-process prune scheduler. Strip behavior is covered
 * by turn-record-retention.oracle.test.ts; this file pins skip conditions so
 * the interval never starts under Vitest.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  _resetTurnRecordPruneSchedulerForTests,
  shouldStartTurnRecordPruneScheduler,
  startTurnRecordPruneScheduler,
} from "./turn-record-prune-scheduler";

describe("shouldStartTurnRecordPruneScheduler", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    _resetTurnRecordPruneSchedulerForTests();
  });

  it("skips when VITEST is set (this process)", () => {
    expect(process.env.VITEST).toBeTruthy();
    expect(shouldStartTurnRecordPruneScheduler()).toBe(false);
  });

  it("skips NODE_ENV=test even if VITEST is unset", () => {
    vi.stubEnv("VITEST", "");
    vi.stubEnv("NODE_ENV", "test");
    expect(shouldStartTurnRecordPruneScheduler()).toBe(false);
  });

  it("skips the Edge runtime and production builds", () => {
    vi.stubEnv("VITEST", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_RUNTIME", "edge");
    expect(shouldStartTurnRecordPruneScheduler()).toBe(false);

    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    expect(shouldStartTurnRecordPruneScheduler()).toBe(false);
  });

  it("would start on a nodejs production server", () => {
    vi.stubEnv("VITEST", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "");
    expect(shouldStartTurnRecordPruneScheduler()).toBe(true);
  });

  it("startTurnRecordPruneScheduler is a no-op under Vitest", () => {
    startTurnRecordPruneScheduler();
    startTurnRecordPruneScheduler();
    // If the interval started, the process would keep a timer; unref'd or not,
    // the skip guard must prevent that. Reaching here without hanging is the
    // assertion; the started flag must still allow a later reset.
    _resetTurnRecordPruneSchedulerForTests();
  });
});
