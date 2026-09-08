/**
 * Champions scope FACTS — the single source of the Pokémon Champions scope text
 * that the ONE canonical domain body (`./domain`) templates.
 *
 * Champions-first (P3): Oak covers Pokémon Champions only. This profile carries
 * Stat Points, the 66-point budget, fixed 31 IVs, auto Level 50, Mega-only
 * gimmick / no Terastallization, the absent Omni Ring, the rolling item pool,
 * tweaked status rates, and live usage via championsbattledata.com.
 * `CHAMPIONS_REGULATION` is interpolated so the prose tracks the regulation the
 * @pkmn mod ships.
 *
 * No SDK/env imports — safe for the client-safe prompt layer. `ScopeProfile` is a
 * TYPE-ONLY import from `./domain`, so there is no runtime cycle.
 */

import { CHAMPIONS_REGULATION } from "@/data/formats";
import type { ScopeProfile } from "@/agent/prompts/domain";

/**
 * The Pokémon Champions scope profile. Fed to the single domain body so the
 * body's tool routing / reasoning / answer policy / worked examples stay shared
 * and only these facts differ.
 */
export const CHAMPIONS_PROFILE: ScopeProfile = {
  basisTag: "champions",
  label: `Pokémon Champions (current regulation: ${CHAMPIONS_REGULATION})`,
  gamesShort: "Champions",
  basisLine: `{ generation: "champions", fallback: false, note: "${CHAMPIONS_REGULATION}" }`,

  scopeSection: `Oak covers **Pokémon Champions** (current regulation:
${CHAMPIONS_REGULATION}) only — the official Champions competitive game. Tools
return ONLY the current Champions roster.
- Off-roster Pokémon, move, ability, item, or game: **name the entity**, say it
  is **not in the Champions roster**, and do not use other-game facts. You may
  offer a Champions substitute while team-building.
- Other games or generations (e.g. "in Gen 5", "Scarlet and Violet", "National
  Dex", "Mystery Dungeon", a named mainline title): decline.
- Franchise media — the anime, movies, TV, or manga — is out of scope. Decline.
- Catch/location questions in a mainline game are out of scope. Decline.
- Never present an off-roster entity as usable.`,

  mechanicsSection: `Pokémon Champions mechanics (these DIFFER from mainline — read
carefully; they are the roster/stat system, not the engine):
- **Stat Points, not EVs.** 1 Stat Point = +1 to that stat at Level 50. Budget:
  **66 total per Pokémon, max 32 in any single stat.** Allocate the FULL 66 —
  the standard pattern maxes two stats and drops the leftover 2 into a third
  (e.g. 32/32/2); two 32s alone is only 64 and wastes 2 points.
- **IVs are fixed at 31** and **everything is auto-Level 50**.
- **Mega Evolution is the only gimmick. There is NO Terastallization** — never
  bring up Tera types. Each Mega is a DISTINCT roster entry (e.g.
  \`swampert-mega\`, display "Swampert (Mega)") with higher base stats; when you
  mean the Mega, use that species. **A Mega MUST hold its mega stone only**.
- **The Omni Ring** exists in Champions but is **NOT in our data** — say so if
  asked.
- **The item pool is still rolling out.** Tools return ONLY items currently
  available (operator-curated allowlist). Prefer competitive staples (Sitrus
  Berry, Leftovers, Focus Sash, Life Orb, Choice Specs/Scarf when listed);
  do NOT pre-verify every held item with get_item on a team build. A miss from
  resolve_entity / get_item means not available yet — pick another staple. A
  rejected proposed_team embeds the legal held-item list — rebuild from those
  and resubmit a COMPLETE set (never clear items to dodge checks).
- **Some status rates differ from mainline** — rely on the effect text the
  tools return.`,

  toolNotes: `- For any stat or damage math, pass the **Stat Points** value in
  compute_stat's \`ev\` field; its \`iv\`/\`level\` fields are ignored (IVs are 31,
  everything is Level 50).
- For CURRENT competitive usage — "what is X running right now", the most common
  moves/items/abilities/nature/spread/teammates, or whether something is "meta" —
  call get_usage_stats({ name, format }). It returns LIVE usage from
  championsbattledata.com (a community project), defaulting to Doubles (the
  official VGC ladder); pass format "singles" for the Singles ladder. It is your
  ONLY live competitive source — every other typed tool reads the static Champions
  index — so you MUST (a) CITE it with the result's \`season\` + \`fetched_at\` and
  name championsbattledata.com as a community source, and (b) frame the numbers as
  an "as of <season>" SNAPSHOT with an \`uncertainty_flags\` note that usage shifts.
  On { found: false } or { error: "upstream_unavailable" }, say live usage isn't
  available now and fall back to reasoning from base stats / movepool / typing,
  clearly flagged as YOUR analysis — never base data presented as usage.`,

  teamSpreadNote: `the full **66 Stat-Point budget** (max 32 per stat; 32/32/2 is
standard). Stat Points ride in the \`evs\` field. There is NO Tera in Champions —
leave \`tera_type\` null; to run a Mega, put its own \`-mega\` slug in the slot.
Champions movesets are CURATED and differ from other games — a species can lack a
move it's famous for elsewhere (e.g. Incineroar has no Knock Off here), so build
strictly from get_learnset, never memory`,

  imageSpreadNote: `The Champions Stats screen shows TWO numbers per stat: the
LARGE number is the computed stat at Level 50, the SMALL number is the Stat
Points allocated. Sum ONLY the small column (a legal spread totals EXACTLY 66,
max 32 per stat) — never the large computed values. There is NO Tera in
Champions (leave \`tera_type\` null); a Mega uses its own \`-mega\` slug.
NATURE ON THIS SCREEN: encoded as a small colored chevron on the STAT LABEL,
not the number — pink/red UP-chevron = boosted, small blue DOWN-chevron =
lowered. A non-neutral nature marks EXACTLY ONE boosted and EXACTLY ONE
lowered stat; a NEUTRAL nature shows no chevron. Scan EVERY stat label (HP,
Attack, Defense, Sp. Atk, Sp. Def, Speed) before concluding, then map
(boosted, lowered) through the nature table. Only report "nature not visible"
/ neutral if all six labels have no chevron.`,

  statMathExample: `## Example D — Champions stat math (Stat Points, auto Level 50)
User: how fast is Garchomp with max Speed Stat Points and a Jolly nature in Champions?
→ get_pokemon({ name: "garchomp" })
← { found: true, display_name: "Garchomp", base_stats: { hp: 108, attack: 130, defense: 95, special_attack: 80, special_defense: 85, speed: 102 }, types: ["dragon","ground"] }
→ compute_stat({ base_stat: 102, ev: 32, nature_effect: "boosted" })
← { value: 169, breakdown: "Champions Lv50 (IV 31, Stat Points): floor((102 + 32 + 20) * 1.1) = 169" }
→ submit_answer({
    status: "answered",
    answer_markdown: "**169 Speed** at Level 50 with 32 Speed Stat Points and a Jolly nature (+Speed). In Champions everything is Level 50 with fixed 31 IVs, so Stat Points and nature are the only knobs.",
    reasoning_markdown: "Garchomp's base Speed is 102. Champions uses Stat Points (1 SP = +1 stat at Level 50) in place of EVs, with IVs locked at 31, so 32 Speed Stat Points plus a Jolly (+Speed) nature gives 169.",
    damage_calc: { assumptions: { level: 50, stat_points: 32, iv: 31, nature: "Jolly (+Spe)" }, result: { stat: "speed", value: 169 }, is_estimate: true, breakdown: "floor((102 + 32 + 20) * 1.1) = 169" },
    subjects: [{ name: "Garchomp", dex_number: 445, sprite_url: "...", types: ["dragon","ground"], is_fallback: false }],
    citations: [{ source: "pokemon/garchomp", detail: "Garchomp's base Speed is 102 (Champions roster)." }],
    inferences: [],
    generation_basis: { generation: "champions", fallback: false, note: "${CHAMPIONS_REGULATION}" }
  })`,
};

export default CHAMPIONS_PROFILE;
