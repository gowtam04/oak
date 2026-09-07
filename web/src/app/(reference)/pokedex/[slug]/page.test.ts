/**
 * /pokedex/[slug] — unknown slug 404; Champions data; no other-game chips.
 *
 * Requirement refs: CF-DEX-AC-1.4, CF-DEX-AC-1.5, CF-DEX-AC-1.6, CF-UI-AC-7.1.
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
  loadPokemonPage: vi.fn(),
}));
vi.mock("@/data/reference-pages", () => loaders);

vi.mock("next/link", () => ({
  default: ({ children }: { children: unknown }) => children,
}));

import PokemonDetailPage from "./page";

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "page.tsx"),
  "utf8",
);

describe("/pokedex/[slug] (CF-DEX-AC-1.4, CF-DEX-AC-1.5, CF-UI-AC-7.1)", () => {
  beforeEach(() => {
    nav.notFound.mockClear();
    loaders.loadPokemonPage.mockReset();
  });

  it("has no format chips, ?format= picker, or other-game fallback copy", () => {
    expect(SRC).not.toMatch(/FormatChips/);
    expect(SRC).not.toMatch(/parseFormatParam/);
    expect(SRC).not.toMatch(/\?format=/);
    expect(SRC).not.toMatch(/Scarlet/);
    expect(SRC).not.toMatch(/National Dex/i);
    expect(SRC).not.toMatch(/also in/i);
    expect(SRC).not.toMatch(/Select a generation/);
    expect(SRC).not.toMatch(/smogon/i);
    expect(SRC).not.toMatch(/\/meta/);
  });

  it("embeds UsageBlock and does not point at Smogon /meta (CF-DEX-AC-1.6)", () => {
    expect(SRC).toMatch(/UsageBlock/);
    expect(SRC).not.toMatch(/smogon/i);
    expect(SRC).not.toMatch(/\/meta/);
    expect(SRC).not.toMatch(/gen9ou/);
  });

  it("calls notFound for an off-roster slug (no natdex fallback)", async () => {
    loaders.loadPokemonPage.mockResolvedValue(null);
    await expect(
      PokemonDetailPage({
        params: Promise.resolve({ slug: "incineroar" }),
        searchParams: Promise.resolve({ format: "gen-7" }),
      }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
    expect(nav.notFound).toHaveBeenCalled();
    expect(loaders.loadPokemonPage.mock.calls[0]?.[0]).toBe("incineroar");
    expect(loaders.loadPokemonPage.mock.calls[0]?.[1]).not.toBe("gen-7");
    expect(loaders.loadPokemonPage.mock.calls[0]?.[1]).not.toBe("national-dex");
  });

  it("does not render other-game suggestions on a miss (CF-UI-AC-7.1)", async () => {
    loaders.loadPokemonPage.mockResolvedValue(null);
    await expect(
      PokemonDetailPage({
        params: Promise.resolve({ slug: "eternatus" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
    expect(nav.notFound).toHaveBeenCalled();
  });
});
