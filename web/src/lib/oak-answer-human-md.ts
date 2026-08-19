/**
 * Distill a finalized `OakAnswer` into human-readable markdown for Discord /
 * Notes / Reddit ("Copy as human text" — COPY-US-1 / ADR-9).
 *
 * Pure: no DOM, no clipboard, no mutation. The UI layer copies the returned
 * string. Distinct from `oakAnswerToAgentMarkdown`.
 */

import type { OakAnswer } from "@/agent/schemas";
import { labelForUncertaintyFlag } from "@/components/answer-card/uncertainty-labels";
import { stripHtmlComments } from "@/lib/strip-html-comments";
import {
  serializeShowdown,
  type ShowdownSet,
} from "@/data/pkmn/team-paste";
import type { TeamMember } from "@/data/teams/team-schema";

/** Fixed display order for the six base stats (HP, Attack, Defense, SpA, SpD, Speed). */
const STAT_ORDER = [
  "hp",
  "attack",
  "defense",
  "special_attack",
  "special_defense",
  "speed",
] as const;

const STAT_LABELS: Record<(typeof STAT_ORDER)[number], string> = {
  hp: "HP",
  attack: "Attack",
  defense: "Defense",
  special_attack: "SpA",
  special_defense: "SpD",
  speed: "Speed",
};

/**
 * Render a Discord/Notes-friendly paste of an OakAnswer.
 * Prose + optional fact table + user-facing caveats + Showdown paste.
 * Omits agent headings, citations, reasoning, and internal field names.
 */
export function oakAnswerToHumanMarkdown(answer: OakAnswer): string {
  const sections: string[] = [];

  const prose = stripHtmlComments(answer.answer_markdown).trim();
  if (prose) sections.push(prose);

  const table = formatCandidateTable(answer);
  if (table) sections.push(table);

  const caveats = formatCaveats(answer);
  if (caveats) sections.push(caveats);

  const paste = formatProposedTeam(answer);
  if (paste) sections.push(paste);

  return sections.join("\n\n");
}

function formatCandidateTable(answer: OakAnswer): string | null {
  const shown = answer.candidates?.shown;
  if (!shown || shown.length === 0) return null;

  const hasBase = shown.some((row) => row.base_stats != null);
  const keyStatKeys = collectKeyStatKeys(shown);
  const hasKeyStats = !hasBase && keyStatKeys.length > 0;

  const headers = ["Name", "Types"];
  if (hasBase) {
    headers.push(...STAT_ORDER.map((k) => STAT_LABELS[k]));
  } else if (hasKeyStats) {
    headers.push(...keyStatKeys.map(statHeader));
  }

  const body = shown.map((row) => {
    const cells = [row.name, row.types.join("/")];
    if (hasBase) {
      for (const k of STAT_ORDER) {
        cells.push(row.base_stats != null ? String(row.base_stats[k]) : "");
      }
    } else if (hasKeyStats) {
      for (const key of keyStatKeys) {
        const value = row.key_stats?.[key];
        cells.push(value == null ? "" : String(value));
      }
    }
    return cells;
  });
  return toGfm(headers, body);
}

function collectKeyStatKeys(
  rows: NonNullable<OakAnswer["candidates"]>["shown"],
): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.key_stats) continue;
    for (const key of Object.keys(row.key_stats)) {
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

function formatCaveats(answer: OakAnswer): string | null {
  const lines: string[] = [];
  const basis = answer.generation_basis;
  if (basis.fallback) {
    lines.push(
      basis.note ??
        `Based on ${basis.generation} data — this Pokémon is not in Gen 9.`,
    );
  }
  for (const flag of answer.uncertainty_flags ?? []) {
    lines.push(labelForUncertaintyFlag(flag));
  }
  if (lines.length === 0) return null;
  return lines.join("\n");
}

function formatProposedTeam(answer: OakAnswer): string | null {
  const team = answer.proposed_team;
  if (!team) return null;

  const sets: ShowdownSet[] = [];
  for (const member of team.members) {
    const set = memberToSet(member);
    if (set) sets.push(set);
  }
  const paste = serializeShowdown(sets);
  if (!team.name && !paste) return null;
  if (!paste) return team.name;
  if (!team.name) return paste;
  return `${team.name}\n\n${paste}`;
}

/** Map a TeamMember (slugs) to a Showdown set. Display names are humanized slugs. */
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

function toGfm(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`);
  return [head, sep, ...body].join("\n");
}

function statHeader(key: string): string {
  if (key === "hp") return "HP";
  return humanize(key);
}

function humanize(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}
