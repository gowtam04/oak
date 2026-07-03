/**
 * T8 — `get_item` (tools.md T8).
 *
 * Item effect text (and, where available, wild-held data), via the read-through
 * reference cache (DS-4). Pass-through of miss / upstream shapes; never throws.
 * Champions mode only: either miss path (operator-excluded, or a plain
 * reference miss) is flagged with `exists_in_standard` when the item is real
 * in the mainline Gen 9 (scarlet-violet) index.
 */

import type { ToolDef } from "@/agent/types";
import {
  getItemInputSchema,
  toJsonSchema,
  type GetItemOutput,
} from "@/agent/schemas";
import { getReference } from "@/data/repos/reference-cache";
import { formatForMode, CHAMPIONS_FORMAT, STANDARD_FORMAT } from "@/data/formats";

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
    // the model shouldn't reach here with an excluded slug). `ctx.db` carries
    // the bound handle, exactly as forwarded to getReference below.
    if (format === CHAMPIONS_FORMAT) {
      const { loadChampionsItemExclusions } = await import(
        "@/data/repos/champions-items-repo"
      );
      const excluded = await loadChampionsItemExclusions(ctx.db);
      if (excluded.has(parsed.data.name)) {
        // Operator-excluded items are real in standard almost by definition,
        // but probe rather than assume so the flag stays honest.
        const std = await getReference(
          "item",
          parsed.data.name,
          STANDARD_FORMAT,
          ctx.db,
        );
        return {
          found: false,
          suggestions: [],
          exists_in_standard: "found" in std && std.found === true,
        };
      }
    }
    const ref = (await getReference(
      "item",
      parsed.data.name,
      format,
      ctx.db,
    )) as GetItemOutput;
    if (format === CHAMPIONS_FORMAT && "found" in ref && ref.found === false) {
      const std = await getReference(
        "item",
        parsed.data.name,
        STANDARD_FORMAT,
        ctx.db,
      );
      return { ...ref, exists_in_standard: "found" in std && std.found === true };
    }
    return ref;
  },
};
