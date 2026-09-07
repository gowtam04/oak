/**
 * T8 — `get_item` (tools.md T8).
 *
 * Item effect text (and, where available, wild-held data), via the read-through
 * reference cache (DS-4). Pass-through of miss / upstream shapes; never throws.
 * Operator-excluded Champions items are treated as not-found. Off-roster names
 * are a plain miss (ADR-8, CF-DATA-BR-5) — no `exists_in_standard`.
 */

import type { ToolDef } from "@/agent/types";
import {
  getItemInputSchema,
  toJsonSchema,
  type GetItemOutput,
} from "@/agent/schemas";
import { getReference } from "@/data/repos/reference-cache";
import { formatForMode, CHAMPIONS_FORMAT } from "@/data/formats";

const description =
  "Get an item's effect text and, where available, which Pokémon are found " +
  "holding it in the wild. Use for item questions.";

export const getItemTool: ToolDef = {
  name: "get_item",
  description,
  inputSchema: toJsonSchema(getItemInputSchema),
  async run(args, ctx): Promise<GetItemOutput> {
    const parsed = getItemInputSchema.safeParse(args);
    if (!parsed.success) {
      return { found: false, suggestions: [] };
    }
    const format = formatForMode(ctx.mode);
    // Champions: an item the operator marked unavailable is treated as
    // not-found (defense in depth — resolve_entity already won't surface it, so
    // the model shouldn't reach here with an excluded slug). Load faults must
    // not fail the tool (never throw in-domain).
    if (format === CHAMPIONS_FORMAT) {
      try {
        const { loadChampionsItemExclusions } = await import(
          "@/data/repos/champions-items-repo"
        );
        const excluded = await loadChampionsItemExclusions(ctx.db);
        if (excluded.has(parsed.data.name)) {
          return { found: false, suggestions: [] };
        }
      } catch {
        // Fall through to getReference.
      }
    }
    return (await getReference(
      "item",
      parsed.data.name,
      format,
      ctx.db,
    )) as GetItemOutput;
  },
};
