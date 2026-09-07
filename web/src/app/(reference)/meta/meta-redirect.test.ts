/**
 * /meta → /usage permanent redirects (CF-USAGE-AC-1.7, CF-INT-BR-7, ADR-5).
 *
 * Former Smogon OU addresses must land on Champions usage, not gen9ou:
 *   /meta                     → /usage
 *   /meta/:format             → /usage          (ignore old gen9ou)
 *   /meta/:format/:slug       → /usage/:slug    when a slug is present
 *
 * Permanent (308) — `permanentRedirect` from `next/navigation`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
  permanentRedirect: vi.fn((url: string) => {
    const err = Object.assign(new Error(`NEXT_REDIRECT ${url}`), {
      digest: `NEXT_REDIRECT;replace;${url};308;`,
      url,
      statusCode: 308,
    });
    throw err;
  }),
  redirect: vi.fn((url: string) => {
    const err = Object.assign(new Error(`NEXT_REDIRECT ${url}`), {
      digest: `NEXT_REDIRECT;replace;${url};307;`,
      url,
      statusCode: 307,
    });
    throw err;
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => nav);

vi.mock("@/data/meta-pages", () => ({
  loadMetaLeaderboard: vi.fn(),
  loadMetaSpecies: vi.fn(),
}));

import MetaIndexPage from "./page";
import MetaFormatPage from "./[format]/page";
import MetaSpeciesPage from "./[format]/[slug]/page";

beforeEach(() => {
  nav.permanentRedirect.mockClear();
  nav.redirect.mockClear();
  nav.notFound.mockClear();
});

function redirectedTo(url: string): void {
  expect(nav.permanentRedirect).toHaveBeenCalledWith(url);
  expect(nav.redirect).not.toHaveBeenCalled();
}

describe("/meta redirects to /usage (CF-USAGE-AC-1.7, ADR-5)", () => {
  it("GET /meta permanently redirects to /usage", async () => {
    await expect(MetaIndexPage()).rejects.toThrow(/\/usage/);
    redirectedTo("/usage");
  });

  it("GET /meta/gen9ou permanently redirects to /usage (ignore old format)", async () => {
    await expect(
      MetaFormatPage({
        params: Promise.resolve({ format: "gen9ou" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(/\/usage/);
    redirectedTo("/usage");
  });

  it("GET /meta/gen9ou/garchomp permanently redirects to /usage/garchomp", async () => {
    await expect(
      MetaSpeciesPage({
        params: Promise.resolve({ format: "gen9ou", slug: "garchomp" }),
      }),
    ).rejects.toThrow(/\/usage\/garchomp/);
    redirectedTo("/usage/garchomp");
  });

  it("GET /meta/anything/farigiraf still uses the slug, not the old format", async () => {
    await expect(
      MetaSpeciesPage({
        params: Promise.resolve({ format: "national-dex", slug: "farigiraf" }),
      }),
    ).rejects.toThrow(/\/usage\/farigiraf/);
    redirectedTo("/usage/farigiraf");
  });
});
