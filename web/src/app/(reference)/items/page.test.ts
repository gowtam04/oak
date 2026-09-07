/**
 * /items index — Champions items only (P6c).
 *
 * Requirement refs: CF-DEX-US-1, CF-DEX-AC-1.2.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "page.tsx"),
  "utf8",
);

describe("/items index copy (CF-DEX-AC-1.2)", () => {
  it("describes Champions items, not every generation", () => {
    expect(SRC).toMatch(/Champions/);
    expect(SRC).not.toMatch(/Scarlet/);
    expect(SRC).not.toMatch(/National Dex/i);
    expect(SRC).not.toMatch(/Generations 5/);
  });
});
