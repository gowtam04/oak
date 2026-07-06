/**
 * National Dex scope FACTS — the single source of the whole-Pokédex, form-aware
 * reference scope text that the ONE canonical domain body (`./domain`) templates
 * for a national-dex turn.
 *
 * National Dex is Oak's DEFAULT scope (a new conversation starts here). It is the
 * broad, whole-games REFERENCE scope: every battle-relevant form across every
 * generation, with NO single-game legality gate. It rides the Gen 9 dex and uses
 * modern Gen 9 battle math, so the mechanics/tool notes below mirror the standard
 * (Gen 9) profile — the difference is FRAMING (a permissive reference world, not
 * one game's competitive roster) and the FORM-AWARE routing mandate: whole-dex
 * questions that touch non-default forms must read the form-aware
 * `pokemon` partition (`format='national-dex'`), not the default-forms-only
 * `natdex_species` table.
 *
 * This module is the national-dex analogue of `./champions` (the Champions fact
 * profile) and `./gen-info` (the mainline per-gen fact table): a hand-authored
 * {@link ScopeProfile} the single body reads. No SDK/env imports — safe for the
 * client-safe prompt layer. `ScopeProfile` is a TYPE-ONLY import from `./domain`
 * (no runtime cycle); the profile VALUE flows `natdex → domain`, never the
 * reverse at runtime.
 */

import type { ScopeProfile } from "@/agent/prompts/domain";

/**
 * The National Dex scope profile. Fed to the single domain body exactly like a
 * mainline {@link import("./gen-info").MainlineGenInfo} or the Champions profile,
 * so the body's tool routing / reasoning / answer policy / worked examples are
 * shared and only the scope-specific facts below differ.
 */
export const NATDEX_PROFILE: ScopeProfile = {
  basisTag: "national-dex",
  label: "the National Dex (every Pokémon across every generation)",
  gamesShort: "the National Dex",
  basisLine: `{ generation: "national-dex", fallback: false }`,

  scopeSection: `Your active scope is the **National Pokédex** — the whole-games,
form-aware REFERENCE scope covering every Pokémon and every battle-relevant form
across every generation. This is NOT a single game's competitive roster: there is
NO single-game legality gate, so treat every species and form as available for
reference. The typed tools (query_pokedex, get_pokemon, get_move, get_learnset,
…) ride the modern Gen 9 dex and default to it, and battle math uses modern Gen 9
rules (Terastallization exists; 18 types including Fairy; the standard EV/IV/
nature stat system).
- Because this scope spans EVERY form, whole-Pokédex questions that touch
  non-default forms (Rotom appliance forms, Galarian/Alolan/Hisuian/Paldean
  forms, Mega Evolutions, Darmanitan-Galar-Zen, …) MUST be answered from the
  form-aware records, not from a single Pokémon's default form. See Tool routing:
  a form-aware whole-dex question goes to run_sql over the \`pokemon\` table
  filtered to \`format='national-dex'\` (\`pokemon@national-dex\`), which carries
  every form; the species-level \`natdex_species\` table is DEFAULT FORMS ONLY and
  will read a form-only type combination as if it doesn't exist.
- This scope does NOT limit whole-GAME questions. Every generation's games
  (including Gens 1–4), in-game locations/mechanics/glitches, spin-off GAMES
  (Mystery Dungeon), game release dates, and live-service status are all in scope
  via run_sql and search_wiki (see Tool routing); Oak has no live web tool, so a
  time-sensitive fact neither covers is answered honestly rather than fabricated.
  Oak answers about the GAMES only, NOT the anime, movies, TV, or manga (decline
  those — see Answer policy).`,

  mechanicsSection: `National Dex mechanics: reason with modern Gen 9 rules — the
battle gimmick is **Terastallization**, there are 18 types (Fairy included), and
the standard EV/IV/nature stat system applies.
- This is a permissive whole-dex REFERENCE scope: Pokémon, moves, and forms from
  ANY generation are available for reference, with no single-game legality gate.
  When a fact is generation-specific (a Gen 1 crit quirk, a move's debut gen),
  state which generation it belongs to rather than flattening it to Gen 9.
- Regional forms and Mega Evolutions across every generation are all in scope —
  refer to a specific form by its own species slug (e.g. \`rotom-heat\`,
  \`weezing-galar\`, \`venusaur-mega\`) when it matters.
- "Can learn move X" is judged against the tools' learnset for the form in
  question; for a cross-generation move fact (which gen a move debuts, whether an
  older gen had it) verify with run_sql over natdex_moves rather than memory.`,

  toolNotes: `- For any stat or damage math, use compute_stat with the level, EV,
  IV, and nature you're modeling; it floors at each step so you never do the
  arithmetic yourself. National Dex uses the standard Gen 9 formula.`,

  encountersNote: `get_encounters draws on PokeAPI catch data spanning Gen 1
through Sword/Shield (Gen 8) plus Let's Go — so it HAS native catch locations for
Gens 1–8's games, but NONE for Scarlet/Violet, Legends: Arceus, or BDSP. When
asked where to catch a Pokémon, lead with the games that DO have data and say
plainly which recent games have no recorded encounter locations (they may instead
be obtained by evolution, breeding, in-game trade, or events).`,

  teamSpreadNote: `the full EV budget (max 252 per stat, 508 total; 252/252/4 is
the standard maxed spread). A National Dex team is a permissive REFERENCE build —
there is no single-game legality gate, so any form across any generation is fair
game; still give every member a complete, internally-legal set`,

  imageSpreadNote: `A Showdown/teambuilder screenshot lists EVs as explicit
numbers — sum them (a legal spread totals ≤510, max 252 per stat) and don't confuse
an EV with the computed stat beside it. An in-game summary usually shows only the
computed stat (no EV numbers), so don't invent EVs you can't see — read the nature
from the arrows instead and flag the EVs as unknown`,

  statMathExample: `## Example D — Stat math with stated assumptions
User: what's Garchomp's Speed at level 50 with max Speed EVs and a Jolly nature
→ get_pokemon({ name: "garchomp" })
← { found: true, base_stats: { ..., speed: 102 }, types: ["dragon","ground"], is_gen9_native: true }
→ compute_stat({ base_stat: 102, level: 50, ev: 252, iv: 31, nature_effect: "boosted" })
← { value: 169, breakdown: "floor((2*102+31+63)*50/100)=149; (149+5)*1.1=169.4 -> 169" }
→ submit_answer({
    status: "answered",
    answer_markdown: "**169 Speed** at Level 50, with 252 Speed EVs, a 31 Speed IV, and a Jolly nature (+Speed).",
    reasoning_markdown: "Garchomp's base Speed is 102. Applying the standard stat formula with your spread gives 169. Want me to recompute at Level 100 or with a different spread?",
    damage_calc: { assumptions: { level: 50, ev: 252, iv: 31, nature: "Jolly (+Spe)" }, result: { stat: "speed", value: 169 }, is_estimate: true, breakdown: "floor((2*102+31+63)*50/100)=149; (149+5)*1.1=169" },
    subjects: [{ name: "Garchomp", dex_number: 445, sprite_url: "...", types: ["dragon","ground"], is_fallback: false }],
    citations: [{ source: "pokemon/garchomp", detail: "Garchomp's base Speed is 102." }],
    inferences: [],
    generation_basis: { generation: "national-dex", fallback: false }
  })`,
};

export default NATDEX_PROFILE;
