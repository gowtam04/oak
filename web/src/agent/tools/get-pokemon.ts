/**
 * T3 — `get_pokemon` (tools.md T3).
 *
 * Single-form profile read over the pokedex repo, which returns either the T3
 * profile shape or `{ found: false, suggestions }` on a miss (BR-9). Pass-through;
 * never throws in-domain. Champions mode only: a miss is additionally probed
 * against the mainline Gen 9 (scarlet-violet) index and flagged with
 * `exists_in_standard` when the species is real there.
 */

import type { ToolDef } from "@/agent/types";
import {
  getPokemonInputSchema,
  toJsonSchema,
  type GetPokemonOutput,
} from "@/agent/schemas";
import { getPokemon } from "@/data/repos/pokedex-repo";
import { formatForMode, CHAMPIONS_FORMAT, STANDARD_FORMAT } from "@/data/formats";
import type { OakDb } from "@/data/db";

const description =
  "Get the full profile of one specific Pokémon form: its types, all abilities " +
  "(including the hidden ability), base stats, sprite/artwork, national dex " +
  "number, available forms, and which generation the data is from. Use for " +
  "single-Pokémon lookups and to ground reasoning.";

export const getPokemonTool: ToolDef = {
  name: "get_pokemon",
  description,
  inputSchema: toJsonSchema(getPokemonInputSchema),
  async run(args, ctx): Promise<GetPokemonOutput> {
    const parsed = getPokemonInputSchema.safeParse(args);
    if (!parsed.success) {
      return { found: false, suggestions: [] };
    }
    const format = formatForMode(ctx.mode);
    const db = ctx.db as unknown as OakDb;
    const result = await getPokemon(parsed.data.name, format, db);
    if (format === CHAMPIONS_FORMAT && result.found === false) {
      const std = await getPokemon(parsed.data.name, STANDARD_FORMAT, db);
      return { ...result, exists_in_standard: std.found === true };
    }
    return result;
  },
};
