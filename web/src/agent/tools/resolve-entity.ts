/**
 * T1 — `resolve_entity` (tools.md T1).
 *
 * Thin wrapper over the in-memory fuzzy matcher (src/data/repos/resolve-index).
 * Returns ranked candidate matches; never throws — an empty/near-miss query
 * resolves to `{ matches: [] }` (the documented non-fatal failure mode).
 * Champions mode only: an empty result is additionally probed against the
 * mainline Gen 9 (scarlet-violet) index and flagged with `exists_in_standard`
 * — deliberately a boolean, not a second match list, so the model isn't
 * tempted to cite SV entities inside Champions scope.
 */

import type { ToolDef } from "@/agent/types";
import {
  resolveEntityInputSchema,
  toJsonSchema,
  type ResolveEntityOutput,
} from "@/agent/schemas";
import { resolveEntity } from "@/data/repos/resolve-index";
import { formatForMode, CHAMPIONS_FORMAT, STANDARD_FORMAT } from "@/data/formats";

const description =
  "Resolve a possibly-misspelled or ambiguous name to canonical Pokémon-data " +
  "entities. Use this when the user's wording for a Pokémon, move, ability, " +
  "type, or item might not exactly match a real name, or when a name is " +
  "ambiguous across forms. Returns ranked candidate matches with their " +
  "canonical slugs.";

export const resolveEntityTool: ToolDef = {
  name: "resolve_entity",
  description,
  inputSchema: toJsonSchema(resolveEntityInputSchema),
  async run(args, ctx): Promise<ResolveEntityOutput> {
    const parsed = resolveEntityInputSchema.safeParse(args);
    if (!parsed.success) {
      // Malformed args (the SDK normally validates first) — degrade to "no match"
      // rather than throwing, so the loop can ask the user to clarify (BR-9).
      return { matches: [] };
    }
    const { query, kind, limit } = parsed.data;
    const format = formatForMode(ctx.mode);
    const result = await resolveEntity(query, kind, limit, format);
    if (format === CHAMPIONS_FORMAT && result.matches.length === 0) {
      const std = await resolveEntity(query, kind, 1, STANDARD_FORMAT);
      return { matches: [], exists_in_standard: std.matches.length > 0 };
    }
    return result;
  },
};
