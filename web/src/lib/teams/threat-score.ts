/**
 * Pure meta-threat scoring against a draft team (no DB).
 *
 * Heuristic only: STAB type pressure + whether the team has a resist/immune
 * answer + rough speed comparison. Not a full matchup simulator.
 */

import {
  combineDefensive,
  defMultiplier,
  type DefensiveProfile,
} from "@/agent/formulas/type-chart";
import type { Format } from "@/data/formats";

import { applyDefensiveModifiers } from "./ability-matchups";
import type { TypeProfileLite } from "./analyze-core";
import type { ThreatRowWire } from "./team-analysis";

export interface ThreatMemberDefense {
  slug: string;
  types: string[];
  ability?: string | null;
  item?: string | null;
  /** Final computed Speed, if known. */
  speed?: number | null;
}

export interface ThreatCandidate {
  species: string;
  display_name: string;
  types: string[];
  usage_pct?: number;
  rank?: number;
  /** Estimated typical Speed (e.g. from meta spread or max Spe EV). */
  speed?: number | null;
}

export interface ScoreThreatsInput {
  members: ThreatMemberDefense[];
  candidates: ThreatCandidate[];
  typeProfiles: Map<string, TypeProfileLite>;
  format: Format;
  /** Cap how many threats to return (default 15). */
  limit?: number;
}

function memberProfile(
  m: ThreatMemberDefense,
  typeProfiles: Map<string, TypeProfileLite>,
): DefensiveProfile {
  const defs: DefensiveProfile[] = [];
  for (const t of m.types) {
    const p = typeProfiles.get(t);
    if (p) defs.push(p.defensive);
  }
  const combined = combineDefensive(defs);
  return applyDefensiveModifiers(combined, {
    ability: m.ability,
    item: m.item,
  }).profile;
}

/**
 * Score ladder candidates vs the draft. Returns answered / soft / unanswered.
 */
export function scoreThreats(input: ScoreThreatsInput): ThreatRowWire[] {
  const { members, candidates, typeProfiles } = input;
  const limit = input.limit ?? 15;
  if (members.length === 0 || candidates.length === 0) return [];

  const profiles = members.map((m) => ({
    slug: m.slug,
    profile: memberProfile(m, typeProfiles),
    speed: m.speed ?? null,
  }));

  const rows: ThreatRowWire[] = [];

  for (const c of candidates.slice(0, limit)) {
    const stabTypes = c.types.filter((t) => typeProfiles.has(t));
    const reasons: string[] = [];
    let weakCount = 0;
    let immuneOrResistBoth = 0;
    let answersSpeed = false;

    for (const md of profiles) {
      let weakToAny = false;
      let resistsAll = stabTypes.length > 0;
      for (const atk of stabTypes) {
        const mult = defMultiplier(md.profile, atk);
        if (mult > 1) {
          weakToAny = true;
          resistsAll = false;
        } else if (mult >= 1) {
          resistsAll = false;
        }
      }
      if (weakToAny) weakCount += 1;
      if (resistsAll && stabTypes.length > 0) immuneOrResistBoth += 1;

      if (
        c.speed != null &&
        md.speed != null &&
        md.speed > c.speed &&
        weakToAny === false
      ) {
        answersSpeed = true;
      }
    }

    if (weakCount >= 3) {
      reasons.push(`${weakCount} members weak to its STAB`);
    } else if (weakCount >= 1) {
      reasons.push(`${weakCount} member(s) weak to its STAB`);
    }

    if (immuneOrResistBoth >= 1) {
      reasons.push(
        `${immuneOrResistBoth} member(s) resist/immune its STABs`,
      );
    } else if (stabTypes.length > 0) {
      reasons.push("no clean STAB resist on the team");
    }

    if (c.speed != null) {
      const teamFaster = profiles.filter(
        (p) => p.speed != null && p.speed > (c.speed ?? 0),
      ).length;
      if (teamFaster === 0) {
        reasons.push("outspeeds the whole team (est.)");
      } else if (answersSpeed) {
        reasons.push("team has a faster answer");
      }
    }

    let status: ThreatRowWire["status"];
    if (immuneOrResistBoth >= 2 || (immuneOrResistBoth >= 1 && weakCount <= 1)) {
      status = "answered";
    } else if (immuneOrResistBoth >= 1 || weakCount <= 1) {
      status = "soft";
    } else {
      status = "unanswered";
    }

    if (reasons.length === 0) {
      reasons.push(
        status === "answered"
          ? "team handles its typing"
          : "limited answers on paper",
      );
    }

    rows.push({
      species: c.species,
      display_name: c.display_name,
      usage_pct: c.usage_pct,
      rank: c.rank,
      status,
      reasons,
    });
  }

  // Surface unanswered first, then soft, then answered; stable by rank.
  const order = { unanswered: 0, soft: 1, answered: 2 } as const;
  rows.sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      (a.rank ?? 999) - (b.rank ?? 999),
  );

  return rows;
}
