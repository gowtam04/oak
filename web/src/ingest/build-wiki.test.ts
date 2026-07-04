/**
 * Unit test — build-wiki (the offline half of the Fandom corpus). Exercises the
 * cache → rows mapping against a TINY fixture cache dir written to a temp
 * directory (no live crawl):
 *
 *   - pages map to wiki_page rows (license default applied, revised_at passthrough),
 *   - chunks map to wiki_chunk rows with stable `${id}#${i}` ids,
 *   - empty-text chunks are dropped and a blank section defaults to "Overview",
 *   - an absent cache dir builds ZERO rows (never throws) so ingest tolerates a
 *     never-fetched corpus.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildWikiRows, WIKI_LICENSE } from "./build-wiki";

let cacheDir: string;

beforeAll(() => {
  const root = mkdtempSync(path.join(tmpdir(), "oak-wiki-"));
  cacheDir = path.join(root, "pages");
  mkdirSync(cacheDir, { recursive: true });

  writeFileSync(
    path.join(cacheDir, "ash-ketchum.json"),
    JSON.stringify({
      id: "ash-ketchum",
      title: "Ash Ketchum",
      url: "https://pokemon.fandom.com/wiki/Ash_Ketchum",
      revised_at: 1_700_000_000_000,
      // license omitted on purpose → default applies
      chunks: [
        { section: "Overview", text: "Ash Ketchum is a Pokémon Trainer from Pallet Town." },
        { section: "", text: "He travels with Pikachu." }, // blank section → "Overview"
        { section: "Empty", text: "   " }, // empty text → dropped
      ],
    }),
    "utf8",
  );

  writeFileSync(
    path.join(cacheDir, "mewtwo.json"),
    JSON.stringify({
      id: "mewtwo",
      title: "Mewtwo",
      url: "https://pokemon.fandom.com/wiki/Mewtwo",
      revised_at: null,
      license: "CC BY-SA 4.0",
      chunks: [{ section: "Biology", text: "Mewtwo is a cloned Pokémon." }],
    }),
    "utf8",
  );

  // A non-JSON stray file the builder must ignore.
  writeFileSync(path.join(cacheDir, "README.txt"), "not a page", "utf8");
});

afterAll(() => {
  rmSync(path.dirname(cacheDir), { recursive: true, force: true });
});

describe("buildWikiRows maps the crawl cache to table rows", () => {
  it("builds one wiki_page row per cached page (license default + passthrough)", () => {
    const { pages } = buildWikiRows(cacheDir);
    expect(pages).toHaveLength(2);
    const ash = pages.find((p) => p.id === "ash-ketchum");
    expect(ash).toMatchObject({
      id: "ash-ketchum",
      title: "Ash Ketchum",
      url: "https://pokemon.fandom.com/wiki/Ash_Ketchum",
      revised_at: 1_700_000_000_000,
      license: WIKI_LICENSE, // default applied (page omitted it)
    });
    const mewtwo = pages.find((p) => p.id === "mewtwo");
    expect(mewtwo?.revised_at).toBeNull();
  });

  it("builds chunk rows with stable ids, dropping empty text and defaulting blank sections", () => {
    const { chunks } = buildWikiRows(cacheDir);
    const ashChunks = chunks.filter((c) => c.page_id === "ash-ketchum");
    // The "   " chunk is dropped; the two real ones survive.
    expect(ashChunks).toHaveLength(2);
    expect(ashChunks[0]).toMatchObject({
      id: "ash-ketchum#0",
      section: "Overview",
    });
    // Blank section (index 1) defaults to "Overview" and keeps its index in the id.
    expect(ashChunks[1]).toMatchObject({
      id: "ash-ketchum#1",
      section: "Overview",
    });
    expect(chunks.some((c) => c.id === "mewtwo#0")).toBe(true);
  });
});

describe("buildWikiRows tolerates an absent cache", () => {
  it("returns empty arrays (never throws) when the dir is missing", () => {
    const out = buildWikiRows(path.join(tmpdir(), "oak-wiki-does-not-exist-xyz"));
    expect(out).toEqual({ pages: [], chunks: [] });
  });
});
