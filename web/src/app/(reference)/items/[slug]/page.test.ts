/**
 * /items/[slug] — unknown slug 404; no other-game chips.
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
  loadItemPage: vi.fn(),
}));
vi.mock("@/data/reference-pages", () => loaders);

vi.mock("next/link", () => ({
  default: ({ children }: { children: unknown }) => children,
}));

import ItemDetailPage from "./page";

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "page.tsx"),
  "utf8",
);

describe("/items/[slug] (CF-DEX-AC-1.4, CF-DEX-AC-1.5, CF-UI-AC-7.1)", () => {
  beforeEach(() => {
    nav.notFound.mockClear();
    loaders.loadItemPage.mockReset();
  });

  it("has no format chips or other-game fallback copy", () => {
    expect(SRC).not.toMatch(/FormatChips/);
    expect(SRC).not.toMatch(/parseFormatParam/);
    expect(SRC).not.toMatch(/\?format=/);
    expect(SRC).not.toMatch(/Scarlet/);
    expect(SRC).not.toMatch(/National Dex/i);
    expect(SRC).not.toMatch(/Select another scope/);
  });

  it("calls notFound for an off-roster item (no natdex fallback)", async () => {
    loaders.loadItemPage.mockResolvedValue(null);
    await expect(
      ItemDetailPage({
        params: Promise.resolve({ slug: "choice-band" }),
        searchParams: Promise.resolve({ format: "scarlet-violet" }),
      }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
    expect(nav.notFound).toHaveBeenCalled();
    expect(loaders.loadItemPage.mock.calls[0]?.[0]).toBe("choice-band");
    expect(loaders.loadItemPage.mock.calls[0]?.[1]).not.toBe("scarlet-violet");
  });
});
