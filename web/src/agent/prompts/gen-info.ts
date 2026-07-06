/**
 * Per-generation prompt facts — the SINGLE source of the mainline (non-Champions)
 * scope text the ONE canonical prompt body (`./domain`) templates in. Since Oak v2
 * P3 (prompt collapse) there is a single Markdown body shared by all three
 * providers; `domain.ts` reads `MAINLINE_GEN_INFO[mode]` and injects these strings
 * (label, basis tag, mechanics guard, encounter caveat) as the mainline
 * {@link import("./domain").ScopeProfile}. Champions supplies the sibling profile
 * from `./champions`. There is exactly one place each generation fact lives, so a
 * scope's body can never disagree with `formats.ts` on the basis tag.
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
 * `"champions"` AND `"national-dex"`, each of which has its own hand-authored
 * scope profile (`./champions`, `./natdex`) rather than a per-gen fact entry.
 * Deriving from `AgentMode` (rather than re-spelling the literal union) makes
 * this the single source of truth: the mainline single-game gens (standard =
 * Gen 9, plus gen-1…gen-8) each force a matching entry in
 * {@link MAINLINE_GEN_INFO}.
 */
export type MainlineMode = Exclude<AgentMode, "champions" | "national-dex">;

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
   * drops cleanly in as one numbered rule in the canonical Markdown body's
   * mechanics section. Covers, per gen: which battle gimmick exists (and which
   * do NOT), whether the Fairy type exists, and that "can learn move X" is judged
   * against THIS gen's learnset — always deferring to the tools over memory.
   */
  mechanicsNotes: string;
  /**
   * One line on catch/location coverage for this scope. `get_encounters` draws on
   * PokeAPI encounter data spanning Gen 1 through Sword/Shield (Gen 8) + Let's Go,
   * so gens 5–8 have NATIVE catch data for their games — unlike Gen 9, whose
   * games have none. Templated into the encounters section of the canonical body.
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
1–8 coverage). Results arrive with this generation's game groups sorted first and
every group flagged \`in_active_scope\` (B-12) — lead the answer with the
Black/White/B2W2 locations and mention other games' locations only secondarily.
If \`scope_note\` is set, say plainly that there's no catch data for this
Pokémon in Gen 5's games before covering the other-gen locations returned.`,
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
coverage). Results arrive with this generation's game groups sorted first and
every group flagged \`in_active_scope\` (B-12) — lead the answer with the X/Y/
ORAS locations and mention other games' locations only secondarily. If
\`scope_note\` is set, say plainly that there's no catch data for this Pokémon
in Gen 6's games before covering the other-gen locations returned.`,
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
coverage). Results arrive with this generation's game groups sorted first and
every group flagged \`in_active_scope\` (B-12) — lead the answer with the
Sun/Moon/USUM locations and mention other games' locations only secondarily. If
\`scope_note\` is set, say plainly that there's no catch data for this Pokémon
in Gen 7's games before covering the other-gen locations returned.`,
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
covered). Results arrive with this generation's game groups sorted first and
every group flagged \`in_active_scope\` (B-12) — lead the answer with the
Sword/Shield locations and mention other games' locations only secondarily. If
\`scope_note\` is set, say plainly that there's no catch data for this Pokémon
in Gen 8's games before covering the other-gen locations returned.`,
  },
  "gen-4": {
    basisTag: "gen-4",
    label: "Generation 4 (Diamond/Pearl/Platinum and HeartGold/SoulSilver)",
    gamesShort: "Diamond/Pearl/Platinum/HGSS",
    mechanicsNotes: `Generation 4 mechanics: there is NO battle gimmick — no Mega
Evolution, no Z-Moves, no Dynamax, and no Terastallization exist yet. Never
recommend any of them.
- The Fairy type does NOT exist in Gen 4 (there are 17 types). Do not treat any
  Pokémon or move as Fairy or invent Fairy matchups — the ingested Gen 4 type
  chart already omits Fairy, so trust the tools' typing and matchups.
- The per-move PHYSICAL/SPECIAL SPLIT is INTRODUCED this generation: from Gen 4
  on a move's damage class is set per MOVE (so Gyarados can attack physically off
  Waterfall), NOT decided by the move's TYPE as it was in Gens 1–3. Trust each
  move's damage_class from the tools.
- Abilities, Natures, and the IV/EV stat system are all in force, so compute_stat
  models this generation's stats exactly — use it for any stat math (no caveat
  needed here).
- "Can learn move X" for this older generation is best verified with run_sql over
  natdex_moves (the cross-generation move source) rather than your memory.`,
    encountersNote: `get_encounters HAS native catch/location data for this
generation's games (Diamond/Pearl/Platinum and HeartGold/SoulSilver — inside the
Gen 1–8 coverage). Results arrive with this generation's game groups sorted first
and every group flagged \`in_active_scope\` (B-12) — lead the answer with the
Gen 4 locations and mention other games' locations only secondarily. If
\`scope_note\` is set, say plainly that there's no catch data for this Pokémon
in Gen 4's games before covering the other-gen locations returned.`,
  },
  "gen-3": {
    basisTag: "gen-3",
    label: "Generation 3 (Ruby/Sapphire/Emerald and FireRed/LeafGreen)",
    gamesShort: "Ruby/Sapphire/Emerald/FRLG",
    mechanicsNotes: `Generation 3 mechanics: there is NO battle gimmick — no Mega
Evolution, no Z-Moves, no Dynamax, and no Terastallization exist yet. Never
recommend any of them.
- The Fairy type does NOT exist in Gen 3 (there are 17 types). Do not treat any
  Pokémon or move as Fairy or invent Fairy matchups — trust the tools' typing.
- The physical/special split is by TYPE, not per move: a move's damage class is
  decided by its TYPE (all Fire moves are Special, all Fighting moves Physical,
  etc.). The per-MOVE split does not arrive until Gen 4 — so a "physical Fire
  move" doesn't exist here.
- Abilities, Natures, and the IV/EV stat system are all INTRODUCED this
  generation (Ruby/Sapphire), and Double Battles debut here too. compute_stat
  models this generation's stats exactly — use it for any stat math.
- "Can learn move X" for this older generation is best verified with run_sql over
  natdex_moves (the cross-generation move source) rather than your memory.`,
    encountersNote: `get_encounters HAS native catch/location data for this
generation's games (Ruby/Sapphire/Emerald and FireRed/LeafGreen — inside the Gen
1–8 coverage). Results arrive with this generation's game groups sorted first and
every group flagged \`in_active_scope\` (B-12) — lead the answer with the Gen 3
locations and mention other games' locations only secondarily. If \`scope_note\`
is set, say plainly that there's no catch data for this Pokémon in Gen 3's games
before covering the other-gen locations returned.`,
  },
  "gen-2": {
    basisTag: "gen-2",
    label: "Generation 2 (Gold/Silver/Crystal)",
    gamesShort: "Gold/Silver/Crystal",
    mechanicsNotes: `Generation 2 mechanics: there is NO battle gimmick and there
are NO Abilities and NO Natures yet — never recommend an ability, a nature, Mega
Evolution, Z-Moves, Dynamax, or Terastallization.
- The Dark and Steel types are INTRODUCED this generation (17 types), but the
  Fairy type still does NOT exist. Trust the tools' Gen 2 type chart.
- Held items are INTRODUCED this generation. The physical/special split is by
  TYPE (a move's damage class follows its type, as in Gen 1); the per-move split
  does not arrive until Gen 4.
- The Special stat SPLITS this generation: Special Attack and Special Defense are
  now SEPARATE stats (Gen 1 had a single combined Special).
- Stats use DVs (0–15) and Stat Experience, not EVs or Natures — compute_stat
  models this DV/Stat-Exp system CORRECTLY in this scope (it is exact here, not
  an approximation). Pass the DV in the \`iv\` field and the Stat Exp target in
  \`ev\`; nature has no effect.
- "Can learn move X" for this older generation is best verified with run_sql over
  natdex_moves (the cross-generation move source) rather than your memory.`,
    encountersNote: `get_encounters HAS native catch/location data for this
generation's games (Gold/Silver/Crystal — inside the Gen 1–8 coverage). Results
arrive with this generation's game groups sorted first and every group flagged
\`in_active_scope\` (B-12) — lead the answer with the Gen 2 locations and mention
other games' locations only secondarily. If \`scope_note\` is set, say plainly
that there's no catch data for this Pokémon in Gen 2's games before covering the
other-gen locations returned.`,
  },
  "gen-1": {
    basisTag: "gen-1",
    label: "Generation 1 (Red/Blue/Yellow)",
    gamesShort: "Red/Blue/Yellow",
    mechanicsNotes: `Generation 1 mechanics: there is NO battle gimmick, NO held
items, NO Abilities, and NO Natures — never recommend any of them, or Mega
Evolution, Z-Moves, Dynamax, or Terastallization.
- There are only 15 types: the Dark, Steel, AND Fairy types do NOT exist yet.
  Trust the tools' Gen 1 type chart, which already omits them.
- The Gen 1 GHOST-vs-PSYCHIC quirk: Ghost-type moves have NO effect on
  Psychic-types in Gen 1 (a well-known bug — Ghost was intended to be
  super-effective). The ingested Gen 1 type chart already encodes this, so read
  the matchup off the tools rather than assuming modern effectiveness.
- Special is a SINGLE combined stat: Special Attack and Special Defense are not
  yet separate (they split in Gen 2). The physical/special split is by TYPE.
- Critical hits are SPEED-BASED: a Pokémon's base Speed sets its crit rate (a
  fast attacker crits far more often), unlike the flat modern rate — flag this
  when it matters for a damage question.
- Stats use DVs (0–15) and Stat Experience, not EVs or Natures — compute_stat
  models this DV/Stat-Exp system CORRECTLY in this scope (it is exact here, not
  an approximation). Pass the DV in the \`iv\` field and the Stat Exp target in
  \`ev\`; nature has no effect.
- "Can learn move X" for this older generation is best verified with run_sql over
  natdex_moves (the cross-generation move source) rather than your memory.`,
    encountersNote: `get_encounters HAS native catch/location data for this
generation's games (Red/Blue/Yellow — the start of the Gen 1–8 coverage).
Results arrive with this generation's game groups sorted first and every group
flagged \`in_active_scope\` (B-12) — lead the answer with the Gen 1 locations and
mention other games' locations only secondarily. If \`scope_note\` is set, say
plainly that there's no catch data for this Pokémon in Gen 1's games before
covering the other-gen locations returned.`,
  },
};
