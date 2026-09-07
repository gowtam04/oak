/**
 * Attach a live Champions Doubles threat board (+ optional sample calcs)
 * to a TeamAnalysisOk. Fail-soft: usage down / throws → empty threats + note.
 * Never Smogon / meta-repo (CF-TEAM-US-4, CF-INT-BR-4–7, ADR-5).
 */

import type { OakDb } from "@/data/db";
import { CHAMPIONS_FORMAT, type Format } from "@/data/formats";
import type { TeamMember } from "@/data/teams/team-schema";
import { spriteRefsByNames } from "@/data/repos/pokedex-repo";
import { moveSummaries } from "@/data/repos/reference-cache";
import { defMultiplier, combineDefensive } from "@/agent/formulas/type-chart";
import type { DefensiveProfile } from "@/agent/formulas/type-chart";

import type { TypeProfileLite } from "@/lib/teams/analyze-core";
import { applyDefensiveModifiers } from "@/lib/teams/ability-matchups";
import { computeMemberStats } from "@/lib/teams/member-stats";
import { scoreThreats } from "@/lib/teams/threat-score";
import { sampleThreatCalc } from "@/lib/teams/threat-calcs";
import type { TeamAnalysisOk, ThreatRowWire } from "@/lib/teams/team-analysis";
import {
  getUsage,
  listLeaderboard,
  USAGE_ATTRIBUTION,
} from "@/server/champions-usage/usage-client";
import { toEntitySlug } from "@/server/champions-usage/ladder";

const THREAT_LIMIT = 15;
const CALC_THREAT_LIMIT = 8;
const UNAVAILABLE_NOTE = "Live Champions usage is unavailable.";

function speEvFromSpread(evs: string | undefined): number {
  if (!evs) return 0;
  const parts = evs.split("/").map((p) => Number(p.trim()));
  if (parts.length !== 6 || parts.some((n) => Number.isNaN(n))) return 0;
  return parts[5] ?? 0;
}

function failSoft(analysis: TeamAnalysisOk): TeamAnalysisOk {
  return {
    ...analysis,
    threats: [],
    meta_attribution: null,
    notes: [...analysis.notes, UNAVAILABLE_NOTE],
  };
}

export async function attachThreatBoard(
  analysis: TeamAnalysisOk,
  members: TeamMember[],
  format: Format,
  db: OakDb,
  typeProfiles: Map<string, TypeProfileLite>,
): Promise<TeamAnalysisOk> {
  if (format !== CHAMPIONS_FORMAT) {
    return {
      ...analysis,
      threats: [],
      meta_attribution: null,
      notes: [
        ...analysis.notes,
        "Threat board uses live Champions Doubles usage.",
      ],
    };
  }

  let board: Awaited<ReturnType<typeof listLeaderboard>>;
  try {
    board = await listLeaderboard("doubles");
  } catch {
    return failSoft(analysis);
  }
  if (!board.available) return failSoft(analysis);

  const top = board.rows.slice(0, THREAT_LIMIT);
  if (top.length === 0) {
    return { ...analysis, threats: [], meta_attribution: null };
  }

  const names = top.map((r) => r.name);
  const threatRefs = await spriteRefsByNames(names, CHAMPIONS_FORMAT, db);

  const foundMembers = analysis.members.filter(
    (m): m is Extract<typeof m, { found: true }> => m.found,
  );
  const defenseMembers = foundMembers.map((m) => {
    const draft = members.find((d) => d.species === m.slug);
    return {
      slug: m.slug,
      types: m.types,
      ability: draft?.ability ?? null,
      item: draft?.item ?? null,
      speed: m.stats.spe,
    };
  });

  const candidates = top.flatMap((row) => {
    const ref = threatRefs.get(row.name);
    if (!ref) return [];
    return [
      {
        species: toEntitySlug(row.name),
        display_name: ref.display_name,
        types: ref.types,
        usage_pct: row.usage_pct,
        rank: row.rank,
        speed: null as number | null,
        lookupName: row.name,
      },
    ];
  });

  for (const c of candidates) {
    try {
      const usage = await getUsage(c.lookupName, "doubles");
      if (!usage?.found || !c.types.length) continue;
      const topSpread = usage.data.spreads[0];
      const ref = threatRefs.get(c.lookupName);
      if (!ref || !topSpread) continue;
      const speEv = speEvFromSpread(topSpread.name);
      const nature = usage.data.natures[0]?.name
        ? toEntitySlug(usage.data.natures[0].name)
        : null;
      const stats = computeMemberStats(
        {
          evs: {
            hp: 0,
            atk: 0,
            def: 0,
            spa: 0,
            spd: 0,
            spe: speEv,
          },
          nature,
          level: 50,
        },
        ref.base_stats,
        CHAMPIONS_FORMAT,
      );
      c.speed = stats.find((s) => s.key === "spe")?.value ?? null;
    } catch {
      // skip speed enrich
    }
  }

  let threats = scoreThreats({
    members: defenseMembers,
    candidates,
    typeProfiles,
    format,
    limit: THREAT_LIMIT,
  });

  threats = await enrichCalcs(
    threats,
    members,
    analysis,
    threatRefs,
    typeProfiles,
    db,
  );

  return {
    ...analysis,
    threats,
    meta_attribution: USAGE_ATTRIBUTION,
  };
}

async function enrichCalcs(
  threats: ThreatRowWire[],
  members: TeamMember[],
  analysis: TeamAnalysisOk,
  threatRefs: Map<
    string,
    Awaited<ReturnType<typeof spriteRefsByNames>> extends Map<string, infer V>
      ? V
      : never
  >,
  typeProfiles: Map<string, TypeProfileLite>,
  db: OakDb,
): Promise<ThreatRowWire[]> {
  const targets = threats
    .filter((t) => t.status === "unanswered" || t.status === "soft")
    .slice(0, CALC_THREAT_LIMIT);

  const found = analysis.members.filter(
    (m): m is Extract<typeof m, { found: true }> => m.found,
  );
  if (found.length === 0 || targets.length === 0) return threats;

  const out: ThreatRowWire[] = [];
  for (const threat of threats) {
    if (!targets.some((t) => t.species === threat.species)) {
      out.push(threat);
      continue;
    }
    try {
      const usage = await getUsage(threat.display_name, "doubles");
      const topMoveName = usage?.found ? usage.data.moves[0]?.name : undefined;
      const threatRef =
        threatRefs.get(threat.display_name) ?? threatRefs.get(threat.species);
      if (!topMoveName || !threatRef) {
        out.push(threat);
        continue;
      }
      const topMoveSlug = toEntitySlug(topMoveName);
      const moveMap = await moveSummaries([topMoveSlug], CHAMPIONS_FORMAT, db);
      const move = moveMap.get(topMoveSlug);
      if (!move || !move.power || move.power <= 0) {
        out.push(threat);
        continue;
      }

      const isPhysical = move.damageClass === "physical";
      const threatAtkStats = computeMemberStats(
        {
          evs: {
            hp: 0,
            atk: isPhysical ? 32 : 0,
            def: 0,
            spa: isPhysical ? 0 : 32,
            spd: 0,
            spe: 0,
          },
          nature: null,
          level: 50,
        },
        threatRef.base_stats,
        CHAMPIONS_FORMAT,
      );
      const attackStat =
        threatAtkStats.find((s) => s.key === (isPhysical ? "atk" : "spa"))
          ?.value ?? 100;

      const calcs = [];
      for (const m of found.slice(0, 4)) {
        const draft = members.find((d) => d.species === m.slug);
        const defStat = isPhysical ? m.stats.def : m.stats.spd;
        const hp = m.stats.hp;
        if (defStat == null || hp == null) continue;

        const defs: DefensiveProfile[] = [];
        for (const t of m.types) {
          const p = typeProfiles.get(t);
          if (p) defs.push(p.defensive);
        }
        let profile = combineDefensive(defs);
        profile = applyDefensiveModifiers(profile, {
          ability: draft?.ability,
          item: draft?.item,
        }).profile;
        const te = defMultiplier(profile, move.type ?? "");
        const stab = threatRef.types.includes(move.type ?? "");

        const line = sampleThreatCalc({
          attackerSlug: threat.species,
          defenderSlug: m.slug,
          moveSlug: topMoveSlug,
          power: move.power,
          attackStat,
          defenseStat: defStat,
          defenderMaxHp: hp,
          stab,
          typeEffectiveness: te === 0 ? 0 : te,
        });
        if (line) calcs.push(line);
      }
      out.push({ ...threat, sample_calcs: calcs });
    } catch {
      out.push(threat);
    }
  }
  return out;
}
