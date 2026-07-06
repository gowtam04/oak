/**
 * T14 — `get_encounters`.
 *
 * Where and how to OBTAIN a Pokémon (wild encounters + gifts / gift-eggs /
 * static / in-game trades), grouped by game, from the pre-built PokeAPI snapshot
 * (reference_cache resource_kind "encounters"). STANDARD MODE ONLY: Champions
 * ships no encounter data, so a Champions turn short-circuits to a structured
 * `not_available_in_champions` (mirrors compute-stat.tool.ts's mode branch).
 * Pass-through of the repo's miss / index shapes; never throws in-domain.
 *
 * B-12 (gen-scope annotate+foreground): on a mainline gen-scoped turn (`ctx.mode`
 * one of "gen-1".."gen-8"), a hit's `encounters` groups are stable-partitioned so
 * the active generation's groups sort first, every group gains `in_active_scope`,
 * and a zero-match hit gets `scope_note`. Nothing is ever dropped, and standard/
 * national-dex/champions output stays byte-identical (no fields added) — the
 * annotation is server-side-scope-only, never a new tool input.
 */

import type { ToolDef } from "@/agent/types";
import {
  getEncountersInputSchema,
  toJsonSchema,
  type GetEncountersOutput,
} from "@/agent/schemas";
import { getEncounters } from "@/data/repos/encounter-repo";
import { STANDARD_FORMAT, formatForMode, genNumberForFormat } from "@/data/formats";
import type { OakDb } from "@/data/db";
import type { AgentMode } from "@/agent/types";

const GEN_SCOPES = new Set<AgentMode>([
  "gen-1",
  "gen-2",
  "gen-3",
  "gen-4",
  "gen-5",
  "gen-6",
  "gen-7",
  "gen-8",
]);

/**
 * Stable-partition `encounters` by active-generation match, annotate every
 * group with `in_active_scope`, and set `scope_note` when nothing matches.
 * Mutates nothing on the input; returns a new detail object.
 */
function applyGenScope(
  detail: Extract<GetEncountersOutput, { found: true }>,
  mode: AgentMode,
): Extract<GetEncountersOutput, { found: true }> {
  if (!GEN_SCOPES.has(mode) || detail.encounters.length === 0) {
    return detail;
  }
  const activeGen = genNumberForFormat(formatForMode(mode));
  const matching = detail.encounters.filter((g) => g.generation === activeGen);
  const rest = detail.encounters.filter((g) => g.generation !== activeGen);
  const encounters = [...matching, ...rest].map((g) => ({
    ...g,
    in_active_scope: g.generation === activeGen,
  }));
  const scope_note =
    matching.length === 0
      ? `No Generation ${activeGen} catch locations are recorded for this ` +
        "Pokémon; the locations below are from other generations' games."
      : detail.scope_note ?? null;
  return { ...detail, encounters, scope_note };
}

const description =
  "Find where and how to OBTAIN a Pokémon — wild encounters (grass/surf/" +
  "fishing) plus gifts, gift-eggs, static and in-game trades — grouped by game. " +
  "Use for 'where do I catch / how do I get X' questions. Coverage is Gen 1 " +
  "through Sword/Shield and Let's Go ONLY; there is NO data for Scarlet/Violet, " +
  "Legends: Arceus, or BDSP — say so plainly when asked about those games. " +
  "Resolve the species name first (resolve_entity) if it might be misspelled.";

export const getEncountersTool: ToolDef = {
  name: "get_encounters",
  description,
  inputSchema: toJsonSchema(getEncountersInputSchema),
  async run(args, ctx): Promise<GetEncountersOutput> {
    const parsed = getEncountersInputSchema.safeParse(args);
    if (!parsed.success) {
      return { found: false, suggestions: [] };
    }
    if (ctx.mode === "champions") {
      return { error: "not_available_in_champions" };
    }
    // GS-D4: encounter reference rows only exist under the scarlet-violet
    // format (the data itself is cross-game, Gen 1–8, grouped per game), so
    // every mainline scope — gen-1…gen-9 plus national-dex — reads
    // STANDARD_FORMAT here.
    const result = await getEncounters(
      parsed.data.name,
      STANDARD_FORMAT,
      ctx.db as unknown as OakDb,
    );
    // B-12: annotate+foreground for a gen-scoped turn only; standard stays
    // byte-identical (applyGenScope is a no-op outside gen-5..gen-8).
    if ("found" in result && result.found) {
      return applyGenScope(result, ctx.mode);
    }
    return result;
  },
};
