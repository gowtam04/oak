/**
 * T19 — `search_wiki`.
 *
 * Full-text retrieval over Oak's self-built Fandom prose corpus (Oak v2
 * §4.2/§5) — the answer path for anime episodes/movies, characters (Ash and
 * his Pokémon), Mystery Dungeon and other spin-offs, glitches, game lore, and
 * franchise trivia that Oak's structured @pkmn + natdex data doesn't carry.
 * Backed by `wiki-repo.searchWiki` (the sole reader of wiki_page/wiki_chunk),
 * Postgres built-in full-text search (websearch_to_tsquery + ts_rank_cd +
 * ts_headline). The agent may call it repeatedly with reformulated queries
 * (agentic retrieval).
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
  "Search the community Pokémon wiki (pokemon.fandom.com) for anime episodes " +
  "and movies, characters (incl. Ash Ketchum and Ash's Pokémon), Mystery " +
  "Dungeon and other spin-offs, glitches, game lore, and franchise trivia that " +
  "Oak's structured data doesn't carry. Returns ranked prose excerpts, each " +
  "with its section, a highlighted snippet, and the page URL. For competitive " +
  "data, stats, movesets, type matchups, or battle math, the typed tools are " +
  "authoritative — prefer those. Results are community-sourced (CC BY-SA), NOT " +
  "authoritative game data: cite each with its URL and flag them as such. Call " +
  "again with a reformulated query if the first results miss. An empty result " +
  "means nothing matched (or the corpus isn't built) — never an error.";

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
