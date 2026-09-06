/**
 * T22 — `lookup_box` (team-from-box Phase 1).
 *
 * One call looks up up to 40 names: each hit is a get_pokemon profile plus a
 * compact legal-move subset (≤16); each miss is suggestions (and, in Champions,
 * `exists_in_standard`). Server-side loop — not N model iterations (BOX-AC-3.2).
 * Compact moves, not a full movepool (BOX-AC-3.4); `get_learnset` stays the
 * complete-list API (BOX-BR-7). Never throws in-domain.
 *
 * Advertised Zod max is 40. `run` slices extras and sets `truncated_input`
 * rather than safeParse-ing a 41-length array (that would fail the schema).
 */

import type { ToolDef } from "@/agent/types";
import {
  toJsonSchema,
  lookupBoxInputSchema,
  type LookupBoxHit,
  type LookupBoxMiss,
  type LookupBoxOutput,
} from "@/agent/schemas";
import { getPokemon, normalizeName } from "@/data/repos/pokedex-repo";
import { movesForPokemon } from "@/data/repos/learnset-repo";
import { moveSummaries } from "@/data/repos/reference-cache";
import {
  formatForMode,
  CHAMPIONS_FORMAT,
  STANDARD_FORMAT,
} from "@/data/formats";
import type { OakDb } from "@/data/db";
import { compactMoves } from "./compact-learnset";

const description =
  "Look up up to 40 Pokémon names in one call: each hit is the species " +
  "profile plus a compact legal-move subset (at most 16 moves), each miss " +
  "has suggestions. Use for box-build / pasted owned lists. Do not use for " +
  "'what can X learn?' — that is get_learnset.";

function emptyOutput(
  format: string,
  truncated_input: boolean,
): LookupBoxOutput {
  return { format, truncated_input, results: [] };
}

export const lookupBoxTool: ToolDef = {
  name: "lookup_box",
  description,
  inputSchema: toJsonSchema(lookupBoxInputSchema),
  async run(args, ctx): Promise<LookupBoxOutput> {
    const format = formatForMode(ctx.mode);
    const db = ctx.db as unknown as OakDb;

    const raw =
      args && typeof args === "object" && !Array.isArray(args)
        ? (args as Record<string, unknown>)
        : null;
    const namesRaw = Array.isArray(raw?.names) ? raw.names : null;
    if (!namesRaw) {
      return emptyOutput(format, false);
    }

    const truncated_input = namesRaw.length > 40;
    const names = namesRaw
      .slice(0, 40)
      .filter((n): n is string => typeof n === "string" && n.length > 0);
    if (names.length === 0) {
      return emptyOutput(format, truncated_input);
    }

    const results: Array<LookupBoxHit | LookupBoxMiss> = [];
    for (const query of names) {
      const profile = await getPokemon(query, format, db);
      if (!profile.found) {
        if (format === CHAMPIONS_FORMAT) {
          const std = await getPokemon(query, STANDARD_FORMAT, db);
          results.push({
            query,
            found: false,
            suggestions: profile.suggestions,
            exists_in_standard: std.found === true,
          });
        } else {
          results.push({
            query,
            found: false,
            suggestions: profile.suggestions,
          });
        }
        continue;
      }

      const slug = normalizeName(query);
      const learned = await movesForPokemon(slug, format, db);
      const count = learned.length;
      if (count === 0) {
        results.push({
          query,
          found: true,
          pokemon: profile,
          learnset: {
            available: false,
            count: 0,
            truncated: false,
            compact_moves: [],
          },
        });
        continue;
      }

      const summaries = await moveSummaries(
        learned.map((m) => m.moveSlug),
        format,
        db,
      );
      const joined = learned.map((m) => {
        const summary = summaries.get(m.moveSlug);
        return {
          slug: m.moveSlug,
          method: m.method,
          type: summary?.type ?? null,
          category: summary?.damageClass ?? null,
          power: summary?.power ?? null,
        };
      });
      const compact_moves = compactMoves(joined, profile.types);
      results.push({
        query,
        found: true,
        pokemon: profile,
        learnset: {
          available: true,
          count,
          truncated: count > compact_moves.length,
          compact_moves,
        },
      });
    }

    return { format, truncated_input, results };
  },
};
