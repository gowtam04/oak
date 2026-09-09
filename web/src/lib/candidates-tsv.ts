/**
 * Visible candidate rows → tab-separated values (TBL-US-4).
 *
 * The caller passes the already-visible set (after sort / filter /
 * in-table pin). Hidden remainder is never included (TBL-BR-1).
 * Empty input → empty string (TBL-AC-4.4).
 */

import type { Candidates } from "@/agent/schemas";

export type CandidateRow = Candidates["shown"][number];

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

function humanize(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w.length === 0 ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}

function statHeader(key: string): string {
  if (key === "hp") return "HP";
  return humanize(key);
}

function collectKeyStatKeys(rows: CandidateRow[]): string[] {
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

/** Spreadsheet paste of the currently visible candidate table. */
export function candidatesToTsv(rows: CandidateRow[]): string {
  if (rows.length === 0) return "";

  const hasBase = rows.some((row) => row.base_stats != null);
  const keyStatKeys = collectKeyStatKeys(rows);
  const hasKeyStats = !hasBase && keyStatKeys.length > 0;
  const hasAbility = rows.some((row) => row.ability != null && row.ability !== "");

  const headers = ["Name", "Types"];
  if (hasBase) {
    headers.push(...STAT_ORDER.map((k) => STAT_LABELS[k]));
  } else if (hasKeyStats) {
    headers.push(...keyStatKeys.map(statHeader));
  }
  if (hasAbility) headers.push("Ability");

  const body = rows.map((row) => {
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
    if (hasAbility) cells.push(row.ability ?? "");
    return cells.join("\t");
  });

  return [headers.join("\t"), ...body].join("\n");
}
