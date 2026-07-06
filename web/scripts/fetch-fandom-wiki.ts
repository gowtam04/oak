/**
 * scripts/fetch-fandom-wiki.ts — the OFFLINE crawler for Oak's Fandom wiki
 * corpus (Oak v2 §4.2/§5), backing T19 `search_wiki`.
 *
 * Run MANUALLY (`npm run fetch:wiki`), NEVER by `npm run ingest`. It politely
 * crawls the pokemon.fandom.com MediaWiki API for a curated set of GAME-only
 * categories (in-game locations/routes/towns, glitches, in-game mechanics and
 * events, items, and Mystery Dungeon incl. its game NPCs/locations), strips each
 * page's wikitext to plain prose, section-splits it, and writes one JSON file
 * per page to the GITIGNORED cache `web/.wiki-cache/pages/`.
 *
 * Oak is a GAMES assistant (design.md §9b): the corpus is prose about the GAMES
 * only. Anime episodes, movies/films, TV, manga, and other franchise MEDIA are
 * OUT of scope and are NOT crawled — no Episodes/Movies/Ash's-Pokémon/anime-
 * character categories.
 *
 * Record shape:
 *
 *   { id, title, url, revised_at (epoch ms), license: "CC BY-SA 4.0",
 *     chunks: [{ section, text }, …] }
 *
 * The ingest builder (src/ingest/build-wiki.ts) reads that cache via `fs` to
 * build the wiki_page/wiki_chunk tables. The cache is NOT committed (multi-MB
 * community prose, CC BY-SA); a full crawl is a prod/ingest-time step.
 *
 * Politeness: a descriptive User-Agent, ~1.5s between requests, and Retry-After
 * honored on 429/503. Bound the crawl with `--limit=N` (default a few thousand
 * pages); pass `--categories=A,B` to override the curated list.
 *
 * License note: Fandom is CC BY-SA 4.0 — commercial-safe. Bulbapedia (CC
 * BY-NC-SA) is NEVER crawled (Oak is monetized). Attribution (license + url +
 * revision timestamp) is stored per page and surfaced in every wiki citation.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API = "https://pokemon.fandom.com/api.php";
const PAGE_BASE = "https://pokemon.fandom.com/wiki/";
const USER_AGENT =
  "Oak-PokemonAgent/1.0 (offline wiki corpus builder for a Pokémon Q&A app; " +
  "polite ~1.5s crawl; contact: oak app)";
const LICENSE = "CC BY-SA 4.0";
const REQUEST_DELAY_MS = 1500;
/** Default overall page cap (a full curated crawl is a few thousand pages). */
const DEFAULT_LIMIT = 3000;
/** Per-category enumeration cap (safety valve for very large categories). */
const CATEGORY_PAGE_CAP = 1500;

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, "..");
const CACHE_ROOT = path.resolve(PROJECT_ROOT, ".wiki-cache");
const PAGES_DIR = path.resolve(CACHE_ROOT, "pages");

/**
 * Curated GAME-only category list v1 (design.md §9b — Oak is a games assistant).
 * In-game locations/routes/towns, glitches, in-game mechanics and events, items,
 * and Mystery Dungeon (games + their NPCs/locations). NO anime/media categories
 * (Episodes, Movies, Ash's Pokémon, generic anime-dominated "Characters").
 *
 * Fandom category names vary and are fuzzy — the crawl is defensive: a category
 * that enumerates to nothing is logged and skipped, so tuning this list never
 * breaks the run. Final names are verified against the live API at prod-crawl
 * time (see report). `cmtype=page` excludes sub-categories/files.
 */
const CATEGORIES: string[] = [
  "Locations",
  "Routes",
  "Towns",
  "Cities",
  "Items",
  "Glitches",
  "Glitch Pokémon",
  "Game mechanics",
  "Events",
  "Pokémon Mystery Dungeon",
  "Mystery Dungeon characters",
  "Mystery Dungeon locations",
];

/**
 * Explicit seed titles crawled in addition to the categories — high-value GAME
 * hub pages that anchor the corpus even if a category name is off. Keeps a small
 * bounded `--limit` run useful (it always pulls these real pages first). GAME
 * content only — glitches, in-game location hubs, and Mystery Dungeon; NO
 * Ash/anime/movie seeds (design.md §9b).
 */
const SEED_TITLES: string[] = [
  "Glitches",
  "Pokémon Glitches",
  "MissingNo.",
  "Glitch City",
  "Pokémon Mystery Dungeon: Red Rescue Team and Blue Rescue Team",
  "Wigglytuff's Guild",
  "Cerulean City",
  "Viridian Forest",
  "Route 119",
  "Safari Zone",
];

// ---------------------------------------------------------------------------
// CLI options
// ---------------------------------------------------------------------------

interface CliOptions {
  limit: number;
  categories: string[];
}

function parseCli(argv: string[]): CliOptions {
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  const catArg = argv.find((a) => a.startsWith("--categories="));
  const limit = limitArg
    ? Math.max(1, Number.parseInt(limitArg.slice("--limit=".length), 10) || DEFAULT_LIMIT)
    : DEFAULT_LIMIT;
  const categories = catArg
    ? catArg
        .slice("--categories=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : CATEGORIES;
  return { limit, categories };
}

// ---------------------------------------------------------------------------
// Polite HTTP (JSON, ~1.5s spacing, Retry-After honored)
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(params: Record<string, string>): Promise<unknown> {
  const url = `${API}?${new URLSearchParams({ ...params, format: "json", formatversion: "2" }).toString()}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (res.status === 429 || res.status === 503) {
      const retryAfter = Number.parseInt(res.headers.get("retry-after") ?? "", 10);
      const wait = Number.isFinite(retryAfter) ? retryAfter * 1000 : 5000 * (attempt + 1);
      console.warn(`[wiki] ${res.status} — honoring Retry-After, waiting ${wait}ms`);
      await sleep(wait);
      if (attempt >= 5) throw new Error(`persistent ${res.status} from ${API}`);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return res.json();
  }
}

// ---------------------------------------------------------------------------
// MediaWiki API — category enumeration + page content
// ---------------------------------------------------------------------------

interface CategoryMembersResponse {
  query?: { categorymembers?: { title: string }[] };
  continue?: { cmcontinue?: string };
}

/** Enumerate page titles in a category (following cmcontinue, capped). */
async function enumerateCategory(category: string): Promise<string[]> {
  const titles: string[] = [];
  let cmcontinue: string | undefined;
  do {
    const params: Record<string, string> = {
      action: "query",
      list: "categorymembers",
      cmtitle: `Category:${category}`,
      cmlimit: "500",
      cmtype: "page",
      // ns:0 (main/article) only — belt-and-suspenders with cmtype=page so a
      // File:/Category:/Template: member (e.g. the ns:14 `Category:Glitch
      // Pokémon` subcategory, a ns:6 File: page) is never enumerated as an
      // article to fetch. Subcategory members are NOT auto-recursed.
      cmnamespace: "0",
    };
    if (cmcontinue) params.cmcontinue = cmcontinue;
    const data = (await getJson(params)) as CategoryMembersResponse;
    await sleep(REQUEST_DELAY_MS);
    const members = data.query?.categorymembers ?? [];
    for (const m of members) titles.push(m.title);
    cmcontinue = data.continue?.cmcontinue;
  } while (cmcontinue && titles.length < CATEGORY_PAGE_CAP);
  return titles;
}

interface RevisionsResponse {
  query?: {
    pages?: {
      title: string;
      missing?: boolean;
      revisions?: { timestamp?: string; slots?: { main?: { content?: string } } }[];
    }[];
  };
}

interface FetchedPage {
  title: string;
  wikitext: string;
  revisedAt: number | null;
}

/** Fetch one page's latest revision wikitext + timestamp. Null if missing. */
async function fetchPage(title: string): Promise<FetchedPage | null> {
  const data = (await getJson({
    action: "query",
    prop: "revisions",
    rvprop: "content|timestamp",
    rvslots: "main",
    titles: title,
  })) as RevisionsResponse;
  await sleep(REQUEST_DELAY_MS);
  const page = data.query?.pages?.[0];
  if (!page || page.missing) return null;
  const rev = page.revisions?.[0];
  const content = rev?.slots?.main?.content;
  if (!content) return null;
  const revisedAt = rev?.timestamp ? Date.parse(rev.timestamp) : NaN;
  return {
    title: page.title,
    wikitext: content,
    revisedAt: Number.isFinite(revisedAt) ? revisedAt : null,
  };
}

// ---------------------------------------------------------------------------
// Wikitext → plain-prose section chunks (light hand-rolled stripper)
//
// Justification for hand-rolling instead of adding a dep (e.g. wtf_wikipedia):
// this runs OFFLINE in a rarely-run maintenance script producing a lexical
// (not semantic) retrieval corpus, so "good-enough" prose is sufficient and a
// new ~1MB dependency in the request-adjacent tree isn't worth it. The stripper
// removes templates/tables/refs/markup and keeps readable sentences.
// ---------------------------------------------------------------------------

/** Remove balanced `{{…}}` / `{|…|}` constructs (templates + tables), nested. */
function stripBraces(text: string): string {
  let out = text;
  // Iteratively remove innermost {{ }} (templates/infoboxes).
  let prev: string;
  do {
    prev = out;
    out = out.replace(/\{\{[^{}]*\}\}/g, "");
  } while (out !== prev);
  // Remove wiki tables {| … |} (also possibly nested).
  do {
    prev = out;
    out = out.replace(/\{\|[^{}]*?\|\}/gs, "");
  } while (out !== prev);
  return out;
}

/** Collapse `[[Link|Text]]`→Text, `[[Link]]`→Link, drop File/Image/Category. */
function stripLinks(text: string): string {
  return text
    .replace(/\[\[(?:File|Image|Category)[^\]]*\]\]/gi, "")
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, "$1")
    .replace(/\[https?:\/\/\S+\]/g, "");
}

/** Strip remaining HTML tags/comments/refs and inline markup. */
function stripMarkup(text: string): string {
  return text
    .replace(/<!--.*?-->/gs, "")
    .replace(/<ref[^>]*>.*?<\/ref>/gis, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/'''''|'''|''/g, "")
    .replace(/^[*#:;]+\s?/gm, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface Chunk {
  section: string;
  text: string;
}

/** Split wikitext into { section, text } prose chunks. */
function toChunks(wikitext: string): Chunk[] {
  const cleaned = stripBraces(wikitext);
  const lines = cleaned.split(/\r?\n/);
  const chunks: Chunk[] = [];
  // Heading breadcrumb stack (level = number of `=`). The section label is the
  // full path, not just the leaf, so hub/table-of-contents pages keep context.
  const stack: { level: number; title: string }[] = [];
  let buffer: string[] = [];

  const sectionLabel = (): string =>
    stack.map((s) => s.title).join(" > ") || "Overview";

  const flush = (): void => {
    const text = stripMarkup(stripLinks(buffer.join("\n")));
    if (text.length >= 40) chunks.push({ section: sectionLabel(), text });
    buffer = [];
  };

  for (const line of lines) {
    const heading = line.match(/^\s*(={2,})\s*(.+?)\s*(={2,})\s*$/);
    if (heading) {
      flush();
      // Carry the heading HIERARCHY into the section label (a breadcrumb like
      // "Generation II > Gold and Silver > Cloning Pokémon and Items"), not just
      // the leaf heading. The "Glitches" hub page nests each glitch as a `===`/
      // `====` sub-heading under a `==Generation N==` parent, so overwriting the
      // section on every heading would drop the generation/game context — a query
      // like "cloning glitch Generation II" would then match nothing. Titles are
      // markup-stripped (a heading may itself carry [[links]]/'''bold''').
      const level = Math.min(heading[1]!.length, heading[3]!.length);
      const title = stripMarkup(stripLinks(heading[2]!)).trim();
      while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();
      if (title.length > 0) stack.push({ level, title });
    } else {
      buffer.push(line);
    }
  }
  flush();
  return chunks;
}

// ---------------------------------------------------------------------------
// Slug + cache write
// ---------------------------------------------------------------------------

function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['".]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pageUrl(title: string): string {
  return PAGE_BASE + encodeURIComponent(title.replace(/ /g, "_"));
}

function writePage(fetched: FetchedPage, chunks: Chunk[]): void {
  const id = slugify(fetched.title);
  const record = {
    id,
    title: fetched.title,
    url: pageUrl(fetched.title),
    revised_at: fetched.revisedAt,
    license: LICENSE,
    chunks,
  };
  fs.writeFileSync(
    path.join(PAGES_DIR, `${id}.json`),
    JSON.stringify(record, null, 1),
    "utf8",
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { limit, categories } = parseCli(process.argv.slice(2));
  fs.mkdirSync(PAGES_DIR, { recursive: true });

  console.log(
    `[wiki] crawling pokemon.fandom.com (limit=${limit}, ` +
      `categories=${categories.length}) → ${PAGES_DIR}`,
  );

  // Collect unique titles: seeds first (so a small --limit still pulls them),
  // then each category in order until the overall cap is hit.
  const wanted = new Set<string>(SEED_TITLES);
  for (const category of categories) {
    if (wanted.size >= limit) break;
    try {
      const titles = await enumerateCategory(category);
      console.log(`[wiki]   Category:${category} → ${titles.length} pages`);
      for (const t of titles) {
        if (wanted.size >= limit) break;
        wanted.add(t);
      }
    } catch (e) {
      console.warn(`[wiki]   Category:${category} failed (${String(e)}) — skipping`);
    }
  }

  const titles = [...wanted].slice(0, limit);
  console.log(`[wiki] fetching ${titles.length} pages…`);

  let written = 0;
  let empty = 0;
  for (const [i, title] of titles.entries()) {
    try {
      const fetched = await fetchPage(title);
      if (!fetched) {
        empty++;
        continue;
      }
      const chunks = toChunks(fetched.wikitext);
      if (chunks.length === 0) {
        empty++;
        continue;
      }
      writePage(fetched, chunks);
      written++;
      if ((i + 1) % 25 === 0 || i + 1 === titles.length) {
        console.log(`[wiki]   ${i + 1}/${titles.length} (${written} written)`);
      }
    } catch (e) {
      console.warn(`[wiki]   "${title}" failed (${String(e)}) — skipping`);
    }
  }

  // A tiny crawl-meta record at the cache root (outside pages/, so the builder,
  // which reads pages/*.json, ignores it). Informational only.
  fs.writeFileSync(
    path.join(CACHE_ROOT, "crawl-meta.json"),
    JSON.stringify(
      { crawledAt: new Date().toISOString(), written, empty, limit, categories },
      null,
      1,
    ),
    "utf8",
  );

  console.log(`[wiki] done — ${written} pages written, ${empty} empty/missing.`);
}

main().catch((e: unknown) => {
  const detail = e instanceof Error ? (e.stack ?? e.message) : String(e);
  console.error(`[wiki] crawl crashed: ${detail}`);
  process.exit(1);
});
