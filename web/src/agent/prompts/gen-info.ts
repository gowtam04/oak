/**
 * Per-generation prompt facts — the SINGLE source of the mainline (non-Champions)
 * scope text consumed by BOTH prompt bodies. `domain.ts` (Claude/OpenAI Markdown)
 * and `domain-grok.ts` (Grok XML) each read `MAINLINE_GEN_INFO[mode]` and
 * template the SAME strings into their own structure. That is what makes PARITY
 * hold by construction: there is exactly one place the generation label, basis
 * tag, mechanics guard, and encounter caveat live, so the two bodies can never
 * disagree on the domain facts (only on prompt structure, which is per-model).
 *
 * PURITY: this module is on the portable-modules list — the ONLY import is the
 * type-only `AgentMode`, so there is no `server-only`, no `@/env`, and no SDK/DB
 * dependency. It must compile and be importable from the client-safe prompt layer.
 *
 * INVARIANT: for every mode `m`, `MAINLINE_GEN_INFO[m].basisTag` MUST equal
 * `basisForFormat(formatForMode(m))` (`"gen-9"` for `"standard"`, else the gen
 * string). That is the value the builders stamp into every few-shot
 * `generation_basis.generation` and citation `(…)` suffix, and the value the
 * runtime's synthesized fallbacks use — keep it in lock-step with `formats.ts`.
 * The values are hardcoded here (not derived) to keep this module a pure fact
 * table; the parity/gen-info tests assert the equality against `formats.ts`.
 */

import type { AgentMode } from "@/agent/types";

/**
 * The mainline modes this table covers — every {@link AgentMode} EXCEPT
 * `"champions"` (Champions has its own untouched prompt body). Deriving from
 * `AgentMode` (rather than re-spelling the literal union) makes this the single
 * source of truth: if the supported-gen set ever widens (e.g. gens 1–4), TS
 * forces a matching entry to be added to {@link MAINLINE_GEN_INFO}.
 */
export type MainlineMode = Exclude<AgentMode, "champions">;

/** The generation-defining facts a mainline scope's prompt body is built from. */
export interface MainlineGenInfo {
  /**
   * The `generation_basis.generation` tag for answers in this scope, e.g.
   * `"gen-7"`. MUST equal `basisForFormat(formatForMode(mode))` — `"gen-9"` for
   * `"standard"`, else the gen string. Stamped into every few-shot
   * `generation_basis` and citation source suffix.
   */
  basisTag: string;
  /**
   * Human label for the scope, e.g. `"Generation 7 (Sun/Moon and Ultra
   * Sun/Ultra Moon)"`. Rendered wherever the old body said "Generation 9
   * (Scarlet/Violet, including DLC)". MUST name only this generation — the
   * gen-7 label must NOT contain the string "Generation 9" (a parity tripwire).
   */
  label: string;
  /**
   * Short game list for inline prose, e.g. `"Sun/Moon/USUM"`. Used in the
   * generalized `is_gen9_native` sentence ("native to ${gamesShort}") and other
   * short references where the full {@link label} would be too long.
   */
  gamesShort: string;
  /**
   * The gen-defining mechanics the model MUST respect — the ONLY guard against
   * recommending off-gen mechanics (Tera in gen 7, Z-Moves in gen 8, a Fairy
   * matchup in gen 5, …). Authored as a lead sentence plus `- ` sub-points so it
   * drops cleanly in as one numbered rule in the Markdown body and as plain text
   * in the Grok XML body. Covers, per gen: which battle gimmick exists (and which
   * do NOT), whether the Fairy type exists, and that "can learn move X" is judged
   * against THIS gen's learnset — always deferring to the tools over memory.
   */
  mechanicsNotes: string;
  /**
   * One line on catch/location coverage for this scope. `get_encounters` draws on
   * PokeAPI encounter data spanning Gen 1 through Sword/Shield (Gen 8) + Let's Go,
   * so gens 5–8 have NATIVE catch data for their games — unlike Gen 9, whose
   * games have none. Templated into the encounters section of both bodies.
   */
  encountersNote: string;
}

/**
 * The per-scope fact table. Keyed by {@link MainlineMode}; Champions is absent by
 * design (its prompt body is separate and untouched by the generation-scope
 * feature). Mechanics notes are deliberately conservative and explicit about what
 * does NOT exist in each gen, because the model has no other signal — scope is
 * never an LLM-visible tool input, so wrong-gen mechanics can only be prevented
 * here (plus scope-filtered tool results).
 */
export const MAINLINE_GEN_INFO: Record<MainlineMode, MainlineGenInfo> = {
  standard: {
    basisTag: "gen-9",
    label: "Generation 9 (Scarlet/Violet, including DLC)",
    gamesShort: "Scarlet/Violet",
    mechanicsNotes: `Generation 9 mechanics: the battle gimmick is **Terastallization**
(each Pokémon has a Tera type). There is NO Mega Evolution, NO Z-Moves, and NO
Dynamax/Gigantamax in Gen 9 — never recommend them.
- The Fairy type exists (18 types); trust the tools' type chart and matchups.
- Regional forms in scope include Paldean forms (also Alolan/Galarian/Hisuian
  where the Pokémon exists in this game).
- "Can learn move X" is judged against the Gen 9 learnset — trust query_pokedex
  and the learnset data over your own memory.`,
    encountersNote: `get_encounters has NO catch/location data for Scarlet/Violet
(Gen 9) — PokeAPI's encounter coverage ends at Sword/Shield (Gen 8) and Let's Go.
When asked where/how to catch a Pokémon, say so plainly and note it may instead be
obtained by evolution (get_evolution_chain), breeding, in-game trade, or events.`,
  },
  "gen-5": {
    basisTag: "gen-5",
    label: "Generation 5 (Black/White and Black 2/White 2)",
    gamesShort: "Black/White/B2W2",
    mechanicsNotes: `Generation 5 mechanics: there is NO battle gimmick — no Mega
Evolution, no Z-Moves, no Dynamax, and no Terastallization exist yet. Never
recommend any of them.
- The Fairy type does NOT exist in Gen 5 (there are 17 types). Do not treat any
  Pokémon or move as Fairy and do not invent Fairy matchups — the ingested Gen 5
  type chart already omits Fairy, so trust the tools' typing and matchups.
- The physical/special split is per move (as in every supported gen).
- "Can learn move X" is judged against the Gen 5 learnset — trust the tools over
  memory.
- Damage caveat: Gen 5 critical hits are 2× (the estimate_damage formula uses the
  modern 1.5×), so present crit figures as approximate and set is_estimate: true.`,
    encountersNote: `get_encounters HAS native catch/location data for this
generation's games (Black/White and Black 2/White 2 — Gen 5 falls inside the Gen
1–8 coverage). Answer where/how-to-catch questions from it: present the results
grouped by game with the method and level range.`,
  },
  "gen-6": {
    basisTag: "gen-6",
    label: "Generation 6 (X/Y and Omega Ruby/Alpha Sapphire)",
    gamesShort: "X/Y/ORAS",
    mechanicsNotes: `Generation 6 mechanics: the battle gimmick is **Mega
Evolution**. There are NO Z-Moves, NO Dynamax, and NO Terastallization — never
recommend them.
- The Fairy type is INTRODUCED this generation (18 types); several older Pokémon
  and moves gained Fairy typing here. Trust the tools' type data and matchups
  rather than a pre-Gen-6 mental model.
- The physical/special split is per move.
- "Can learn move X" is judged against the Gen 6 learnset — trust the tools over
  memory.`,
    encountersNote: `get_encounters HAS native catch/location data for this
generation's games (X/Y and Omega Ruby/Alpha Sapphire — inside the Gen 1–8
coverage). Answer where/how-to-catch questions from it, grouped by game with the
method and level range.`,
  },
  "gen-7": {
    basisTag: "gen-7",
    label: "Generation 7 (Sun/Moon and Ultra Sun/Ultra Moon)",
    gamesShort: "Sun/Moon/USUM",
    mechanicsNotes: `Generation 7 mechanics: BOTH **Mega Evolution** and **Z-Moves**
exist. There is NO Dynamax/Gigantamax and NO Terastallization — never recommend
Tera types or Dynamax here.
- The Fairy type exists (18 types); trust the tools' type chart and matchups.
- Regional forms introduced this generation are Alolan forms.
- "Can learn move X" is judged against the Gen 7 learnset — trust the tools over
  memory.`,
    encountersNote: `get_encounters HAS native catch/location data for this
generation's games (Sun/Moon and Ultra Sun/Ultra Moon — inside the Gen 1–8
coverage). Answer where/how-to-catch questions from it, grouped by game with the
method and level range.`,
  },
  "gen-8": {
    basisTag: "gen-8",
    label: "Generation 8 (Sword/Shield)",
    gamesShort: "Sword/Shield",
    mechanicsNotes: `Generation 8 mechanics: the battle gimmick is **Dynamax /
Gigantamax**. Mega Evolution and Z-Moves are GONE (removed this generation) and
there is NO Terastallization — never recommend Megas, Z-Moves, or Tera types.
- The Fairy type exists (18 types); trust the tools' type chart and matchups.
- Regional forms introduced this generation are Galarian forms.
- "Can learn move X" is judged against the Gen 8 learnset — trust the tools over
  memory.`,
    encountersNote: `get_encounters HAS native catch/location data for this
generation's games (Sword/Shield — the edge of the Gen 1–8 coverage, and fully
covered). Answer where/how-to-catch questions from it, grouped by game with the
method and level range.`,
  },
};
