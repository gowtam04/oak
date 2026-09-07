/**
 * Resolve a live Champions usage set into a TeamMember (CF-TEAM-US-6, ADR-5, ADR-7).
 *
 * Always Doubles (the official default). Missing fields stay empty with notes —
 * never invented from another game. `tera_type: null`, `level: 50`, Stat Points
 * in `evs`. found:false if usage is down or no set is listed.
 */

import type { OakDb } from "@/data/db";
import { CHAMPIONS_FORMAT } from "@/data/formats";
import type { TeamMember } from "@/data/teams/team-schema";
import { movesForPokemon } from "@/data/repos/learnset-repo";
import { getPokemon } from "@/data/repos/pokedex-repo";
import { blankTeamMember } from "@/agent/teams-assistant/schemas";
import {
  getUsage,
  USAGE_ATTRIBUTION,
  type UsageData,
} from "@/server/champions-usage/usage-client";
import { toEntitySlug } from "@/server/champions-usage/ladder";

export interface SetTemplateResult {
  found: boolean;
  member?: TeamMember;
  attribution?: string;
  month?: string;
  notes?: string[];
}

function parseEvs(evs: string | undefined): TeamMember["evs"] {
  const zero = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  if (!evs) return zero;
  const parts = evs.split("/").map((p) => Number(p.trim()));
  if (parts.length !== 6 || parts.some((n) => Number.isNaN(n))) return zero;
  return {
    hp: parts[0] ?? 0,
    atk: parts[1] ?? 0,
    def: parts[2] ?? 0,
    spa: parts[3] ?? 0,
    spd: parts[4] ?? 0,
    spe: parts[5] ?? 0,
  };
}

function natureSlug(nature: string | undefined): string | null {
  if (!nature) return null;
  return toEntitySlug(nature);
}

function mapUsageMember(
  speciesSlug: string,
  data: UsageData,
  legalMoves: Set<string>,
  abilitySlugs: string[],
): { member: TeamMember; notes: string[] } {
  const notes: string[] = [];
  const moves: string[] = [];
  for (const m of data.moves) {
    if (moves.length >= 4) break;
    const slug = toEntitySlug(m.name);
    if (!slug) continue;
    if (legalMoves.size > 0 && !legalMoves.has(slug)) {
      notes.push(`Skipped ${m.name} — not in the Champions learnset.`);
      continue;
    }
    moves.push(slug);
  }
  if (moves.length < 4) {
    notes.push(
      "Fewer than four moves listed in live usage; remaining moves left empty.",
    );
  }

  const topAbilityName = data.abilities[0]?.name;
  const topAbility = topAbilityName ? toEntitySlug(topAbilityName) : null;
  const ability =
    topAbility && abilitySlugs.includes(topAbility) ? topAbility : null;
  if (topAbilityName && !ability) {
    notes.push(`Skipped ability ${topAbilityName} — not legal on this species.`);
  } else if (!ability) {
    notes.push("No ability listed in live usage; left empty.");
  }

  const topItemName = data.items[0]?.name;
  const item = topItemName ? toEntitySlug(topItemName) : null;
  if (!item) {
    notes.push("No item listed in live usage; left empty.");
  }

  const member: TeamMember = {
    ...blankTeamMember(),
    species: speciesSlug,
    ability,
    item,
    moves,
    nature: natureSlug(data.natures[0]?.name),
    evs: parseEvs(data.spreads[0]?.name),
    tera_type: null,
    level: 50,
  };
  return { member, notes };
}

/**
 * Live Champions Doubles usage → TeamMember. Format is not a picker.
 */
export async function resolveSetTemplate(
  species: string,
  db: OakDb,
): Promise<SetTemplateResult> {
  const slug = toEntitySlug(species);
  try {
    const result = await getUsage(species, "doubles");
    if (!result.found) {
      return { found: false };
    }

    const mon = await getPokemon(slug, CHAMPIONS_FORMAT, db);
    if (!mon.found) {
      return {
        found: false,
        notes: [`${species} is not in the Champions roster.`],
      };
    }

    const legalMoves = new Set(
      (await movesForPokemon(slug, CHAMPIONS_FORMAT, db)).map((m) => m.moveSlug),
    );
    const abilitySlugs = [
      mon.abilities.slot1,
      mon.abilities.slot2,
      mon.abilities.hidden,
    ].filter((a): a is string => !!a);

    const { member, notes } = mapUsageMember(
      slug,
      result.data,
      legalMoves,
      abilitySlugs,
    );
    return {
      found: true,
      member,
      attribution: USAGE_ATTRIBUTION,
      notes: notes.length ? notes : undefined,
    };
  } catch {
    return {
      found: false,
      notes: ["Live Champions usage is unavailable."],
    };
  }
}
