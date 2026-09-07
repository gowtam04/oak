/**
 * Public Usage gateway — join the live ladder onto the Champions roster
 * (slug + skip off-roster names) and assemble GET /api/usage* envelopes.
 *
 * Fail-soft: upstream faults become `{ available: false, error:
 * "upstream_unavailable" }` on 200. Never Smogon / meta-repo.
 */

import type { OakDb } from "@/data/db";
import { CHAMPIONS_FORMAT } from "@/data/formats";
import { getPokemon, spriteRefsByNames } from "@/data/repos/pokedex-repo";
import { listEntities } from "@/data/repos/resolve-index";
import { normalizeName } from "@/data/repos/normalize-name";
import {
  getUsage,
  listLeaderboard,
  USAGE_ATTRIBUTION,
  type LeaderboardRow,
  type UsageData,
} from "./usage-client";
import { toEntitySlug, type UsageLadder } from "./ladder";

export type UsageLeaderboardRow = {
  rank: number;
  name: string;
  slug: string;
  /** Present only when the live index actually published a percentage. */
  usage_pct?: number;
  sprite?: string;
};

export type UsageLeaderboardResponse =
  | {
      available: true;
      ladder: UsageLadder;
      season: string;
      fetched_at: number;
      attribution: string;
      rows: UsageLeaderboardRow[];
    }
  | {
      available: false;
      ladder: UsageLadder;
      error: "upstream_unavailable";
      rows: [];
    };

export type UsageSpeciesResponse =
  | ({
      available: true;
      found: true;
      slug: string;
      attribution: string;
    } & UsageData)
  | {
      available: true;
      found: false;
      suggestions: string[];
    }
  | {
      available: false;
      error: "upstream_unavailable";
    };

async function joinRoster(
  rows: LeaderboardRow[],
  db: OakDb,
): Promise<UsageLeaderboardRow[]> {
  const { matches } = await listEntities("pokemon", undefined, CHAMPIONS_FORMAT);
  const byKey = new Map<string, { slug: string; display_name: string }>();
  for (const m of matches) {
    byKey.set(m.slug, m);
    byKey.set(normalizeName(m.display_name), m);
    byKey.set(toEntitySlug(m.display_name), m);
  }

  const names = rows.map((r) => r.name);
  const sprites = await spriteRefsByNames(names, CHAMPIONS_FORMAT, db);

  const out: UsageLeaderboardRow[] = [];
  for (const row of rows) {
    const hit =
      byKey.get(toEntitySlug(row.name)) ??
      byKey.get(normalizeName(row.name));
    if (!hit) continue;
    const sprite =
      sprites.get(row.name)?.sprite_url ?? row.sprite ?? undefined;
    const joined: UsageLeaderboardRow = {
      rank: row.rank,
      name: row.name,
      slug: hit.slug,
    };
    if (typeof row.usage_pct === "number") joined.usage_pct = row.usage_pct;
    if (sprite) joined.sprite = sprite;
    out.push(joined);
  }
  return out;
}

export async function loadUsageLeaderboard(
  ladder: UsageLadder,
  db: OakDb,
): Promise<UsageLeaderboardResponse> {
  const unavailable: UsageLeaderboardResponse = {
    available: false,
    ladder,
    error: "upstream_unavailable",
    rows: [],
  };
  try {
    const board = await listLeaderboard(ladder);
    if (!board.available) return unavailable;
    const rows = await joinRoster(board.rows, db);
    return {
      available: true,
      ladder,
      season: board.season,
      fetched_at: board.fetched_at,
      attribution: USAGE_ATTRIBUTION,
      rows,
    };
  } catch {
    return unavailable;
  }
}

export async function loadUsageSpecies(
  slug: string,
  ladder: UsageLadder,
  db: OakDb,
): Promise<UsageSpeciesResponse> {
  try {
    const mon = await getPokemon(slug, CHAMPIONS_FORMAT, db);
    if (!mon.found) {
      return {
        available: true,
        found: false,
        suggestions: mon.suggestions ?? [],
      };
    }

    const result = await getUsage(mon.display_name, ladder);
    if (!result.found) {
      return {
        available: true,
        found: false,
        suggestions: result.suggestions,
      };
    }
    return {
      available: true,
      found: true,
      slug: toEntitySlug(slug) || slug,
      attribution: USAGE_ATTRIBUTION,
      ...result.data,
    };
  } catch {
    return { available: false, error: "upstream_unavailable" };
  }
}
