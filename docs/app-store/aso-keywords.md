# Oak — ASO Keyword Research (iOS)

**Scope:** iOS only (no Android target exists in this repo). **Trademark policy:** no use of the words "Pokémon"/"Pokédex" anywhere in the App Name, Subtitle, or Keywords field — every term below is generic genre/mechanic vocabulary. (The Description in `ios.md` is allowed exactly one disclaimer-paragraph mention, per the agreed trademark policy.)

## App Name + Subtitle (the indexed pair this strategy is built around)

- **App Name:** `Oak – AI Coach` (13/30) → indexes `oak`, `ai`, `coach`.
- **Subtitle:** `Team Builder & Calculator` (25/30) → indexes `team`, `builder`, `calculator`.

The bare name "Oak" was taken in the App Store; the descriptor makes the store name unique and fills Apple's most heavily-weighted field. `battle` used to live in the name (`Oak – AI Battle Coach`); it now lives in Keywords so "battle calculator" still combines with the subtitle. Everything below avoids re-spending characters on words already indexed by these two fields (Apple combines terms across App Name, Subtitle, and Keywords, and handles plurals automatically).

## Deliberate tradeoff — read this first

All competitors below use "pokemon"/"pokedex" (and the official competition acronym "vgc") freely in their own metadata — those terms are almost certainly the highest-volume searches for this entire app category. By choosing to never use them anywhere in Oak's discoverable metadata, **Oak is giving up the top-of-funnel "pokemon team builder" / "pokedex" / "vgc" search traffic that every competitor captures.** This isn't an oversight — it's the explicit, agreed tradeoff for maximizing App Store review/approval odds over raw discoverability. The strategy below is built entirely around the generic mechanic vocabulary Oak can win on instead (team building, battle math, type coverage, speed tiers, format-specific reasoning), which doubles as Oak's genuine differentiator: it's a **conversational AI that reasons and cites**, not a manual calculator you operate.

## Competitor analysis

The two closest competitors are direct functional matches — free companion apps for the same competitive battling audience. Both are **manual tools** (you drive the calculator/builder yourself); Oak's wedge is that you ask in plain English and it reasons, cites sources, and flags what's uncertain.

| App | What it is | Trademark posture | What to mirror | What NOT to mirror |
|---|---|---|---|---|
| **ChampDex — Pokémon Champions Companion** (id 6761497339, champdex.com) | Free. Live meta/usage rankings, team builder with **type-coverage** analysis + **speed-tier** checking + team audit, damage & speed calculators (STAB, spread, crits, weather, items, status, stat stages), unlimited saved teams, offline. Tuned for the Champions format. | Uses **"Dex"** and **"Pokémon Champions"** openly in its App Name and marketing. | Its feature vocabulary — **type coverage** and **speed (tiers)** are concrete, searchable terms Oak supports and the old keyword set omitted. They're now in Oak's Keywords field. This is Oak's nearest *positioning* rival: a Champions-format companion = exactly Oak's Champions mode. | Its trademark use in the name. Oak's policy is stricter (disclaimer-only). |
| **VGC Helper** (id 1598784937, vgchelper.com) | Free. Team builder, damage calculator, **speed-ranking calculator**, live battle assistant, teams list, full Poképaste support, search by usage rankings. | Uses **"VGC"** — the official Play! Pokémon Video Game Championships acronym — directly in its App Name. | Confirms "vgc" and "speed calculator" are live, approved, high-intent terms in this category (informs the `vgc`-cede decision below). | Its "VGC"-in-name and "Poképaste"-branded framing. Oak cedes "vgc" (see Tier 3) and refers to the format generically as the "Showdown text format." |
| **ProDex / Prokedex / Bulbapedia** (dex & wiki apps) | Reference/encyclopedia apps, not team-building tools. | Range from disclaimer-only (ProDex) to "Pokémon" in the App Name (Bulbapedia). | Kept only as the **trademark-pattern reference** — ProDex's "trademark confined to one disclaimer paragraph" pattern is the one Oak's Description follows. | Their category — they're dex/lookup apps, not Oak's competitors. Oak should not position against or borrow keywords from static encyclopedias. |

## Tier 1 — must win (high relevance, core differentiators)

| Term | Where it's captured | Rationale | Competition |
|---|---|---|---|
| team builder | **Subtitle** (exact phrase) | Oak's most concrete, marketable feature (full competitive sets, Showdown-format import/export) | Medium — every competitor has a builder, but few pair it with a reasoning chat |
| battle calculator | **Keywords `battle` × Subtitle "calculator"** (cross-field) | Matches Oak's damage/battle-math reasoning and the artifact-viewer calc. `battle` sat in the old App Name; it moved here when the store name became `Oak – AI Coach`. | Medium |
| type chart | Keywords `type` + `chart` | Common, well-understood search term for the type-matchup feature | Medium-heavy (generic reference apps win here too) |
| moveset | Keywords `moveset` | Direct match to the learnset/moveset-filtering capability | Light-medium |
| tera | Keywords `tera` | Current-gen mechanic Oak's builder and reasoning fully support; lower competition since it's recent | Light |

## Tier 2 — worth fighting for (long-tail, indie-winnable)

| Term | Where it's captured | Rationale |
|---|---|---|
| damage calculator | Keywords `damage` × Subtitle `calculator` | Precise intent, light competition once de-branded from the trademark term |
| type coverage | Keywords `type` + `coverage` | A headline feature of both competitors' builders; high-intent and previously missing from Oak's set |
| speed (tiers / calculator) | Keywords `speed` (× Subtitle `calculator`) | "Speed tier"/"speed calculator" is a core competitive workflow VGC Helper and ChampDex both lead with |
| type weakness | Keywords `type` + `weakness` | High-intent variant of the type-chart query ("weakness chart"), distinct from "coverage" |
| ev iv calculator | Keywords `ev` + `iv` × Subtitle `calculator` | Specific competitive-breeding/stat search; Oak's builder covers EVs/IVs explicitly |
| showdown import | Keywords `showdown` + `import` | Captures users bringing a team string in from a calculator/friend — a frequent real workflow |
| regulation format | *(dropped from Keywords in 1.1 to free `battle`)* | Still a real feature; not worth 10 keyword characters once `battle` had to come back. |
| reasoning / ai chat | Keywords `reasoning` + `chat` × App Name `ai` | Oak's category-defining differentiator (cited reasoning vs. plain lookup). `chat` is now indexed explicitly. |

## Tier 3 — cede (don't waste field space)

| Term | Why cede |
|---|---|
| **vgc** | The single highest-value term Oak is *able* to use but is ceding. "VGC" is the official Play! Pokémon Video Game Championships acronym — more franchise-official than the fan-made "Showdown" format Oak does keep. Under the conservative trademark policy it's left out, even though VGC Helper (id 1598784937) ships it live in its App Name. **If you decide the approval risk is acceptable, this is the first term to add back** — it's ~3 chars and high-intent. Flagged here so the call is yours, not silently made. |
| dex / pokedex-style terms | Excluded by the trademark policy — see the tradeoff note above. |
| creature collector | Generic genre term, heavy competition from non-Pokémon monster-collecting games; too broad to win. |
| game guide | Dominated by large multi-title guide apps; not a fight worth picking. |

## iOS Keyword field — literal string (98 / 100 chars)

```
type,chart,weakness,coverage,moveset,damage,ev,iv,tera,speed,battle,showdown,import,reasoning,chat
```

Notes on construction:
- No spaces after commas (each saved character matters at this budget).
- Singular forms only (`stat`→ omitted, `moveset` not `movesets`) — Apple matches plurals automatically.
- **Deliberately omits every word already indexed via the App Name (`Oak – AI Coach` → `oak`, `ai`, `coach`) or Subtitle (`Team Builder & Calculator` → `team`, `builder`, `calculator`)** so no field space is wasted on duplication.
- **1.1 rename delta:** added `battle` (left the App Name) and `chat`; dropped `regulation` to stay under 100.
- Adjacent placement of `type`/`chart`/`weakness`/`coverage` lets Apple's auto-combination produce "type chart", "type weakness", "type coverage" alongside cross-field combinations with the Subtitle/Keywords ("team builder", "battle calculator", "damage calculator", "speed calculator", "ev iv calculator").
- `showdown` refers to the third-party Showdown battle-simulator text format (a Smogon-community convention, not a Nintendo trademark) — kept because it's the literal name of the import/export format Oak's team builder supports.

## Google Play guidance

Not applicable — Oak's iOS app has no Android counterpart in this repo, so there is no Google Play listing to optimize.
