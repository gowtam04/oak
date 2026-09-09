/**
 * /pokedex index — Champions roster only (P6c).
 *
 * Requirement refs: CF-DEX-US-1, CF-DEX-AC-1.1, CF-DEX-AC-1.5.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "page.tsx"),
  "utf8",
);

describe("/pokedex index copy (CF-DEX-AC-1.1, CF-DEX-AC-1.5)", () => {
  it("describes the Champions Pokédex, not every generation", () => {
    expect(SRC).toMatch(/Champions/);
    expect(SRC).not.toMatch(/Scarlet/);
    expect(SRC).not.toMatch(/National Dex/i);
    expect(SRC).not.toMatch(/Generations 5/);
    expect(SRC).not.toMatch(/mainline/);
    expect(SRC).not.toMatch(/Other formats/);
  });

  it("does not offer a format chip or ?format= picker", () => {
    expect(SRC).not.toMatch(/FormatChips/);
    expect(SRC).not.toMatch(/\?format=/);
  });
});
