/**
 * T21 — `get_meta_usage` (backlog B-5).
 *
 * Stored monthly Smogon ladder usage — what a Pokémon runs on a competitive
 * ladder (most-used moves / items / abilities / EV-spreads / teammates, plus its
 * checks-and-counters), with its usage %, rank, and a short usage/rank trend.
 * Reads the offline `meta_snapshot`/`meta_usage` warehouse (synced from Smogon's
 * monthly chaos stats by `sync:meta`) through `meta-repo.ts` — NOT a live fetch.
 *
 * v1 covers ONE ladder, `"gen9ou"` (Smogon OU, Gen 9 singles). Pokémon Champions
 * is deliberately NOT a meta_format: its CURRENT usage is served live by T15
 * `get_usage_stats`, never from these stored monthly Smogon snapshots.
 *
 * Available in ALL scopes: the ladder is an explicit input (`meta_format`), so
 * the server-controlled data scope stays uninvolved — there is no `ctx.mode`
 * gate (unlike get_encounters / get_usage_stats). The data is MONTHLY, so the
 * prompt tells the model to cite the ladder + month and flag staleness.
 *
 * DB-read conventions mirror get_learnset / get_encounters: the Drizzle handle
 * comes from `ctx.db`; in-domain misses return documented structured shapes
 * (`{ found:false, suggestions }`, `{ error:"no_data", months_available }`) and
 * the tool never throws for them. A genuine repo/transport fault propagates like
 * every other DB-reading tool (no try/catch swallow) — get_learnset does the
 * same (it does not wrap its repo reads).
 */

import type { ToolDef } from "@/agent/types";
import {
  getMetaUsageInputSchema,
  toJsonSchema,
  type GetMetaUsageOutput,
} from "@/agent/schemas";
import {
  listMetaMonths,
  metaSnapshot,
  metaLeaderboard,
  metaSpeciesDetail,
  metaSpeciesTrend,
} from "@/data/repos/meta-repo";
import { metaFormatConfig } from "@/data/meta-formats";
import type { OakDb } from "@/data/db";

/** Static attribution — the model MUST cite Smogon for any usage figure. */
const ATTRIBUTION = "Smogon usage statistics (smogon.com/stats)";

/** Trend window surfaced with a hit (ascending, oldest first). */
const TREND_MONTHS = 6;

/** Max suggestions offered on a name miss. */
const MAX_SUGGESTIONS = 5;

const description =
  "Get STORED monthly Smogon ladder usage for a Pokémon — what it runs on the " +
  "competitive ladder (most-used moves, items, abilities, EV spreads, teammates, " +
  "and its checks & counters), plus its usage %, rank, and a short usage/rank " +
  "trend. Use for 'what does X run in OU', 'is X used on the ladder', 'top " +
  "moves/items/spread for X' and similar. Map 'OU', 'Smogon', 'the ladder', or " +
  "'singles usage' to meta_format \"gen9ou\" (the only ladder available in v1: " +
  "Smogon OU, Gen 9 singles). Omit `month` for the latest synced month. ALWAYS " +
  "cite the ladder AND the month in your answer, and flag that the stats are " +
  "MONTHLY (not live) so the meta may have moved. For Pokémon Champions' CURRENT " +
  "usage use get_usage_stats instead; for whole-leaderboard or aggregate " +
  "questions (top-N, counts across the ladder) use run_sql over meta_usage / " +
  "meta_snapshot. Resolve the species name first (resolve_entity) if it might be " +
  "misspelled.";

/** Lowercase + strip every non-alphanumeric char (so "great-tusk" == "Great Tusk"). */
function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Rank a month's display names by affinity to the query for miss suggestions:
 * a prefix match beats a substring match beats an unrelated name; ties keep the
 * leaderboard's (usage-rank) order. Returns up to {@link MAX_SUGGESTIONS} names.
 */
function suggestNames(
  query: string,
  roster: { display_name: string }[],
): string[] {
  const q = normalize(query);
  const scored = roster
    .map((r, i) => {
      const n = normalize(r.display_name);
      let score = 0;
      if (q.length > 0) {
        if (n.startsWith(q) || q.startsWith(n)) score = 3;
        else if (n.includes(q) || q.includes(n)) score = 2;
      }
      return { name: r.display_name, score, order: i };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order);

  const ranked = scored.length > 0 ? scored : roster.map((r) => ({ name: r.display_name }));
  return ranked.slice(0, MAX_SUGGESTIONS).map((s) => s.name);
}

export const getMetaUsageTool: ToolDef = {
  name: "get_meta_usage",
  description,
  inputSchema: toJsonSchema(getMetaUsageInputSchema),
  async run(args, ctx): Promise<GetMetaUsageOutput> {
    const parsed = getMetaUsageInputSchema.safeParse(args);
    if (!parsed.success) {
      // Invalid input degrades to the file's miss convention (never throws).
      return { found: false, suggestions: [] };
    }
    const { name, meta_format, month: requestedMonth } = parsed.data;
    const db = ctx.db as unknown as OakDb;

    // Resolve the month: use the requested one only if it's actually synced;
    // otherwise default to the latest synced month. An unsynced ladder (empty
    // months) is `no_data` in every case.
    const months = await listMetaMonths(db, meta_format);
    if (months.length === 0) {
      return { error: "no_data", months_available: [] };
    }
    let month: string;
    if (requestedMonth !== undefined) {
      if (!months.includes(requestedMonth)) {
        return { error: "no_data", months_available: months };
      }
      month = requestedMonth;
    } else {
      month = months[0]!; // listMetaMonths is most-recent-first.
    }

    // Resolve the species against that month's roster: exact normalized match on
    // the species slug OR the display name (case/format-insensitive).
    const roster = await metaLeaderboard(db, meta_format, month);
    const wanted = normalize(name);
    const entry = roster.find(
      (r) => normalize(r.species) === wanted || normalize(r.display_name) === wanted,
    );
    if (!entry) {
      return { found: false, suggestions: suggestNames(name, roster) };
    }

    // Assemble the hit from the detail row, the trend, and the snapshot bookkeeping.
    const detail = await metaSpeciesDetail(db, meta_format, month, entry.species);
    if (!detail) {
      // The species was in the leaderboard but the detail row is missing — treat
      // as a miss rather than throwing (the two reads are always in sync in
      // practice; this is defensive).
      return { found: false, suggestions: suggestNames(name, roster) };
    }
    const trend = await metaSpeciesTrend(db, meta_format, entry.species, TREND_MONTHS);
    const snapshot = await metaSnapshot(db, meta_format, month);
    const config = metaFormatConfig(meta_format);

    return {
      found: true,
      name,
      species: detail.species,
      display_name: detail.display_name,
      meta_format,
      meta_format_label: config.label,
      smogon_format_id: snapshot?.smogon_format_id ?? config.smogonFormatId,
      month,
      cutoff: snapshot?.cutoff ?? config.defaultCutoff,
      rank: detail.rank,
      usage_pct: detail.usage_pct,
      moves: detail.moves,
      items: detail.items,
      abilities: detail.abilities,
      spreads: detail.spreads,
      teammates: detail.teammates,
      counters: detail.counters,
      trend: trend.map((t) => ({
        month: t.month,
        usage_pct: t.usage_pct,
        rank: t.rank,
      })),
      total_battles: snapshot?.total_battles ?? null,
      source_url: snapshot?.source_url ?? "",
      attribution: ATTRIBUTION,
    };
  },
};
