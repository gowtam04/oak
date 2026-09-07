/**
 * Reference 404 — missing entities look missing, not like another Dex.
 *
 * Requirement refs: CF-UI-US-7, CF-UI-AC-7.1.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "not-found.tsx"),
  "utf8",
);

describe("reference not-found (CF-UI-AC-7.1)", () => {
  it("copy names the Champions roster and does not suggest another game", () => {
    expect(SRC).toMatch(/Champions roster/);
    expect(SRC).not.toMatch(/Scarlet/);
    expect(SRC).not.toMatch(/National Dex/i);
    expect(SRC).not.toMatch(/gen-7/);
    expect(SRC).not.toMatch(/Incineroar/);
    expect(SRC).not.toMatch(/Eternatus/);
    expect(SRC).not.toMatch(/did you mean/i);
    expect(SRC).not.toMatch(/href=/);
  });
});
