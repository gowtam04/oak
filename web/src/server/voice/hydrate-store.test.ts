/**
 * Unit tests for the in-process voice hydrate registry (ADR-7, VOICE-BR-5).
 * States: running / failed / abort. A real chat turn aborts an in-flight
 * compile so it cannot overwrite the new turn. Replacing a running hydrate
 * (Retry) does not 409 — it preempts the previous compile.
 *
 * Importing `@/server/voice/hydrate-store` is the intended red until P4
 * lands the module.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  HYDRATE_TTL_MS,
  _resetStoreForTests,
  abortVoiceCompile,
  clearHydrate,
  getHydrate,
  getHydrateSignal,
  setHydrateFailed,
  setHydrateRunning,
} from "@/server/voice/hydrate-store";

beforeEach(() => {
  _resetStoreForTests();
});

afterEach(() => {
  _resetStoreForTests();
});

describe("hydrate-store — running / failed (VOICE-AC-2.1, VOICE-AC-3.1)", () => {
  it("setHydrateRunning records running + assistant_message_id", () => {
    setHydrateRunning("conv-1", "asst-1");
    expect(getHydrate("conv-1")).toEqual({
      assistant_message_id: "asst-1",
      status: "running",
    });
    expect(getHydrateSignal("conv-1")?.aborted).toBe(false);
  });

  it("setHydrateFailed records failed so Reload can offer Retry (VOICE-AC-3.1)", () => {
    setHydrateRunning("conv-1", "asst-1");
    setHydrateFailed("conv-1", "asst-1");
    expect(getHydrate("conv-1")).toEqual({
      assistant_message_id: "asst-1",
      status: "failed",
    });
  });

  it("clearHydrate drops the entry (success path; done is omitted)", () => {
    setHydrateRunning("conv-1", "asst-1");
    clearHydrate("conv-1");
    expect(getHydrate("conv-1")).toBeUndefined();
  });

  it("isolates hydrate state by conversation id", () => {
    setHydrateRunning("conv-a", "asst-a");
    setHydrateFailed("conv-b", "asst-b");
    expect(getHydrate("conv-a")?.status).toBe("running");
    expect(getHydrate("conv-b")?.status).toBe("failed");
  });
});

describe("hydrate-store — abort preempts (VOICE-BR-5)", () => {
  it("abortVoiceCompile aborts the in-flight signal and marks failed for Retry", () => {
    setHydrateRunning("conv-1", "asst-1");
    const signal = getHydrateSignal("conv-1");
    expect(signal?.aborted).toBe(false);

    abortVoiceCompile("conv-1");

    expect(signal?.aborted).toBe(true);
    expect(getHydrate("conv-1")).toEqual({
      assistant_message_id: "asst-1",
      status: "failed",
    });
  });

  it("abortVoiceCompile is a no-op when nothing is running", () => {
    expect(() => abortVoiceCompile("missing")).not.toThrow();
    expect(getHydrate("missing")).toBeUndefined();
  });

  it("setHydrateRunning replaces another running hydrate (no 409) and preempts it", () => {
    setHydrateRunning("conv-1", "asst-old");
    const first = getHydrateSignal("conv-1");

    setHydrateRunning("conv-1", "asst-new");
    const second = getHydrateSignal("conv-1");

    expect(first?.aborted).toBe(true);
    expect(second?.aborted).toBe(false);
    expect(getHydrate("conv-1")).toEqual({
      assistant_message_id: "asst-new",
      status: "running",
    });
  });
});

describe("hydrate-store — failed TTL (VOICE-AC-3.1)", () => {
  it("failed status expires after the ~30 min TTL so Retry does not linger forever", () => {
    expect(HYDRATE_TTL_MS).toBe(30 * 60 * 1000);
    setHydrateFailed("conv-ttl", "asst-ttl");
    expect(getHydrate("conv-ttl", HYDRATE_TTL_MS - 1)?.status).toBe("failed");
    expect(getHydrate("conv-ttl", HYDRATE_TTL_MS + 1)).toBeUndefined();
  });
});
