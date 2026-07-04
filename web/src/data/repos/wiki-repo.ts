/**
 * WikiRepo — the SOLE reader of the Fandom wiki corpus tables (`wiki_page` /
 * `wiki_chunk`), backing T19 `search_wiki` (Oak v2 §4.2/§5).
 *
 * v1 retrieval is Postgres BUILT-IN full-text search only (NO pgvector — it's
 * unavailable on prod Fly Postgres; hybrid/embeddings is a documented later
 * follow-up):
 *
 *   - the user query becomes a tsquery via `websearch_to_tsquery('english', …)`
 *     (tolerant of free text and tsquery-special chars — never throws on input),
 *   - matched against the STORED GENERATED `wiki_chunk.tsv` (GIN-indexed),
 *   - ranked by `ts_rank_cd`, and
 *   - snippeted with `ts_headline` (best 2 fragments of the section content).
 *
 * Joined back to `wiki_page` for the title / canonical url / revision timestamp
 * each answer must cite (the corpus is community-sourced, CC BY-SA).
 *
 * Contract (never throws in-domain — this tool has NO upstream to fail):
 *   - no match, an empty corpus, or an unreadable/absent index all return
 *     `{ results: [] }`.
 *
 * node-postgres is ASYNCHRONOUS; the query is a single parameterized statement
 * built with Drizzle's `sql` tag (never string-concatenated). The Drizzle handle
 * is supplied by the caller (the request's DbCtx / a fixture), so this module
 * opens no connection of its own and imports only the TYPE of the handle.
 */

import { sql } from "drizzle-orm";

import type { OakDb } from "@/data/db";
import type { SearchWikiOutput, WikiResult } from "@/agent/schemas";

/** Default result count when the caller doesn't specify `limit`. */
const DEFAULT_LIMIT = 5;
/** Hard cap mirroring the tool's input schema (1..8). */
const MAX_LIMIT = 8;

/** One raw result row as returned by node-postgres (bigint arrives as string). */
interface WikiRow {
  title: string;
  section: string;
  snippet: string;
  url: string;
  revised_at: string | number | null;
}

function toResult(row: WikiRow): WikiResult {
  return {
    title: row.title,
    section: row.section,
    snippet: row.snippet,
    url: row.url,
    // node-postgres returns bigint as a string; coerce (null stays null).
    revised_at: row.revised_at == null ? null : Number(row.revised_at),
  };
}

/**
 * Full-text search the wiki corpus for `query`, returning up to `limit` ranked
 * prose chunks (best match first). `limit` is clamped to [1, MAX_LIMIT]. Uses
 * `websearch_to_tsquery` so any free-text / punctuated query is accepted; a
 * query that reduces to an empty tsquery simply matches nothing.
 *
 * @param query the user's natural-language query.
 * @param limit max results (default 5, clamped to [1, 8]).
 * @param db    the Drizzle handle (from the request's DbCtx / fixture).
 */
export async function searchWiki(
  query: string,
  limit: number | undefined,
  db: OakDb,
): Promise<SearchWikiOutput> {
  const n = Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  try {
    // The tsquery is computed ONCE in the FROM clause (aliased `tsq`, whose
    // single column is also `tsq`) so it's reused by the WHERE match, the rank,
    // and the headline. `ts_headline` snippets the content (2 best fragments).
    const res = (await db.execute(sql`
      SELECT
        p.title AS title,
        c.section AS section,
        ts_headline(
          'english', c.content, tsq,
          'MaxFragments=2,MinWords=8,MaxWords=32'
        ) AS snippet,
        p.url AS url,
        p.revised_at AS revised_at
      FROM wiki_chunk c
      JOIN wiki_page p ON p.id = c.page_id,
           websearch_to_tsquery('english', ${query}) AS tsq
      WHERE c.tsv @@ tsq
      ORDER BY ts_rank_cd(c.tsv, tsq) DESC, c.id ASC
      LIMIT ${n}
    `)) as unknown as { rows: WikiRow[] };

    return { results: res.rows.map(toResult) };
  } catch {
    // Index absent/unreadable (tables not migrated, corpus never fetched) —
    // an empty result set, never a throw (search_wiki has no upstream).
    return { results: [] };
  }
}
