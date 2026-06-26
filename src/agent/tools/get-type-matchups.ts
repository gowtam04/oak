/**
 * T6 — `get_type_matchups` (tools.md T6).
 *
 * One type  -> return its full offensive + defensive profile straight from the
 *              read-through reference cache (DS-4).
 * Two types -> fetch each type's single-type profile and compute the COMBINED
 *              DEFENSIVE profile (the product of both types' multipliers).
 *
 * Immunities are 0× and MUST be reported under `immune_to`, never as a resist
 * (BR-5). A combined multiplier of exactly 0 -> immune_to; >1 -> weak_to;
 * 0 < m < 1 -> resists; 1 -> neutral (omitted). The combined result carries no
 * `offensive` block (a two-type request is defensive only).
 *
 * Misses / upstream failures pass straight through:
 *   - { found: false, suggestions: [...] }   (unknown type)
 *   - { error: "upstream_unavailable" }
 */

import type { ToolDef } from "@/agent/types";
import {
  getTypeMatchupsInputSchema,
  toJsonSchema,
  TYPE_NAMES,
  type GetTypeMatchupsOutput,
  type TypeMatchupsDetail,
} from "@/agent/schemas";
import { getReference } from "@/data/repos/reference-cache";
import { formatForMode } from "@/data/formats";

const description =
  "Get type effectiveness relationships using the latest type chart. Pass one " +
  "type for its offensive and defensive profile, or two types for a combined " +
  "defensive profile (the product of both types' weaknesses/resistances/" +
  "immunities). Use for matchup questions. Immunities are 0× and must be " +
  "treated as immunities, not resistances.";

type DefensiveProfile = {
  weak_to: string[];
  resists: string[];
  immune_to: string[];
};

function isFoundProfile(ref: unknown): ref is TypeMatchupsDetail {
  return (
    typeof ref === "object" &&
    ref !== null &&
    (ref as { found?: unknown }).found === true
  );
}

/**
 * Defensive multiplier of one (single) type against an attacking type, derived
 * from its classified defensive lists. A single type's matchups are exactly
 * 0× / 0.5× / 2× / 1×, so this reconstruction is exact.
 */
function defMultiplier(def: DefensiveProfile, attacking: string): number {
  if (def.immune_to.includes(attacking)) return 0;
  if (def.weak_to.includes(attacking)) return 2;
  if (def.resists.includes(attacking)) return 0.5;
  return 1;
}

export const getTypeMatchupsTool: ToolDef = {
  name: "get_type_matchups",
  description,
  inputSchema: toJsonSchema(getTypeMatchupsInputSchema),
  async run(args, ctx): Promise<GetTypeMatchupsOutput> {
    const parsed = getTypeMatchupsInputSchema.safeParse(args);
    if (!parsed.success) {
      return { found: false, suggestions: [] };
    }
    const { types } = parsed.data;
    const format = formatForMode(ctx.mode);

    // Single type: the cached profile already has offensive + defensive.
    if (types.length === 1) {
      return (await getReference(
        "type",
        types[0]!,
        format,
        ctx.db,
      )) as GetTypeMatchupsOutput;
    }

    // Two types: combine defensive multipliers.
    const ref1 = (await getReference(
      "type",
      types[0]!,
      format,
      ctx.db,
    )) as GetTypeMatchupsOutput;
    if (!isFoundProfile(ref1)) return ref1;

    const ref2 = (await getReference(
      "type",
      types[1]!,
      format,
      ctx.db,
    )) as GetTypeMatchupsOutput;
    if (!isFoundProfile(ref2)) return ref2;

    const d1 = ref1.defensive;
    const d2 = ref2.defensive;

    const weak_to: string[] = [];
    const resists: string[] = [];
    const immune_to: string[] = [];

    for (const attacking of TYPE_NAMES) {
      const m = defMultiplier(d1, attacking) * defMultiplier(d2, attacking);
      if (m === 0) {
        immune_to.push(attacking);
      } else if (m > 1) {
        weak_to.push(attacking);
      } else if (m < 1) {
        resists.push(attacking);
      }
      // m === 1 -> neutral, omitted
    }

    return {
      found: true,
      types: [types[0]!, types[1]!],
      defensive: { weak_to, resists, immune_to },
    };
  },
};
