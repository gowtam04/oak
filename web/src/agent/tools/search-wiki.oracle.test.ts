/**
 * INDEPENDENT ORACLE — search_wiki (T19). Proves the tool retrieves ranked prose
 * chunks from the wiki corpus through the public dispatch, against a real
 * migrated Postgres schema (Testcontainers) seeded with a handful of
 * wiki_page/wiki_chunk rows (NOT a live crawl):
 *
 *   - a query matching a seeded page returns it with a non-empty snippet + the
 *     correct page url,
 *   - ranking puts the most-relevant chunk first (term frequency),
 *   - an empty corpus AND a no-match query both return `{ results: [] }` (never
 *     an error — search_wiki has no upstream),
 *   - `limit` is respected,
 *   - a query with tsquery-special chars ("Ash's Pokémon!") doesn't throw
 *     (websearch_to_tsquery tolerates it),
 *   - the GIN index over the generated tsvector exists after migration.
 *
 * Wiring mirrors the other tool oracles (resolve-index Gotcha): migrate an
 * isolated schema and install it as the @/data/db singleton BEFORE importing the
 * tool layer; the tool itself reads `ctx.db`, which is bound to this fixture.
 * `import "server-only"` is neutralized for vitest node.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { sql } from "drizzle-orm";

import type { SearchWikiOutput } from "@/agent/schemas";
import type { AgentContext, AgentMode, ToolDef } from "@/agent/types";
import type { OakDb } from "@/data/db";
import { wiki_chunk, wiki_page } from "@/data/schema";

import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../test/support/pg";

type Dispatch = (
  name: string,
  args: unknown,
  ctx: AgentContext,
) => Promise<unknown>;

let fix: PgFixture;
let emptyFix: PgFixture;
let loadError: unknown = null;

let dispatch: Dispatch;
let tools: ToolDef[];
let createAgentContext: typeof import("@/agent/context").createAgentContext;

async function seedCorpus(f: PgFixture): Promise<void> {
  await f.db.insert(wiki_page).values([
    {
      id: "ash-ketchum",
      title: "Ash Ketchum",
      url: "https://pokemon.fandom.com/wiki/Ash_Ketchum",
      revised_at: 1_700_000_000_000,
      license: "CC BY-SA 4.0",
    },
    {
      id: "charizard-anime",
      title: "Charizard (anime)",
      url: "https://pokemon.fandom.com/wiki/Charizard_(anime)",
      revised_at: 1_700_000_001_000,
      license: "CC BY-SA 4.0",
    },
    {
      id: "ep001",
      title: "Pokémon - I Choose You!",
      url: "https://pokemon.fandom.com/wiki/EP001",
      revised_at: 1_700_000_002_000,
      license: "CC BY-SA 4.0",
    },
    {
      id: "mewtwo-strikes-back",
      title: "Mewtwo Strikes Back",
      url: "https://pokemon.fandom.com/wiki/Mewtwo_Strikes_Back",
      revised_at: null,
      license: "CC BY-SA 4.0",
    },
  ]);
  // tsv is a STORED GENERATED column — omitted here; Postgres derives it.
  await f.db.insert(wiki_chunk).values([
    {
      id: "ash-ketchum#0",
      page_id: "ash-ketchum",
      section: "Overview",
      content:
        "Ash Ketchum is a Pokémon Trainer from Pallet Town who dreams of " +
        "becoming a Pokémon Master. He travels with his partner Pikachu and " +
        "once caught a Charizard.",
    },
    {
      id: "charizard-anime#0",
      page_id: "charizard-anime",
      section: "History",
      content:
        "Charizard is one of Ash's Pokémon. Ash's Charizard evolved from " +
        "Charmander into Charmeleon and finally Charizard. Charizard was " +
        "disobedient toward Ash at first before becoming loyal. Charizard is " +
        "a Fire and Flying type.",
    },
    {
      id: "ep001#0",
      page_id: "ep001",
      section: "Plot",
      content:
        "In the very first episode, Ash Ketchum begins his Pokémon journey " +
        "and receives Pikachu from Professor Oak in Pallet Town.",
    },
    {
      id: "mewtwo-strikes-back#0",
      page_id: "mewtwo-strikes-back",
      section: "Synopsis",
      content:
        "Mewtwo Strikes Back is the first Pokémon movie. Mewtwo, a cloned " +
        "Pokémon created from Mew, seeks revenge against humanity.",
    },
  ]);
}

beforeAll(async () => {
  try {
    fix = await createPgSchema({ seed: "none" });
    emptyFix = await createPgSchema({ seed: "none" });
    await seedCorpus(fix);
    await installAsSingleton(fix);

    ({ dispatch, tools } = await import("@/agent/tools"));
    ({ createAgentContext } = await import("@/agent/context"));
  } catch (e) {
    loadError = e;
  }
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
  await emptyFix?.cleanup();
});

function ensureLoaded(): void {
  if (loadError) {
    throw new Error(`Tool layer not loadable: ${String(loadError)}`);
  }
}

function ctxFor(db: OakDb, mode: AgentMode = "standard"): Promise<AgentContext> {
  return createAgentContext({ db, requestId: "oracle", mode });
}

async function search(
  db: OakDb,
  query: string,
  limit?: number,
): Promise<SearchWikiOutput> {
  const ctx = await ctxFor(db);
  return dispatch(
    "search_wiki",
    limit === undefined ? { query } : { query, limit },
    ctx,
  ) as Promise<SearchWikiOutput>;
}

describe("search_wiki holds its fixed T19 slot (append-only order)", () => {
  it("exposes `search_wiki` at index 19, after run_sql (18) and web_search (17)", () => {
    ensureLoaded();
    expect(tools[17]?.name).toBe("web_search");
    expect(tools[18]?.name).toBe("run_sql");
    expect(tools[19]?.name).toBe("search_wiki");
  });
});

describe("search_wiki retrieves ranked prose chunks (T19)", () => {
  it("returns a matching page with a non-empty snippet and its url", async () => {
    ensureLoaded();
    const out = await search(fix.db as unknown as OakDb, "Pallet Town journey");
    expect(out.results.length).toBeGreaterThan(0);
    const ep = out.results.find((r) => r.url.endsWith("/EP001"));
    expect(ep).toBeDefined();
    expect(ep!.title).toBe("Pokémon - I Choose You!");
    expect(ep!.section).toBe("Plot");
    expect(ep!.snippet.length).toBeGreaterThan(0);
    expect(ep!.revised_at).toBe(1_700_000_002_000);
  });

  it("ranks the most-relevant chunk first (term frequency)", async () => {
    ensureLoaded();
    // "Charizard" appears many times in the Charizard page, once on Ash's page.
    const out = await search(fix.db as unknown as OakDb, "Charizard");
    expect(out.results.length).toBeGreaterThanOrEqual(2);
    expect(out.results[0]?.title).toBe("Charizard (anime)");
  });

  it("respects the limit", async () => {
    ensureLoaded();
    const out = await search(fix.db as unknown as OakDb, "Pokémon", 1);
    expect(out.results.length).toBe(1);
  });

  it("returns [] for a no-match query (never an error)", async () => {
    ensureLoaded();
    const out = await search(
      fix.db as unknown as OakDb,
      "quantum blockchain macroeconomics",
    );
    expect(out).toEqual({ results: [] });
  });

  it("returns [] for an empty corpus (never an error)", async () => {
    ensureLoaded();
    const out = await search(emptyFix.db as unknown as OakDb, "Pikachu");
    expect(out).toEqual({ results: [] });
  });

  it("tolerates tsquery-special characters without throwing", async () => {
    ensureLoaded();
    const out = await search(fix.db as unknown as OakDb, "Ash's Pokémon!");
    expect(Array.isArray(out.results)).toBe(true);
  });
});

describe("search_wiki has a GIN index over the generated tsvector", () => {
  it("wiki_chunk_tsv_idx exists and is a GIN index", async () => {
    ensureLoaded();
    const res = (await fix.db.execute(sql`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = ${fix.schemaName}
        AND tablename = 'wiki_chunk'
        AND indexname = 'wiki_chunk_tsv_idx'
    `)) as unknown as { rows: { indexdef: string }[] };
    expect(res.rows.length).toBe(1);
    expect(res.rows[0]!.indexdef.toLowerCase()).toContain("using gin");
  });
});
