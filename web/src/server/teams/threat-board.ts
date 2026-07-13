/**
 * Attach a meta threat board (+ optional sample calcs) to a TeamAnalysisOk.
 * Fail-soft: missing meta / DB errors leave threats empty.
 */

import type { OakDb } from "@/data/db";
import type { Format } from "@/data/formats";
import type { TeamMember } from "@/data/teams/team-schema";
import { DEFAULT_META_FORMAT } from "@/data/meta-formats";
import {
  listMetaMonths,
  metaLeaderboard,
  metaSpeciesDetail,
} from "@/data/repos/meta-repo";
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

const THREAT_LIMIT = 15;
const CALC_THREAT_LIMIT = 8;

/** Formats that use gen9ou ladder snapshots for the threat board. */
function metaFormatForTeam(format: Format): typeof DEFAULT_META_FORMAT | null {
  if (format === "scarlet-violet" || format === "national-dex") {
    return DEFAULT_META_FORMAT;
  }
  return null;
}

/**
 * Parse a Smogon EV spread string like "0/252/4/0/0/252" → Spe EV (last).
 */
function speEvFromSpread(evs: string | undefined): number {
  if (!evs) return 0;
  const parts = evs.split("/").map((p) => Number(p.trim()));
  if (parts.length !== 6 || parts.some((n) => Number.isNaN(n))) return 0;
  return parts[5] ?? 0;
}

function natureBoostsSpe(nature: string | undefined): boolean {
  if (!nature) return false;
  const n = nature.toLowerCase();
  return ["jolly", "timid", "hasty", "naive"].includes(n);
}

export async function attachThreatBoard(
  analysis: TeamAnalysisOk,
  members: TeamMember[],
  format: Format,
  db: OakDb,
  typeProfiles: Map<string, TypeProfileLite>,
): Promise<TeamAnalysisOk> {
  const metaFormat = metaFormatForTeam(format);
  if (!metaFormat) {
    const note =
      format === "champions"
        ? "Meta threat board uses Smogon OU for SV/NatDex; for Champions, ask the assistant with live usage."
        : "No stored ladder snapshot for this format — threat board empty.";
    return {
      ...analysis,
      threats: [],
      meta_attribution: null,
      notes: [...analysis.notes, note],
    };
  }

  const months = await listMetaMonths(db, metaFormat);
  if (months.length === 0) {
    return {
      ...analysis,
      threats: [],
      meta_attribution: null,
      notes: [
        ...analysis.notes,
        "No Smogon usage months synced yet (run npm run sync:meta).",
      ],
    };
  }

  const month = months[0]!; // latest first per repo convention
  const board = await metaLeaderboard(db, metaFormat, month);
  const top = board.slice(0, THREAT_LIMIT);
  if (top.length === 0) {
    return { ...analysis, threats: [], meta_attribution: null };
  }

  const threatSlugs = top.map((r) => r.species);
  // Threats live on SV index for gen9ou.
  const threatFormat: Format =
    format === "national-dex" ? "scarlet-violet" : format;
  const threatRefs = await spriteRefsByNames(threatSlugs, threatFormat, db);

  // Build defense-side members from analysis + draft abilities.
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

  const candidates = top.map((row) => {
    const ref = threatRefs.get(row.species);
    return {
      species: row.species,
      display_name: row.display_name,
      types: ref?.types ?? [],
      usage_pct: row.usage_pct,
      rank: row.rank,
      speed: null as number | null,
    };
  });

  // Enrich speeds from top spreads where possible.
  for (const c of candidates) {
    try {
      const detail = await metaSpeciesDetail(
        db,
        metaFormat,
        month,
        c.species,
      );
      if (!detail || !c.types.length) continue;
      const topSpread = detail.spreads[0];
      const ref = threatRefs.get(c.species);
      if (ref && topSpread) {
        const speEv = speEvFromSpread(topSpread.evs);
        const nature = topSpread.nature?.toLowerCase() ?? null;
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
            nature: natureBoostsSpe(nature ?? undefined)
              ? nature
              : nature,
            level: 50,
          },
          ref.base_stats,
          "scarlet-violet",
        );
        const spe = stats.find((s) => s.key === "spe")?.value ?? null;
        c.speed = spe;
      }
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

  // Sample calcs for worst threats.
  threats = await enrichCalcs(
    threats,
    members,
    analysis,
    threatRefs,
    typeProfiles,
    metaFormat,
    month,
    db,
    threatFormat,
  );

  return {
    ...analysis,
    threats,
    meta_attribution: `Smogon ${metaFormat} ${month}`,
  };
}

async function enrichCalcs(
  threats: ThreatRowWire[],
  members: TeamMember[],
  analysis: TeamAnalysisOk,
  threatRefs: Map<string, Awaited<ReturnType<typeof spriteRefsByNames>> extends Map<string, infer V> ? V : never>,
  typeProfiles: Map<string, TypeProfileLite>,
  metaFormat: typeof DEFAULT_META_FORMAT,
  month: string,
  db: OakDb,
  threatFormat: Format,
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
      const detail = await metaSpeciesDetail(
        db,
        metaFormat,
        month,
        threat.species,
      );
      const topMove = detail?.moves?.[0];
      const threatRef = threatRefs.get(threat.species);
      if (!topMove || !threatRef) {
        out.push(threat);
        continue;
      }
      const moveMap = await moveSummaries([topMove.slug], threatFormat, db);
      const move = moveMap.get(topMove.slug);
      if (!move || !move.power || move.power <= 0) {
        out.push(threat);
        continue;
      }

      const isPhysical = move.damageClass === "physical";
      // Threat attack: assume 252 in attacking stat, neutral nature, lv50.
      const threatAtkStats = computeMemberStats(
        {
          evs: {
            hp: 0,
            atk: isPhysical ? 252 : 0,
            def: 0,
            spa: isPhysical ? 0 : 252,
            spd: 0,
            spe: 0,
          },
          nature: null,
          level: 50,
        },
        threatRef.base_stats,
        "scarlet-violet",
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

        // Type effectiveness of move type vs member types.
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
          moveSlug: topMove.slug,
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
