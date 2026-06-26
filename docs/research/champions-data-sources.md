# Pokémon Champions data sources — research & decision

*Session research, 2026-06-26. Status: decided. Drives the "Champions mode + @pkmn migration" build.*

## Question

Can Pokébot answer trivia **specific to Pokémon Champions** (the competitive game) rather than mainline generations, and what should source that data? Champions has become the default competitive game, so a Champions-scoped mode is wanted alongside the existing Gen 9 behavior.

## Pokémon Champions (verified, mid-2026)

- Dedicated competitive battle game by **The Pokémon Works** (TPC + ILCA). Switch/Switch 2 **Apr 8 2026**, mobile **Jun 17 2026**. **Official Play! Pokémon VGC platform from 2026** (replaces Scarlet/Violet).
- **Curated, rotating roster** via **Regulation Sets** (M-A at launch, **M-B** from Jun 17 2026). Legality + the in-game ranked regulation *is* the official VGC format.
- **Different stat model:** IVs fixed at **31**; EVs replaced by **Stat Points** (66 pool, max 32/stat, **+1 SP = +1 stat at Lv50**); everything auto-**Level 50**.
- **Mega-only gimmick** at launch through mid-2026, via the new **Omni Ring** held item. Terastallization / Z-Moves / Dynamax are teased ("under consideration"), **not playable**.
- **Champions mechanics tweaks:** status-rate changes (paralysis 1/8 full-para, sleep 2–3 turns, freeze ~1/4 thaw + cap), assorted move BP/accuracy/PP overrides, new Mega abilities.

## Source verdicts

### PokeAPI — necessary but not sufficient
Has a thin `champions` version / version-group / 208-species pokedex (a **roster snapshot only**), but **no** mechanics, legality/regulation rules, Stat-Point model, Omni Ring, or usage/meta — and it **lags weeks–months** behind new games with known effect-text gaps. Fine for the stable mainline substrate; cannot answer distinctively-Champions questions.

### Pokémon Showdown / @pkmn — the authoritative source (chosen)
- **`@pkmn/dex`** is a **local** competitive dex (no network) and a **superset** of PokeAPI's battle data (same base stats/types/abilities + move flags).
- **`@pkmn/mods` ships dedicated `champions` + `championsregma` simulator mods** that genuinely re-implement the Champions engine — verified in `data/mods/champions/`: Stat-Point stat formula (IV=31 folded in), status-rate tweaks, **Tera disabled**, **Megas persist after fainting**, 20-PP cap, ~260 move overrides, new abilities.
- **Latency:** Champions formats land 0–3 days after each regulation (Reg M-A ~Apr 11, **Reg M-B same-day Jun 17**). The base `champions` mod tracks the **latest** regulation, so "stay current" = bump `@pkmn/mods` + re-ingest.
- **Caveat:** legality is a Smogon-maintained re-implementation (can lag; mid-season ban commits like "Ban Mega Blaziken"). Bounded and detectable (diff the ban commits).

## Decision

**Make @pkmn the primary/authoritative source (full migration; PokeAPI retired).** Add a chat **Champions-mode toggle**: ON ⇒ every query deterministically scoped to Champions; OFF ⇒ today's Gen 9 (Scarlet/Violet) behavior. Mode is server-controlled (in `AgentContext`), never an LLM-visible field.

**Out of scope (this iteration, noted for later):** live usage/meta (Smogon/Pikalytics), explicit per-regulation rotation machinery, the Omni Ring item (absent from @pkmn data — say so rather than invent it).

## @pkmn integration — verified specifics (installed `@pkmn/{dex,data,mods}` 0.10.11)

These supersede earlier assumptions; confirmed by probing the installed packages.

- **Register the mod:** `Dex.mod('champions' as ID, (await import('@pkmn/mods/champions')) as ModData)`. The module exports named `{ Abilities, Conditions, Formats, FormatsData, Items, Learnsets, Moves, Rulesets, Scripts }`. Requires a tsconfig `paths` entry: `"@pkmn/mods/*": ["node_modules/@pkmn/mods/build/*"]`.
- **Champions roster ≠ `gen.species` iteration.** `new Generations(Dex.mod('champions',…)).get(9).species` still yields **all 876** gen9 species (no Megas) — the mod does **not** restrict species existence. The **legal roster lives in `champData.FormatsData`**: legal ⟺ `isNonstandard` is falsy. That yields **314 species** (incl. **76 Megas**; restricted legendaries excluded for Reg M-B). Enumerate from `FormatsData`, resolve each via `modDex.species.get(id)`.
- **Megas** are real modded species: `modDex.species.get('venusaurmega')` → `Venusaur-Mega`, Thick Fat, boosted stats. Base + Mega both appear as legal entries (one row each).
- **Champions learnsets** via `modDex.learnsets.get(id).learnset` (`{moveid: sourceStrings[]}`) — genuinely scoped (Garchomp 58 moves vs 93 in gen9). Source strings encode gen+method (`'9M'`, `'9L42'`, `'9E'`…); keep methods `L/M/T`, drop `E` (egg), priority L>M>T (unchanged rule).
- **Move overrides apply** through `Dex.mod`: e.g. Anchor Shot 80→90 BP. `champData.Moves` has 259 entries; `champData.Abilities` 13 (angershell, berserk, disguise, dragonize, eelevate, firemane, healer, megasol, naturalcure, piercingdrill, regenerator, spicyspray, unseenfist).
- **Champions stat formula** (from `champions` mod `statModify`, Lv50 path): `HP = base + SP + 75`; `non-HP = (base + SP + 20) × natureMod` (`×1.1` plus / `×0.9` minus, floored), where `SP` is the Stat-Points value and IV=31 is folded into the +75/+20 constants. Drives the Champions `compute_stat` variant.
- **Current regulation:** base `champions` mod = **Regulation M-B** (`[Gen 9 Champions] VGC 2026 Reg M-B`). Surface as the `generation_basis.note`.
- **Effect-text drift (expected):** move/ability/item descriptions come from Showdown `desc`/`shortDesc` (vs PokeAPI `effect_entries`) in **both** modes after migration — citations reword; parity tests re-baselined.

## Where the (out-of-scope) missing data would live

Usage %, common sets, EV/Tera spreads: **Smogon `chaos/*.json` / `@pkmn/smogon` / `data.pkmn.cc`** (monthly, format-keyed) and **Pikalytics** (live Champions Reg M, semi-machine-readable). Regulation legal lists/clauses: **Victory Road**, **Serebii**, Bulbapedia. Tournament results: **Limitless VGC** (dev API). Most authoritative real-player usage: **Pokémon HOME Battle Data** (no public API; reaches devs via Pikalytics).
