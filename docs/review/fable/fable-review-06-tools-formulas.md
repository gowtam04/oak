# 06 · Agent tools (T1–T17) & battle-math formulas

[← back to index](fable-review.md) · **Date:** 2026-07-02 · **Commit:** 17adece · **Auditor:** Claude Fable 5

**Scope:** `web/src/agent/tools/**` (all 17 tools + `submit-builder-answer` + `index.ts` dispatch), `web/src/agent/formulas/**` (compute-stat, estimate-damage, natures, type-chart), `web/src/agent/schemas.ts` (the Zod source of truth).

**Area health:** The tool contract is **mostly honored** — no tool lets an args-parse failure or unknown tool name escape `dispatch`, and the mainline stat/damage formulas match the documented Gen 5+ per-step-floor math with an independent oracle test. The recurring theme is **incomplete input bounding and error-contract coverage**: repos only guard their first DB call (so the "never throw in-domain" promise leaks), model-supplied strings hit unescaped LIKE patterns, and the most-used tool has no array-size caps. None is individually severe; together they're the tool layer's soft spots.

**Findings in this area:** 9 (Medium 4 · Low 3 · Info 2)

## Findings

### TOOL-01 · Medium · Repos only try/catch their FIRST DB call, so later queries throw past the "never throw in-domain" contract

- **Dimension:** correctness (+ contract violation)
- **Location:** `web/src/data/repos/pokedex-repo.ts:298-389` (`queryPokedex`) · related: `pokedex-repo.ts:454-458`, `reference-cache.ts:149-152`, `learnset-repo.ts:100-150`, backstopped by `runtime.ts:1228-1250`
- **What's wrong:** Read paths wrap only their first query (the `ingest_meta`/existence probe) in try/catch, then return a structured miss. Every later query is unguarded: `queryPokedex` runs `collectUnresolved`, the count, and the rows query bare; `getPokemon` calls `suggestionsFor` *outside* the try on every miss; `getReference` calls `suggestSlugs` outside the try; `gen9LearnerCount`/`movesForPokemon` have no try at all.
- **How it fails:** Any transient Postgres error (or a partially-applied migration where some tables exist and others don't) landing on the second-or-later query throws past the tool layer. Hit on ordinary "not found" misses and on every `query_pokedex` call once the cheap probe succeeded.
- **Why it matters:** The runtime backstop ([AI-05](fable-review-05-ai-runtime.md#ai-05)) catches it and returns `tool_error` — but that shape isn't in any tool's documented output union, so the model gets an undocumented shape, and each tool's docstring claims it "never throws in-domain" when that only holds for the first query.
- **Recommendation:** Wrap each repo function's whole body in one try/catch degrading to its documented miss/unavailable shape, or a shared helper covering every DB call in the chain.
- **Confidence:** high

### TOOL-02 · Medium · Model-supplied strings reach ILIKE patterns with unescaped LIKE wildcards

- **Dimension:** security
- **Location:** `web/src/data/repos/pokedex-repo.ts:417` · related: `reference-cache.ts:102`, and the unbounded `z.string()` name fields at `schemas.ts:236-238,278-281,310-312,331-333,375-377,409-411`
- **What's wrong:** `suggestionsFor`/`suggestSlugs` interpolate the caller-supplied string between `%` signs with no escaping of `%`/`_`. The feeding tool schemas are plain `z.string()` with no length/charset restriction. Same root cause as [DATA-04](fable-review-01-data-ingest.md#data-04).
- **How it fails:** A name with a literal `%` becomes a wildcard; worst case a lone `%` matches every row of that kind/format, returning the first 5 alphabetically as "close" suggestions. **Not** SQL injection — Drizzle binds the value; only LIKE semantics drift.
- **Why it matters:** Small blast radius (read-only, limit 5, public data), but exactly the wildcard-into-LIKE pattern the review targets, duplicated across two files.
- **Recommendation:** Escape `%`/`_`/escape-char with an explicit `ESCAPE` clause (reuse `conversation-repo`'s `likePattern()`); add a max length to the input schemas.
- **Confidence:** high

### TOOL-03 · Medium · `query_pokedex`'s types/abilities/moves arrays are uncapped and validated with sequential per-slug DB round-trips

- **Dimension:** security (DoS) (+ architecture)
- **Location:** `web/src/agent/schemas.ts:192-202` · related: `pokedex-repo.ts:249-265,208-241`
- **What's wrong:** `types`/`abilities`/`moves` are optional string arrays with no `.max()` (unlike `limit`, capped 1–100). `collectUnresolved` validates each slug with its own `await` in a `for` loop — array length maps 1:1 to sequential Postgres round-trips.
- **How it fails:** A `query_pokedex` call with a few thousand strings in `abilities` drives thousands of sequential single-row SELECTs before returning, holding a connection and inflating latency/cost.
- **Why it matters:** This is the workhorse tool, uncapped where every other list input is capped.
- **Recommendation:** Cap the arrays (~20) and batch validation into one `inArray` existence query per category.
- **Confidence:** medium

### TOOL-04 · Medium · Champions-mode stat formula and its tool branch have zero test coverage

- **Dimension:** maintainability (testing)
- **Location:** `web/src/agent/formulas/compute-stat.ts:160-206` (`computeStatChampions`) · related: `compute-stat.tool.ts:46-48`, `tools-formulas.oracle.test.ts`
- **What's wrong:** The mainline formulas have a hand-derived oracle test; `computeStatChampions` — its own docstring calls it "the single source of truth for Champions stat math," shared by the tool AND the team artifact's client-side readout — has no test. `natureEffectFor` and `combineDefensive` are also untested as pure units.
- **How it fails:** A regression in the Champions SP-based formula ships silently — and Champions is the **default** scope for new conversations.
- **Why it matters:** Wrong numbers in the default mode's user-facing damage/stat answers with no automated signal.
- **Recommendation:** Add an oracle test for `computeStatChampions` mirroring the existing style, plus unit tests for `natureEffectFor` and `combineDefensive`.
- **Confidence:** high

### TOOL-05 · Low · `estimate_damage`/`compute_stat` schemas have no upper bound on level/power/stat magnitudes

- **Dimension:** correctness
- **Location:** `web/src/agent/schemas.ts:575-583` · related: `:546-553`, `estimate-damage.ts:109-121`
- **What's wrong:** `computeStat` bounds level 1–100, but `estimateDamage.level` has only a default of 50 (no min/max) and `power`/`attack_stat`/`defense_stat` are unbounded above their floor checks.
- **How it fails:** An absurdly large level/stat produces internally-consistent but game-nonsensical damage with no `invalid_input`.
- **Why it matters:** Can't crash anything; cheap to fix given the sibling tool already does it.
- **Recommendation:** Bound level 1–100 and add upper caps to power/stats in both the schema and the formula guard.
- **Confidence:** high

### TOOL-06 · Low · `computeStatChampions` silently clamps out-of-range Stat Points instead of returning `invalid_input`

- **Dimension:** architecture (consistency)
- **Location:** `web/src/agent/formulas/compute-stat.ts:170-171`
- **What's wrong:** Every other numeric input in the file is validated + rejected out of range; Champions mode silently clamps the SP value via `Math.min/max` with no error path.
- **How it fails:** Passing `ev:252` (standard max) silently clamps to 32, visible only in the returned breakdown text.
- **Why it matters:** Inconsistent error style within one file.
- **Recommendation:** Surface a `clamped:true` field, or return `invalid_input` for out-of-range ev in Champions mode.
- **Confidence:** medium

### TOOL-07 · Low · `list_teams`' read-fault fallback is indistinguishable from a genuine empty result

- **Dimension:** correctness
- **Location:** `web/src/agent/tools/list-teams.tool.ts:44-66`
- **What's wrong:** On any error the catch returns `{signed_in:true, teams:[]}` — identical to a user with zero saved teams.
- **How it fails:** A transient DB fault makes the model tell the user they have no teams when they do.
- **Why it matters:** Low severity, narrow window, deliberate fallback — but trades correctness for simplicity.
- **Recommendation:** Return a distinguishable shape for the fault case so the prompt can hedge.
- **Confidence:** medium

### TOOL-08 · Info · `get_type_matchups`' two-type result never distinguishes 4× from 2×

- **Dimension:** architecture
- **Location:** `web/src/agent/formulas/type-chart.ts:42-65` · related: `schemas.ts:347-362` (`quad_weak_to`/`quad_resists` exist but are only filled by the artifact assembler)
- **What's wrong:** `combineDefensive` buckets any `>1` into `weak_to` and any `<1` into `resists`, no magnitude. The `quad_*` schema fields aren't populated by this tool.
- **Why it matters:** Confirmed intentional (comment + fixture), so Info — but the model relying on the combined result can't tell a severe 4× weakness from an ordinary 2×.
- **Recommendation:** Populate `quad_weak_to`/`quad_resists` in the tool, or note in the tool description to fetch single types when magnitude matters.
- **Confidence:** high

### TOOL-09 · Info · `estimate_damage` uses per-step floor, not Gen 5+ fixed-point rounding

- **Dimension:** correctness
- **Location:** `web/src/agent/formulas/estimate-damage.ts:70-82` · related: `design.md:211` (D5)
- **What's wrong:** Real in-game modifier math is fixed-point round-half-up/down, not plain floor after each step.
- **Why it matters:** Explicitly the documented design (D5) and the tool is labeled an estimate — not a defect vs spec. For boundary modifiers, true damage can be 1 point higher.
- **Recommendation:** No action unless bit-perfect damage becomes a product goal (a spec change).
- **Confidence:** medium

## Also worth knowing

`resolve-index.ts`'s fuzzy matcher is in-memory (no SQL), so it's not exposed to the LIKE-semantics class of TOOL-02/DATA-04 — but it is the cache with the staleness bug in [DATA-03](fable-review-01-data-ingest.md#data-03).
