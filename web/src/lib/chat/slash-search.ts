/**
 * Slash-discovery web search helper — fan-out `searchEntities` + merge.
 * Debounce lives in Composer, not here. Never throws.
 */

import { CHAMPIONS_FORMAT } from "@/data/formats";
import { searchEntities, type SearchMatch } from "@/lib/api/search-client";

import { mergeDexNameRows, type DexNameRow } from "./slash-picker";

const DEX_KINDS: DexNameRow["kind"][] = ["pokemon", "move", "ability", "item"];

function toRow(match: SearchMatch): DexNameRow | null {
  if (
    match.kind !== "pokemon" &&
    match.kind !== "move" &&
    match.kind !== "ability" &&
    match.kind !== "item"
  ) {
    return null;
  }
  const row: DexNameRow = {
    slug: match.slug,
    displayName: match.display_name,
    kind: match.kind,
  };
  if (match.sprite_url) row.spriteUrl = match.sprite_url;
  return row;
}

function rowsFromMatches(matches: SearchMatch[]): DexNameRow[] {
  const rows: DexNameRow[] = [];
  for (const match of matches.slice(0, 8)) {
    const row = toRow(match);
    if (row) rows.push(row);
  }
  return rows;
}

async function searchKind(
  kind: DexNameRow["kind"],
  query: string,
): Promise<DexNameRow[]> {
  try {
    const matches = await searchEntities(kind, query, CHAMPIONS_FORMAT);
    return rowsFromMatches(matches);
  } catch {
    return [];
  }
}

export async function searchSlashDex(
  query: string,
  signal?: AbortSignal,
): Promise<DexNameRow[]> {
  if (signal?.aborted) return [];
  const byKind = await Promise.all(
    DEX_KINDS.map(async (kind) => ({
      kind,
      matches: await searchKind(kind, query),
    })),
  );
  if (signal?.aborted) return [];
  return mergeDexNameRows(byKind, 8);
}

export async function searchSlashUsage(
  query: string,
  signal?: AbortSignal,
): Promise<DexNameRow[]> {
  if (signal?.aborted) return [];
  return searchKind("pokemon", query);
}
