/**
 * analyze-team — the team-analysis SERVICE (mirrors validate-team.ts's shape).
 *
 * `analyzeTeamForFormat(members, format, db)` resolves a draft team's species,
 * moves, and the format's type chart with BATCHED reads only, then hands the
 * resolved data to the pure `analyzeTeam` core (`@/lib/teams/analyze-core`) which
 * does all the type math. Three reads, each batched:
 *   - `spriteRefsByNames` — species typing + base stats + display name (1 query);
 *   - `moveSummaries`     — each move's type + damage class (1 query);
 *   - `allTypeProfiles`   — the format's type chart, offensive + defensive (1 query).
 *
 * Like validate-team.ts it is a SERVICE, not a repo, and it NEVER throws in-domain:
 * an unresolved species degrades per-member (`found: false`), and a genuine
 * index/DB fault (or a format whose type chart isn't built) degrades to
 * `{ status: "unavailable" }`. `@/data/schema`/repos are import-safe (only
 * `@/data/db` is `server-only`); `OakDb` is imported type-only.
 */

import type { OakDb } from "@/data/db";
import type { Format } from "@/data/formats";
import type { TeamMember } from "@/data/teams/team-schema";
import { spriteRefsByNames } from "@/data/repos/pokedex-repo";
import { moveSummaries, allTypeProfiles } from "@/data/repos/reference-cache";
import {
  analyzeTeam,
  type AnalysisMemberSource,
  type TypeProfileLite,
} from "@/lib/teams/analyze-core";
import type { TeamAnalysisResponse } from "@/lib/teams/team-analysis";

/**
 * Analyze `members` against the active `format`. Never throws; returns a valid
 * `TeamAnalysisResponse` envelope. When the format's type chart is unreadable /
 * unbuilt, returns `{ status: "unavailable" }` (mirrors the entity route).
 */
export async function analyzeTeamForFormat(
  members: TeamMember[],
  format: Format,
  db: OakDb,
): Promise<TeamAnalysisResponse> {
  try {
    // Batch 1 — species refs (typing + base stats + display name), one query.
    const speciesSlugs = members
      .map((m) => m.species)
      .filter((s): s is string => s !== null && s.length > 0);
    const refs = await spriteRefsByNames(speciesSlugs, format, db);

    // Batch 2 — move summaries (type + damage class) over the union of moves.
    const moveSlugs = [...new Set(members.flatMap((m) => m.moves))];
    const summaries = await moveSummaries(moveSlugs, format, db);

    // Batch 3 — the format's type chart (offensive + defensive), one query.
    const typeRecords = await allTypeProfiles(format, db);

    // No type chart ⇒ the format's index isn't built/readable → honest failure.
    if (typeRecords.size === 0) {
      return { status: "unavailable", format };
    }

    const typeProfiles = new Map<string, TypeProfileLite>();
    for (const [slug, rec] of typeRecords) {
      typeProfiles.set(slug, {
        defensive: rec.defensive,
        offensive: rec.offensive ?? {
          super_effective_against: [],
          not_very_effective_against: [],
          no_effect_against: [],
        },
      });
    }

    const sources: AnalysisMemberSource[] = members.map((m) => ({
      input: { evs: m.evs, nature: m.nature, level: m.level },
      slug: m.species ?? "",
      ref: (m.species && refs.get(m.species)) || null,
      moves: m.moves.map((slug) => {
        const summary = summaries.get(slug);
        return {
          slug,
          type: summary?.type ?? "",
          damageClass: summary?.damageClass ?? null,
        };
      }),
    }));

    return analyzeTeam(sources, typeProfiles, format);
  } catch {
    // Transport/DB fault — degrade to an honest "couldn't analyze" envelope
    // rather than throwing out of the route (mirrors validate-team's policy).
    return { status: "unavailable", format };
  }
}
