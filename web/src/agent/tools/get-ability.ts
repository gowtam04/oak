/**
 * T5 — `get_ability` (tools.md T5).
 *
 * Effect text for one ability, via the read-through reference cache (DS-4).
 * Pass-through of the miss / upstream-unavailable shapes; never throws.
 * Off-roster names are a plain miss (ADR-8, CF-DATA-BR-5) — no
 * `exists_in_standard` / other-game probe.
 */

import type { ToolDef } from "@/agent/types";
import {
  getAbilityInputSchema,
  toJsonSchema,
  type GetAbilityOutput,
} from "@/agent/schemas";
import { getReference } from "@/data/repos/reference-cache";
import { formatForMode } from "@/data/formats";

const description =
  "Get an ability's effect text and short description. Use when reasoning " +
  "depends on what an ability does (e.g. Armor Tail negating priority moves, " +
  "Flash Fire's Fire immunity).";

export const getAbilityTool: ToolDef = {
  name: "get_ability",
  description,
  inputSchema: toJsonSchema(getAbilityInputSchema),
  async run(args, ctx): Promise<GetAbilityOutput> {
    const parsed = getAbilityInputSchema.safeParse(args);
    if (!parsed.success) {
      return { found: false, suggestions: [] };
    }
    const format = formatForMode(ctx.mode);
    return (await getReference(
      "ability",
      parsed.data.name,
      format,
      ctx.db,
    )) as GetAbilityOutput;
  },
};
