/**
 * Resolve a "common set" for a species from meta_usage or Champions live usage.
 */

import type { OakDb } from "@/data/db";
import type { Format } from "@/data/formats";
import type { TeamMember } from "@/data/teams/team-schema";
import { DEFAULT_META_FORMAT } from "@/data/meta-formats";
import {
  listMetaMonths,
  metaSpeciesDetail,
} from "@/data/repos/meta-repo";
import { movesForPokemon } from "@/data/repos/learnset-repo";
import { getPokemon } from "@/data/repos/pokedex-repo";
import { blankTeamMember } from "@/agent/teams-assistant/schemas";

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
  return nature.toLowerCase().replace(/\s+/g, "-");
}

/**
 * Build a TeamMember skeleton from Smogon gen9ou usage for the species.
 */
export async function setTemplateFromMeta(
  species: string,
  format: Format,
  db: OakDb,
): Promise<SetTemplateResult> {
  const months = await listMetaMonths(db, DEFAULT_META_FORMAT);
  if (months.length === 0) {
    return { found: false, notes: ["No meta months synced."] };
  }
  const month = months[0]!;
  const detail = await metaSpeciesDetail(
    db,
    DEFAULT_META_FORMAT,
    month,
    species,
  );
  if (!detail) {
    return { found: false, notes: [`No usage row for ${species}.`] };
  }

  const dataFormat: Format =
    format === "national-dex" ? "scarlet-violet" : format;
  const mon = await getPokemon(species, dataFormat, db);
  if (!mon.found) {
    return { found: false, notes: ["Species not in format roster."] };
  }

  const legalMoves = new Set(
    (await movesForPokemon(species, dataFormat, db)).map((m) => m.moveSlug),
  );
  const moves: string[] = [];
  const notes: string[] = [];
  for (const m of detail.moves) {
    if (moves.length >= 4) break;
    if (legalMoves.size > 0 && !legalMoves.has(m.slug)) {
      notes.push(`Skipped illegal move ${m.slug}`);
      continue;
    }
    moves.push(m.slug);
  }

  const abilities = [
    mon.abilities.slot1,
    mon.abilities.slot2,
    mon.abilities.hidden,
  ].filter((a): a is string => !!a);
  const topAbility = detail.abilities[0]?.slug ?? null;
  const ability =
    topAbility && abilities.includes(topAbility)
      ? topAbility
      : (abilities[0] ?? null);

  const topItem = detail.items[0]?.slug ?? null;
  const topSpread = detail.spreads[0];

  const member: TeamMember = {
    ...blankTeamMember(),
    species,
    ability,
    item: topItem,
    moves,
    nature: natureSlug(topSpread?.nature),
    evs: parseEvs(topSpread?.evs),
    level: 50,
  };

  return {
    found: true,
    member,
    attribution: `Smogon ${DEFAULT_META_FORMAT} ${month}`,
    month,
    notes: notes.length ? notes : undefined,
  };
}

/**
 * Entry: pick source by format.
 * Champions → not implemented here (route can call live usage); mainline → meta.
 */
export async function resolveSetTemplate(
  species: string,
  format: Format,
  db: OakDb,
): Promise<SetTemplateResult> {
  if (format === "champions") {
    return {
      found: false,
      notes: [
        "Champions common sets: ask the Teams Assistant (live get_usage_stats).",
      ],
    };
  }
  if (
    format !== "scarlet-violet" &&
    format !== "national-dex"
  ) {
    return {
      found: false,
      notes: ["Common sets from Smogon gen9ou are available for SV/NatDex only."],
    };
  }
  return setTemplateFromMeta(species, format, db);
}
