/**
 * /abilities/[slug] — unknown slug 404; no other-game chips.
 *
 * Requirement refs: CF-DEX-AC-1.2, CF-DEX-AC-1.4, CF-DEX-AC-1.5, CF-UI-AC-7.1.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => nav);

const loaders = vi.hoisted(() => ({
  loadAbilityPage: vi.fn(),
}));
vi.mock("@/data/reference-pages", () => loaders);

vi.mock("next/link", () => ({
  default: ({ children }: { children: unknown }) => children,
}));

import AbilityDetailPage from "./page";

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "page.tsx"),
  "utf8",
);

describe("/abilities/[slug] (CF-DEX-AC-1.4, CF-DEX-AC-1.5, CF-UI-AC-7.1)", () => {
  beforeEach(() => {
    nav.notFound.mockClear();
    loaders.loadAbilityPage.mockReset();
  });

  it("has no format chips or other-game fallback copy", () => {
    expect(SRC).not.toMatch(/FormatChips/);
    expect(SRC).not.toMatch(/parseFormatParam/);
    expect(SRC).not.toMatch(/\?format=/);
    expect(SRC).not.toMatch(/Scarlet/);
    expect(SRC).not.toMatch(/National Dex/i);
    expect(SRC).not.toMatch(/Select another scope/);
  });

  it("calls notFound for an off-roster ability (no natdex fallback)", async () => {
    loaders.loadAbilityPage.mockResolvedValue(null);
    await expect(
      AbilityDetailPage({
        params: Promise.resolve({ slug: "battle-bond" }),
        searchParams: Promise.resolve({ format: "national-dex" }),
      }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
    expect(nav.notFound).toHaveBeenCalled();
    expect(loaders.loadAbilityPage.mock.calls[0]?.[0]).toBe("battle-bond");
    expect(loaders.loadAbilityPage.mock.calls[0]?.[1]).not.toBe("national-dex");
  });
});
