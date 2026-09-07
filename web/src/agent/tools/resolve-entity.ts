/**
 * T1 — `resolve_entity` (tools.md T1).
 *
 * Thin wrapper over the in-memory fuzzy matcher (src/data/repos/resolve-index).
 * Returns ranked candidate matches; never throws — an empty/near-miss query
 * resolves to `{ matches: [] }` (the documented non-fatal failure mode).
 * Off-roster names are a plain empty match list (ADR-8, CF-DATA-BR-5) — no
 * `exists_in_standard` / other-game probe.
 */

import type { ToolDef } from "@/agent/types";
import {
  resolveEntityInputSchema,
  toJsonSchema,
  type ResolveEntityOutput,
} from "@/agent/schemas";
import { resolveEntity } from "@/data/repos/resolve-index";
import { formatForMode } from "@/data/formats";

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
    return resolveEntity(query, kind, limit, format);
  },
};
