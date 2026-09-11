# Pokémon Champions data sources — research & decision

*Session research, 2026-06-26. Status: **superseded for Champions ingest** (2026-09).*

The Champions roster clock is a **pinned Pokémon Showdown git SHA**, not npm
`@pkmn/mods`. Follow
[`docs/features/champions-first/regulation-cutover.md`](../features/champions-first/regulation-cutover.md).
`@pkmn/dex` remains the Dex.mod / Dex.forGen engine. T15 /
championsbattledata.com is usage only.

Historical June notes below are kept for context. **Latency and “bump
`@pkmn/mods` as authority” are obsolete.** Do not resurrect wiki / National Dex
as ingest sources.

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

**Current ingest (supersedes the npm-as-clock bullets below):** Champions bytes
come from `web/vendor/pokemon-showdown/` at `SHOWDOWN_PIN`. `@pkmn/dex` is only
the overlay engine. Stay current by pinning a Showdown SHA (runbook), not by
bumping `@pkmn/mods`.

Historical June 2026 notes (npm `@pkmn/mods` 0.10.11 era — **obsolete as the
regulation clock**):

- **`@pkmn/dex`** is a **local** competitive dex (no network) and a **superset** of PokeAPI's battle data (same base stats/types/abilities + move flags). Still the Dex engine.
- **`@pkmn/mods` shipped dedicated `champions` + `championsregma` simulator mods** that genuinely re-implement the Champions engine — verified then in `data/mods/champions/`: Stat-Point stat formula (IV=31 folded in), status-rate tweaks, **Tera disabled**, **Megas persist after fainting**, 20-PP cap, ~260 move overrides, new abilities. Oak no longer takes Champions bytes from that npm package.
- **Latency (obsolete as ops):** Champions formats landed 0–3 days after each regulation (Reg M-A ~Apr 11, **Reg M-B same-day Jun 17**). The June conclusion “stay current = bump `@pkmn/mods` + re-ingest” is **wrong now**. If Showdown is late, wait on Showdown, not Kirk / npm. No wiki lists.
- **Caveat:** legality is a Smogon-maintained re-implementation (can lag; mid-season ban commits like "Ban Mega Blaziken"). Bounded and detectable (diff the pin SHA).

## Decision

**June 2026:** Make @pkmn the primary/authoritative source (full migration; PokeAPI retired). Add a chat **Champions-mode toggle**: ON ⇒ every query deterministically scoped to Champions; OFF ⇒ today's Gen 9 (Scarlet/Violet) behavior. Mode is server-controlled (in `AgentContext`), never an LLM-visible field.

**Now:** Champions ingest is the Showdown pin (`SHOWDOWN_PIN`), not npm `@pkmn/mods`. Runtime is Champions-only (no mode toggle). See the [regulation cutover runbook](../features/champions-first/regulation-cutover.md).

**Out of scope (this iteration, noted for later):** live usage/meta (Smogon/Pikalytics), explicit per-regulation rotation machinery, the Omni Ring item (absent from @pkmn data — say so rather than invent it).

## @pkmn integration — verified specifics (installed `@pkmn/{dex,data,mods}` 0.10.11)

June 2026 probe of npm 0.10.11. **Registration path is obsolete:** Champions
`ModData` is loaded from the Showdown pin (`web/src/data/pkmn/showdown-loader.ts`),
not `import('@pkmn/mods/champions')`. Roster / FormatsData / Stat-Point facts
below still describe how the mod is shaped.

- **Register the mod (obsolete npm path):** `Dex.mod('champions' as ID, (await import('@pkmn/mods/champions')) as ModData)`. The module exported named `{ Abilities, Conditions, Formats, FormatsData, Items, Learnsets, Moves, Rulesets, Scripts }`. Required a tsconfig `paths` entry: `"@pkmn/mods/*": ["node_modules/@pkmn/mods/build/*"]`. **Do not restore this as the Champions clock.**
- **Champions roster ≠ `gen.species` iteration.** `new Generations(Dex.mod('champions',…)).get(9).species` still yields **all 876** gen9 species (no Megas) — the mod does **not** restrict species existence. The **legal roster lives in `champData.FormatsData`**: legal ⟺ `isNonstandard` is falsy. That yields **314 species** (incl. **76 Megas**; restricted legendaries excluded for Reg M-B). Enumerate from `FormatsData`, resolve each via `modDex.species.get(id)`.
- **Megas** are real modded species: `modDex.species.get('venusaurmega')` → `Venusaur-Mega`, Thick Fat, boosted stats. Base + Mega both appear as legal entries (one row each).
- **Champions learnsets** via `modDex.learnsets.get(id).learnset` (`{moveid: sourceStrings[]}`) — genuinely scoped (Garchomp 58 moves vs 93 in gen9). Source strings encode gen+method (`'9M'`, `'9L42'`, `'9E'`…); keep methods `L/M/T`, drop `E` (egg), priority L>M>T (unchanged rule).
- **Move overrides apply** through `Dex.mod`: e.g. Anchor Shot 80→90 BP. `champData.Moves` has 259 entries; `champData.Abilities` 13 (angershell, berserk, disguise, dragonize, eelevate, firemane, healer, megasol, naturalcure, piercingdrill, regenerator, spicyspray, unseenfist).
- **Champions stat formula** (from `champions` mod `statModify`, Lv50 path): `HP = base + SP + 75`; `non-HP = (base + SP + 20) × natureMod` (`×1.1` plus / `×0.9` minus, floored), where `SP` is the Stat-Points value and IV=31 is folded into the +75/+20 constants. Drives the Champions `compute_stat` variant.
- **Current regulation (June 2026 note, obsolete):** base npm `champions` mod = **Regulation M-B**. The live chip is `CHAMPIONS_REGULATION` tracking `SHOWDOWN_PIN`, not that npm package.
- **Effect-text drift (expected):** move/ability/item descriptions come from Showdown `desc`/`shortDesc` (vs PokeAPI `effect_entries`) in **both** modes after migration — citations reword; parity tests re-baselined.

## Where the (out-of-scope) missing data would live

June 2026 notes (do **not** treat wiki lists as a roster source):

Usage %, common sets, EV/Tera spreads: **Smogon `chaos/*.json` / `@pkmn/smogon` / `data.pkmn.cc`** (monthly, format-keyed) and **Pikalytics** (live Champions Reg M, semi-machine-readable). Product usage today is **championsbattledata.com** (T15) — may lag a season; that does not block roster cutover. Regulation legal lists/clauses were listed as **Victory Road**, **Serebii**, Bulbapedia — **obsolete for ingest**; wait on Showdown, no wiki lists. Tournament results: **Limitless VGC** (dev API). Most authoritative real-player usage: **Pokémon HOME Battle Data** (no public API; reaches devs via Pikalytics).
