/**
 * T19 — `search_wiki`.
 *
 * Full-text retrieval over Oak's self-built Fandom prose corpus (Oak v2
 * §4.2/§5, re-scoped by §9b) — the GAME-content answer path: in-game locations,
 * routes and towns, glitches, in-game mechanics and events, item/walkthrough
 * prose, and Mystery Dungeon (a spin-off GAME) that Oak's structured @pkmn +
 * natdex data doesn't carry. Oak is a GAMES assistant: the corpus is prose about
 * the GAMES only — NOT anime episodes/movies/TV/manga/characters. Backed by
 * `wiki-repo.searchWiki` (the sole reader of wiki_page/wiki_chunk), Postgres
 * built-in full-text search (websearch_to_tsquery + ts_rank_cd + ts_headline).
 * The agent may call it repeatedly with reformulated queries (agentic
 * retrieval).
 *
 * NEVER an error: an empty corpus OR a no-match query both return
 * `{ results: [] }` — this tool has no upstream to fail. Results are prose
 * excerpts from the community wiki (CC BY-SA), so the model MUST cite them with
 * their URL and treat them as community-sourced, not authoritative game data.
 */

import type { ToolDef } from "@/agent/types";
import {
  searchWikiInputSchema,
  toJsonSchema,
  type SearchWikiOutput,
} from "@/agent/schemas";
import { searchWiki } from "@/data/repos/wiki-repo";
import type { OakDb } from "@/data/db";

const description =
  "Search the community Pokémon wiki (pokemon.fandom.com) for GAME content that " +
  "Oak's structured data doesn't carry: in-game locations, routes and towns, " +
  "glitches, in-game mechanics and events, item and walkthrough prose (e.g. " +
  "where to find an HM/TM, catch strategies), and Mystery Dungeon (a spin-off " +
  "game). Oak is a GAMES assistant — this covers the games ONLY, NOT anime " +
  "episodes, movies, TV, manga, or characters (those are out of scope; decline " +
  "them). Returns ranked prose excerpts, each with its section, a highlighted " +
  "snippet, and the page URL. For competitive data, stats, movesets, type " +
  "matchups, or battle math, the typed tools are authoritative — prefer those. " +
  "Results are community-sourced (CC BY-SA), NOT authoritative game data: cite " +
  "each with its URL and flag them as such. Call again with a reformulated " +
  "query if the first results miss. An empty result means nothing matched (or " +
  "the corpus isn't built) — never an error.";

export const searchWikiTool: ToolDef = {
  name: "search_wiki",
  description,
  inputSchema: toJsonSchema(searchWikiInputSchema),
  run(args, ctx): Promise<SearchWikiOutput> {
    const parsed = searchWikiInputSchema.safeParse(args);
    if (!parsed.success) {
      // Malformed input degrades to an empty result (never throws in-domain).
      return Promise.resolve({ results: [] });
    }
    return searchWiki(
      parsed.data.query,
      parsed.data.limit,
      ctx.db as unknown as OakDb,
    );
  },
};
