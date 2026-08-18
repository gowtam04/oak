/**
 * One-tap Showdown paste for a proposed team (ADR-10, PASTE-BR-2).
 *
 * Same dialect as `serializeShowdown` / the human-md Showdown section.
 * Copies only the paste — not the full human markdown (PASTE-AC-1.1).
 * Not a save (PASTE-BR-1).
 */

import type { ProposedTeam } from "@/agent/schemas";
import type { TeamMember } from "@/data/teams/team-schema";
import {
  serializeShowdown,
  type ShowdownSet,
} from "@/data/pkmn/team-paste";

function humanize(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w.length === 0 ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Same mapping `oak-answer-human-md.ts` uses for the Showdown section. */
function memberToSet(member: TeamMember): ShowdownSet | null {
  if (!member.species) return null;
  const set: ShowdownSet = {
    name: member.nickname ?? "",
    species: humanize(member.species),
    item: member.item ? humanize(member.item) : "",
    ability: member.ability ? humanize(member.ability) : "",
    moves: member.moves.map(humanize),
    nature: member.nature ? humanize(member.nature) : "",
    gender: member.gender ?? "",
    evs: { ...member.evs },
    ivs: { ...member.ivs },
    level: member.level,
  };
  if (member.tera_type) set.teraType = humanize(member.tera_type);
  if (member.shiny) set.shiny = true;
  return set;
}

/** Serialize a proposed team to Showdown paste text. Does not mutate `team`. */
export function proposedTeamToShowdownPaste(team: ProposedTeam): string {
  const sets: ShowdownSet[] = [];
  for (const member of team.members) {
    const set = memberToSet(member);
    if (set) sets.push(set);
  }
  return serializeShowdown(sets);
}
