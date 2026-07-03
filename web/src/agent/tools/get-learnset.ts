/**
 * T17 — `get_learnset` (B-13).
 *
 * Lists every move a specific Pokémon form can legally learn in the active data
 * scope (the turn's format), with the learn method. Backs team-building legality:
 * `get_pokemon` returns types/abilities/stats but NOT the movepool, so before
 * proposing or editing a team the model calls this to confirm every chosen move
 * is legal — especially in Champions, whose curated movesets diverge from other
 * formats. Also answers plain "what moves can X learn" questions.
 *
 * Resolves the species through the pokedex repo (so a miss returns the same
 * `{ found:false, suggestions }` shape the model already knows, BR-9), then reads
 * the learnset for the canonical slug. Pass-through; never throws in-domain.
 */

import type { ToolDef } from "@/agent/types";
import {
  getLearnsetInputSchema,
  toJsonSchema,
  type GetLearnsetOutput,
} from "@/agent/schemas";
import { getPokemon, normalizeName } from "@/data/repos/pokedex-repo";
import { movesForPokemon } from "@/data/repos/learnset-repo";
import { formatForMode } from "@/data/formats";
import type { OakDb } from "@/data/db";

const description =
  "List every move a specific Pokémon form can legally learn in the current " +
  "data scope, with the learn method (level-up, machine, or tutor). Use this " +
  "before proposing or editing a team so every chosen move is legal — " +
  "especially in Champions, whose movesets differ from other formats — and to " +
  "answer 'what moves can X learn' questions.";

export const getLearnsetTool: ToolDef = {
  name: "get_learnset",
  description,
  inputSchema: toJsonSchema(getLearnsetInputSchema),
  async run(args, ctx): Promise<GetLearnsetOutput> {
    const parsed = getLearnsetInputSchema.safeParse(args);
    if (!parsed.success) {
      return { found: false, suggestions: [] };
    }

    const format = formatForMode(ctx.mode);
    const db = ctx.db as unknown as OakDb;

    // Resolve the species first so a miss reuses get_pokemon's suggestion shape.
    const profile = await getPokemon(parsed.data.name, format, db);
    if (!profile.found) {
      return { found: false, suggestions: profile.suggestions };
    }

    // The profile carries no id field; the learnset table is keyed by the same
    // canonical slug getPokemon matched on (normalizeName), so derive it that way.
    const slug = normalizeName(parsed.data.name);
    const moves = await movesForPokemon(slug, format, db);
    return {
      found: true,
      pokemon: slug,
      format,
      count: moves.length,
      moves: moves.map((m) => ({ slug: m.moveSlug, method: m.method })),
    };
  },
};
