# Grok 4.6 vs Grok 4.3 — quality-to-cost bake-off

**Date:** 2026-09-06 / 2026-09-07  
**Harness:** `web/eval/run.ts --model=… --json` with per-turn token capture (`JudgeResult.usage`)  
**Judge:** Claude, both sides  
**Agent knobs:** identical (`effort: "low"`, `temperature: 0.2`, same prompt, same 21 tools, live local index)  
**Raw JSON:** `full-grok-4.6.json`, `full-grok-4.3.json`  
**Tables:** `full-comparison.md` (61 cases), `smoke-comparison.md` (16-case scout)

## Verdict

**Stay on Grok 4.6 as the production default.** 4.3 is about **65% cheaper per eval turn** and **~2× faster**, but it is **not** as good at the work Oak actually added in v2 (wiki locations, forms, fuzzy resolution). You would be giving up a real, concentrated quality slice for ~$28/month at today’s traffic.

4.3 *is* smart enough for typed lookups, battle math, and policy declines. It even beat 4.6 on the G58 type-combo incident. It is **not** smart enough if users ask “where do I get HM Fly”, “Rotom’s forms”, “Pokémon based on cats”, or a misspelled move name.

If xAI spend is the constraint that just exhausted the previous key, 4.3 is a defensible **fallback**, not an upgrade.

## 1. Cost

### List prices (xAI, <200k prompt)

| | Input / 1M | Cached input / 1M | Output / 1M |
|---|---|---|---|
| Grok 4.6 | $2.00 | $0.50 | $6.00 |
| Grok 4.3 | $1.25 | $0.20 | $2.50 |

Thinking is a subset of output on xAI — not billed twice. Cached input is a subset of input.

### Production traffic (`turn_record` on oak-gowtam)

| | Grok 4.3 | Grok 4.6 |
|---|---|---|
| Turns | 178 | 230 |
| Window | 2026-07-01 → 07-09 | 2026-08-13 → 09-07 |
| avg input / cached / output | 75,969 / 0* / 2,177 | 243,868 / 208,519 / 3,541 |
| p50 input | 47,712 | 250,040 |

\*4.3 rows predate `cached_input_tokens` recording. 4.6’s prompt is also much larger (oak-v2 tools + warehouse DDL).

**Reprice today’s 4.6 mix at 4.3 rates** (uncached = input − cached):

| | Uncached in | Cached in | Output | **$ / turn** |
|---|---|---|---|---|
| Stay on 4.6 | 35,349 × $2 | 208,519 × $0.50 | 3,541 × $6 | **$0.196** |
| Same tokens on 4.3 | 35,349 × $1.25 | 208,519 × $0.20 | 3,541 × $2.50 | **$0.095** |

52% cheaper **if token counts stay equal**. At ~9 turns/day: **~$54/month on 4.6 vs ~$26 on 4.3 (~$28 saved)**.

### Measured on the 61-case suite (tokens were *not* equal)

| | grok-4.6 | grok-4.3 |
|---|---|---|
| $ / run | $0.0808 | **$0.0280 (−65%)** |
| mean tool calls | 4.26 | **3.49** |
| mean latency | 29.3s | **14.9s** |
| suite agent $ | $4.93 | $1.71 |

4.3 did **not** need extra tokens to keep up. It used fewer tools and finished faster. The sticker discount survived contact with the tool loop.

## 2. Quality — full golden suite (G1–G61, 1 run each)

Harsh `overallPass` requires structural substrings (`"immune"`, `"dragon"`) **and** every rubric dimension ≥ 1. Correctness (0–2) is the better quality signal.

| metric | grok-4.6 | grok-4.3 |
|---|---|---|
| overall pass | **33/61 (54%)** | 25/61 (41%) |
| daily pass | **68%** | 50% |
| hard pass | **37%** | 30% |
| mean correctness | **1.49** | 1.18 |
| mean inference / mechanics / scope / transparency | **1.72 / 1.77 / 1.74 / 1.57** | 1.54 / 1.61 / 1.59 / 1.28 |
| correctness wins (4.6 vs 4.3 vs tie) | **17** | 4 | 40 |
| both scored correctness = 2 | 29 | 29 |

Smoke (16 hard-weighted cases) had made 4.3 look *better*. The full suite reverses that: smoke over-sampled SQL (where 4.3 is strong) and under-sampled wiki/forms/typos.

### Where 4.6 is actually smarter

These are product-visible, not citation-format nits:

| Case | 4.6 | 4.3 | What 4.3 did |
|---|---|---|---|
| **G3** Will-o-Whisp typo | corr 2, asked | corr 0, **answered 146 Pokémon** | Must not invent a list on a misspelling |
| **G59** Rotom forms | all six + types | corr 0, **“no data”** | Form-awareness regression |
| **G29** Pikachu signature moves | defined + counted | corr 0 | Didn’t do the exclusivity query |
| **G33** cat-based Pokémon | listed, flagged inference | corr 0, **declined**, never called `search_wiki` | |
| **G42** populous cities | flagged ill-defined | corr 0, treated flavor numbers as precise | |
| **G54** Feebas Gen 3 | tile mechanic | corr 0, gave up | |
| **G30** HM Fly in HG | partial (missed Route 36) | corr 0, gave up | |
| **G23** catch-location after “ignore rules” | answered in-scope | corr 0, treated as jailbreak | |
| **G5 / G8** combined filters | mostly-right lists | more fabricated/wrong species | |

Wiki/forms/fuzzy-match is the 4.6 gap. That is most of oak-v2.

### Where 4.3 wins or ties

| Case | Winner | Note |
|---|---|---|
| **G58** missing type combos (prod incident) | **4.3 (corr 2 vs 0)** | 4.3 ≈17; 4.6 answered **9** |
| **G44** catch rate > pre-evo | 4.3 slightly | more complete pair list |
| **G21** catch Gible | 4.3 (corr 2 vs 0) | 4.6 declined a now-in-scope location question; case file still smells like the old decline |
| **G7** Attack > 130 | 4.3 | **4.6 hit the 180s turn deadline and abstained** |
| G4 Fake Out / Armor Tail | tie, both 2 | |
| G15 Garchomp Speed = 169 | tie, both 2 | |
| G35 Fire Fang “Gen 3 bug” | tie, both 2 | |
| G38–G41, G48, G50–G52 media/off-domain | tie, both 2 | |
| G55 Eevee evo in Champions | tie, both 2 | |
| G60 Gen 1 top 3 BST | both 0 | still broken on both |
| G61 Mega Kangaskhan box | both 0 | still broken on both |

Typed competitive Oak (stats, type chart, items, policy declines) is a **tie**. Whole-games Oak is not.

## 3. Smoke vs full — why the scout lied

The 16-case scout was loaded with SQL/mechanics (G58, G60, G4, G25) and light on wiki. 4.3 won G58 and looked cheaper-and-better. The full suite added G3, G29, G33, G42, G54, G59 — exactly the retrieval/forms work 4.3 drops.

Scout cost (−54% / run) matched the full suite (−65% / run). Cost was never the noisy part. Quality sampling was.

## 4. Decision

| Question | Answer |
|---|---|
| Is 4.3 smart enough for *most* Oak tasks? | For **typed dex / math / declines**, yes. For **wiki, forms, typos, locations**, no. |
| A lot of quality for little cost reduction? | **No.** Quality drop is real and concentrated. Dollar drop is **large in percent, small in cash** (~$28/month). |
| Switch the production default? | **No.** Keep 4.6. |
| When would you flip to 4.3? | xAI spend cap / credit exhaustion, and you accept worse location/form/typo answers. Admin → Settings, no deploy. |

Shared failures to fix regardless of model: **G60** (Gen 1 BST scope leak), **G61** (keep Mega Kangaskhan + warn), **G8** (filter roster still sloppy). Those are prompt/tool bugs, not a reason to pay for 4.6.

## 5. Harness notes

- `JudgeResult.usage` now sums `onTurnComplete` traces (input, cached, output, thinking).
- `eval/bakeoff-cost.ts` prices Grok the way the invoice does (cached subset of input; thinking subset of output).
- `npx tsx eval/compare-bakeoff.ts left.json right.json` reprints the tables above.
- Local wiki corpus is thin (794 chunks). Wiki cases are noisy for **both** models; 4.6 still *tried* `search_wiki` where 4.3 often declined.
- One run per case, no `--repeat`. Treat single-run diffs as directional; G58 reproduced (4.3 pass on smoke **and** full).
