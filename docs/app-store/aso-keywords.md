# Oak — ASO Keyword Research (iOS)

**Scope:** iOS App Store. Android exists in-repo (`android/`) but Play Store listing is deferred, so there is no Google Play keyword field to optimize. **Trademark policy:** no "Pokémon"/"Pokédex" in App Name, Subtitle, or Keywords. The Description names **Pokémon Champions** as the product Oak coaches (CF-INT-BR-10) and uses "The Pokémon Company" once in the unofficial-fan-app disclaimer. The App Name uses **Champions** without the mark.

## App Name + Subtitle (the indexed pair this strategy is built around)

- **App Name:** `Oak – Champions Coach` (21/30) → indexes `oak`, `champions`, `coach`.
- **Subtitle:** `Team Builder & Calculator` (25/30) → indexes `team`, `builder`, `calculator`.

The bare name "Oak" was taken in the App Store; the descriptor makes the store name unique and fills Apple's most heavily-weighted field. Cross-field with the subtitle this produces "champions team builder" and "champions calculator" — the queries a Champions-only coach should rank for. `ai` used to live in the name (`Oak – AI Coach`; before that, `Oak – AI Battle Coach`); it now lives in Keywords so "ai coach" / "ai chat" still combine. `battle` stays in Keywords so "battle calculator" still combines with the subtitle. Everything below avoids re-spending characters on words already indexed by these two fields (Apple combines terms across App Name, Subtitle, and Keywords, and handles plurals automatically).

CF-UI-BR-1 asked the subtitle to say Pokémon Champions. That still loses to the trademark rule for **Pokémon**; **Champions** itself now lives in the App Name, which is the policy-compliant way to satisfy the spirit of that requirement.

## Deliberate tradeoff — read this first

All competitors below use "pokemon"/"pokedex" (and the official competition acronym "vgc") freely in their own metadata — those terms are almost certainly the highest-volume searches for this entire app category. By choosing to never use them in Oak's **name, subtitle, or keywords**, **Oak is giving up the top-of-funnel "pokemon team builder" / "pokedex" / "vgc" search traffic that every competitor captures.** This isn't an oversight — it's the explicit, agreed tradeoff for maximizing App Store review/approval odds over raw discoverability. Description copy still says Pokémon Champions because CF-INT-BR-10 requires the listing to describe Oak as a Champions coach, not a whole-franchise Dex.

The keyword strategy is generic mechanic vocabulary Oak can win on (team building, battle math, type coverage, Mega, live usage), plus the Champions identity now in the App Name. The differentiator remains: it's a **conversational AI that reasons and cites**, not a manual calculator you operate.

## Competitor analysis

The two closest competitors are direct functional matches — free companion apps for the same competitive battling audience. Both are **manual tools** (you drive the calculator/builder yourself); Oak's wedge is that you ask in plain English and it reasons, cites sources, and flags what's uncertain.

| App | What it is | Trademark posture | What to mirror | What NOT to mirror |
|---|---|---|---|---|
| **ChampDex** (id 6761497339, champdex.com) | Free. Live meta/usage rankings, team builder with **type-coverage** analysis + **speed-tier** checking + team audit, damage & speed calculators, unlimited saved teams, offline. Tuned for Pokémon Champions. Live store name is **ChampDex**; subtitle **Team Builder & Damage Calc**. Website uses "Pokémon Champions Companion". | Brand already says "Champ". Description names Pokémon Champions. | Feature vocabulary — **type coverage**, **speed (tiers)**, and **usage**. Nearest *positioning* rival. Oak's brand does **not** say Champions, so Oak puts it in the App Name instead. | Putting "Pokémon" in the store name. ChampDex doesn't either, on the live listing. |
| **BattleDex for Champions** (id 6771578016) | Team builder, damage calc, usage stats, matchup analysis. | **"for Champions" in the App Name**; description names Pokémon Champions; unofficial disclaimer. | Confirms "Champions" in the store name is shipping and review-acceptable without "Pokémon". | Its "Dex" framing. Oak is a coach, not a dex. |
| **VGC Helper** (id 1598784937, vgchelper.com) | Free. Team builder, damage calculator, **speed-ranking calculator**, live battle assistant, teams list, full Poképaste support, search by usage rankings. Subtitle: **Champions team builder**. | Uses **"VGC"** — the official Play! Pokémon Video Game Championships acronym — directly in its App Name. | Confirms "vgc" and "speed calculator" are live, approved, high-intent terms (informs the `vgc`-cede decision below). Subtitle is the exact phrase Oak's name+subtitle now combine into. | Its "VGC"-in-name and "Poképaste"-branded framing. Oak cedes "vgc" and refers to the paste format as the "Showdown text format." |
| **ProDex / Prokedex / Bulbapedia** (dex & wiki apps) | Reference/encyclopedia apps, not team-building tools. | Range from disclaimer-only (ProDex) to "Pokémon" in the App Name (Bulbapedia). | Disclaimer pattern only — Oak's ABOUT THIS APP paragraph still follows the unofficial-fan-app form. | Their category. Oak is not a National Dex / wiki app after Champions-first. |

## Tier 1 — must win (high relevance, core differentiators)

| Term | Where it's captured | Rationale | Competition |
|---|---|---|---|
| champions coach | **App Name** (exact phrase) | Product identity after Champions-first. Highest-weighted field. | Light-medium — BattleDex uses "for Champions"; few pair it with "coach" |
| champions team builder | **App Name `champions` × Subtitle "team builder"** (cross-field) | The query a ranked Champions player actually types. VGC Helper's subtitle is this phrase. | Medium |
| team builder | **Subtitle** (exact phrase) | Oak's most concrete, marketable feature (Champions sets, Showdown-format import/export with Stat Points in the EV fields) | Medium — every competitor has a builder, but few pair it with a reasoning chat |
| battle calculator | **Keywords `battle` × Subtitle "calculator"** (cross-field) | Matches Oak's damage/battle-math reasoning and the artifact-viewer calc. `battle` sat in the old App Name; it stayed in Keywords through the `Oak – AI Coach` rename. | Medium |
| type chart | Keywords `type` + `chart` | Common, well-understood search term for the type-matchup feature | Medium-heavy (generic reference apps win here too) |
| moveset | Keywords `moveset` | Direct match to the learnset/moveset-filtering capability | Light-medium |
| mega | Keywords `mega` | Champions gimmick (Mega Evolution only; no Tera). Replaces the old `tera` slot. | Light |

## Tier 2 — worth fighting for (long-tail, indie-winnable)

| Term | Where it's captured | Rationale |
|---|---|---|
| champions calculator | App Name `champions` × Subtitle `calculator` | Same cross-field pattern as "battle calculator", scoped to the game |
| damage calculator | Keywords `damage` × Subtitle `calculator` | Precise intent, light competition once de-branded from the trademark term |
| type coverage | Keywords `type` + `coverage` | A headline feature of both competitors' builders; high-intent |
| speed (tiers / calculator) | Keywords `speed` (× Subtitle `calculator`) | "Speed tier"/"speed calculator" is a core competitive workflow VGC Helper and ChampDex both lead with |
| type weakness | Keywords `type` + `weakness` | High-intent variant of the type-chart query ("weakness chart"), distinct from "coverage" |
| usage | Keywords `usage` | Live Champions ladder (Doubles default, Singles as a second view). Replaces the old `ev`/`iv` pair Oak no longer surfaces. |
| showdown import | Keywords `showdown` + `import` | Captures users bringing a team string in from a calculator/friend — Stat Points ride in the EV fields |
| ai chat / ai coach | Keywords `ai` + `chat` × App Name `coach` | Oak's category-defining differentiator (cited reasoning vs. plain lookup). `ai` moved here from the old App Name. |

## Tier 3 — cede (don't waste field space)

| Term | Why cede |
|---|---|
| **vgc** | Highest-value term Oak *could* use but is ceding. Official Play! Pokémon acronym — more franchise-official than the fan-made "Showdown" format Oak does keep. **If you decide the approval risk is acceptable, this is the first term to add back** (~3 chars). |
| tera / ev / iv | Mainline knobs Oak no longer surfaces after Champions-first. Dropped from Keywords in 1.2. |
| reasoning | Dropped from Keywords when `ai` moved in from the App Name. Still in the Description. Search volume is low next to "ai chat". |
| dex / pokedex-style terms | Excluded by the trademark policy — see the tradeoff note above. |
| creature collector | Generic genre term, heavy competition from non-Pokémon monster-collecting games; too broad to win. |
| game guide | Dominated by large multi-title guide apps; not a fight worth picking. |

## iOS Keyword field — literal string (91 / 100 chars)

```
type,chart,weakness,coverage,moveset,damage,mega,speed,battle,showdown,import,ai,chat,usage
```

Notes on construction:
- No spaces after commas (each saved character matters at this budget).
- Singular forms only (`moveset` not `movesets`) — Apple matches plurals automatically.
- **Deliberately omits every word already indexed via the App Name (`Oak – Champions Coach` → `oak`, `champions`, `coach`) or Subtitle (`Team Builder & Calculator` → `team`, `builder`, `calculator`)** so no field space is wasted on duplication.
- **1.2 Champions-first delta:** dropped `ev`, `iv`, `tera`; added `mega` and `usage`. `battle` and `chat` stay from the 1.1 rename.
- **Store-name rename (`Oak – AI Coach` → `Oak – Champions Coach`):** moved `ai` into Keywords (next to `chat`); dropped `reasoning` to make room. 9 characters unused.
- Adjacent placement of `type`/`chart`/`weakness`/`coverage` lets Apple's auto-combination produce "type chart", "type weakness", "type coverage" alongside cross-field combinations with the Subtitle ("team builder", "battle calculator", "damage calculator", "speed calculator") and the App Name ("champions team builder", "champions calculator", "ai coach").
- `showdown` refers to the third-party Showdown battle-simulator text format (a Smogon-community convention, not a Nintendo trademark) — kept because it's the literal name of the import/export format Oak's team builder still supports.

## Google Play guidance

Play Store listing is deferred for Android v1 (see `docs/features/android-app/`). Do not paste this iOS keyword string into Play; Google indexes visible title/short/full description instead, and that copy has not been written yet.
