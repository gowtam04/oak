/**
 * T3 — `get_pokemon` (tools.md T3).
 *
 * Single-form profile read over the pokedex repo, which returns either the T3
 * profile shape or `{ found: false, suggestions }` on a miss (BR-9). Pass-through;
 * never throws in-domain. Off-roster names are a plain miss (ADR-8, CF-DATA-BR-5)
 * — no `exists_in_standard` / other-game probe.
 */

import type { ToolDef } from "@/agent/types";
import {
  getPokemonInputSchema,
  toJsonSchema,
  type GetPokemonOutput,
} from "@/agent/schemas";
import { getPokemon } from "@/data/repos/pokedex-repo";
import { formatForMode } from "@/data/formats";
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
    return getPokemon(parsed.data.name, format, db);
  },
};
