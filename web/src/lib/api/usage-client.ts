/**
 * usage-client — typed `fetch` over `GET /api/usage/:slug` for the artifact
 * viewer Usage tab. Mirrors entity-client: it NEVER throws. Transport faults,
 * non-2xx, and bodies that fail the envelope all fold to `{ available: false }`.
 */

import { z } from "zod";

export type UsageLadder = "doubles" | "singles";

const usageEntrySchema = z.object({
  name: z.string(),
  pct: z.number().nullable().optional(),
  rank: z.number().optional(),
});

export type UsageClientEntry = z.infer<typeof usageEntrySchema>;

const foundSchema = z.object({
  available: z.literal(true),
  found: z.literal(true),
  slug: z.string(),
  attribution: z.string().optional().default(""),
  saved_name: z.string(),
  format: z.string().optional(),
  season: z.string().optional(),
  fetched_at: z.number().optional(),
  moves: z.array(usageEntrySchema).default([]),
  items: z.array(usageEntrySchema).default([]),
  abilities: z.array(usageEntrySchema).default([]),
  natures: z.array(usageEntrySchema).default([]),
  spreads: z.array(usageEntrySchema).default([]),
  teammates: z.array(usageEntrySchema).default([]),
  source_url: z.string().optional(),
});

const notFoundSchema = z.object({
  available: z.literal(true),
  found: z.literal(false),
  suggestions: z.array(z.string()).default([]),
});

const unavailableSchema = z.object({
  available: z.literal(false),
  error: z.string().optional(),
});

export const usageSpeciesResponseSchema = z.union([
  foundSchema,
  notFoundSchema,
  unavailableSchema,
]);

export type UsageSpeciesClientResponse = z.infer<
  typeof usageSpeciesResponseSchema
>;

export const USAGE_UNAVAILABLE_COPY =
  "Live Champions usage is unavailable right now. Chat, Dex, Teams, and Calc still work — try this page again in a bit.";

const UNAVAILABLE: UsageSpeciesClientResponse = {
  available: false,
  error: "upstream_unavailable",
};

/**
 * Fetch the live Champions usage drill-in for `slug`. Doubles is the default
 * ladder. Never throws.
 */
export async function fetchUsageSpecies(
  slug: string,
  ladder: UsageLadder = "doubles",
): Promise<UsageSpeciesClientResponse> {
  const trimmed = slug.trim();
  if (!trimmed) return UNAVAILABLE;
  try {
    const params = new URLSearchParams({ ladder });
    const res = await fetch(
      `/api/usage/${encodeURIComponent(trimmed)}?${params.toString()}`,
      { method: "GET", credentials: "same-origin" },
    );
    if (!res.ok) return UNAVAILABLE;
    const data: unknown = await res.json();
    const parsed = usageSpeciesResponseSchema.safeParse(data);
    return parsed.success ? parsed.data : UNAVAILABLE;
  } catch {
    return UNAVAILABLE;
  }
}

/** Representative Showdown paste from the top listed shares (same as `/usage/[slug]`). */
export function usageShowdownExport(
  displayName: string,
  data: {
    items: readonly { name: string }[];
    abilities: readonly { name: string }[];
    natures: readonly { name: string }[];
    spreads: readonly { name: string }[];
    moves: readonly { name: string }[];
  },
): string {
  const item = data.items[0]?.name;
  const lines: string[] = [item ? `${displayName} @ ${item}` : displayName];
  const ability = data.abilities[0]?.name;
  if (ability) lines.push(`Ability: ${ability}`);
  const spread = data.spreads[0]?.name;
  if (spread) lines.push(`EVs: ${spread}`);
  const nature = data.natures[0]?.name;
  if (nature) lines.push(`${nature} Nature`);
  for (const move of data.moves.slice(0, 4)) {
    lines.push(`- ${move.name}`);
  }
  return lines.join("\n");
}
