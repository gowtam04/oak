# Team-from-Box — Technical Design

Mode: PM
Budget Tier: hobby

Main-chat agent changes only: detect a **box-build** (pasted owned list / “make
a party from these,” English or Korean), run a **short loop** (iteration cap
6), look up the whole list through one new appended tool **`lookup_box`**,
**never drop named-for-party species**, and emit a `proposed_team` drawn from
that box. `run_sql` / `search_wiki` stay in the advertised tool list (prompt
cache) but are **dispatch-denied** on box-build turns. No Teams-page UI. No
schema migration.

Companion to `spend-controls` (disjoint files; can ship in parallel).

## Requirements Reference

`docs/features/team-from-box/requirements/requirements.md`
(BOX-US-1..5, BOX-AC-*, BOX-BR-1..11)

## Tech Stack

Existing agent loop, Zod tool schemas, Drizzle repos. No new packages. Tool
barrel remains **append-only**: T22 `lookup_box` after `get_meta_usage`.

## Data Model

No new tables.

### Additive warning code

`web/src/data/teams/team-schema.ts` `warningCodeSchema` gains
**`learnset_unavailable`** (soft — **not** in `HARD_VIOLATION_CODES`). Message
example: `Learnset unavailable for this form in this scope; species kept because you named it.`

Existing `species_illegal` remains for “not in this scope’s roster” but on a
**box-build** the runtime treats it as **soft** for named-for-party members
(BOX-BR-2/9) instead of hard-rejecting the whole `proposed_team`.

## Component Design

### 1. Box-build classifier (`isBoxBuildMessage`)

- **Responsibility:** Decide whether this user message (plus optional prior
  user messages in the thread) is a box-build. Loop guard, not prompt-only
  (BOX-BR-1, BOX-AC-3.3).
- **Location:** `web/src/agent/runtime.ts` next to `isTeamBuildMessage`, plus a
  **pure helper module** `web/src/agent/box-build.ts` so it can be unit-tested
  without the loop.
- **Precedence:** if box-build matches, it **wins** over roster and full
  team-build (BOX-BR-1). `maxIterations = MAX_ITERATIONS_BOX_BUILD` (6).
- **Does not** talk to the DB or the dex. Name extraction is heuristic
  (comma/newline lists of Latin species tokens + Korean party verbs). False
  positives on a 20-name paste are the point; false positives on “what does
  Gengar learn?” must stay false (BOX-AC-4.1).

### 2. T22 `lookup_box`

- **Responsibility:** One tool call looks up up to 40 names: profile +
  **compact** legal moves (≤16 per species), or a miss with suggestions.
  Server-side loop over existing pokedex/learnset/reference repos — **not** N
  model iterations (BOX-AC-3.2).
- **Location:** `web/src/agent/tools/lookup-box.ts` + compact helper
  `web/src/agent/tools/compact-learnset.ts` (pure).
- **Appended** on `tools[]`, `TOOL_NAMES`, `toolInputJsonSchemas`, dispatch map.
- **Voice:** admitted (fast DB read, like `get_learnset`). Not in
  `VOICE_EXCLUDED_TOOLS`.
- **Teams assistant:** **not** added in v1 (BOX out of scope for the embedded
  builder UI).

### 3. Runtime box-build path

When `isBoxBuildMessage`:

1. `maxIterations = 6`; submit nudge at remaining 2 with box-specific text
   (“submit `proposed_team` from the box; do not drop named species”).
2. `dispatch` wrapper: `run_sql` and `search_wiki` return
   `{ error: "forbidden_on_box_build" }` **without** executing (BOX-AC-3.1).
   Advertised `tools` array stays the full 21-tool list so the cached prefix
   is unchanged (BOX-AD-2).
3. Hard-reject filter: for members whose species is in the extracted box /
   named-for-party set, **do not** hard-reject on `species_illegal`,
   `move_not_in_learnset`, or `learnset_unavailable`. Still hard-reject
   `duplicate_species` / `duplicate_item` / `item_illegal` /
   `ability_not_for_species` if those slots are filled with illegal values
   the model invented (not “missing data”).
4. `legalizeTeam` on give-up: pass `{ keepSpecies: slug[] }` so legalize
   **never replaces or drops** those species; it may empty illegal moves
   (incomplete + learnset_unavailable warnings) instead (BOX-BR-9).

### 4. Prompt (`domain.ts`)

New **Box-build** section **above** the existing full-build sequence. Teaches:
use `lookup_box` once; members only from the list; keep named mons with
warnings; no `run_sql`/`search_wiki`; no per-species `get_learnset` on this
path; `get_learnset` remains the full-movepool tool for “what can X learn?”
(BOX-BR-5/6/7). Pin in `style.test.ts`.

### 5. Clients

No new UI. Existing `proposed_team` + warning badges must render
`learnset_unavailable` (web `ProposedTeamCard`, iOS/Android
`Markdown`/`team` warning views). If a client already maps unknown warning
codes to the `message` string, that is enough.

## API Design

No new HTTP routes. Tool I/O is the contract.

### `lookup_box` input (Zod, `schemas.ts`)

```ts
{
  names: z.array(z.string().min(1)).min(1).max(40)
}
```

Extra names beyond 40 are ignored; the output includes `truncated_input: true`.

### `lookup_box` output

```ts
{
  format: string;           // active formatForMode(ctx.mode)
  truncated_input: boolean;
  results: Array<
    | {
        query: string;
        found: true;
        pokemon: PokemonProfile; // existing get_pokemon hit shape
        learnset: {
          available: boolean;
          count: number;         // full legal-move count (0 if unavailable)
          truncated: boolean;    // true if compact_moves.length < count
          compact_moves: Array<{
            slug: string;
            method: string | null;
            type: string | null;
            category: string | null; // "physical" | "special" | "status"
            power: number | null;
          }>;                    // length ≤ 16
        };
      }
    | {
        query: string;
        found: false;
        suggestions: string[];
        exists_in_standard?: boolean; // champions-miss flag, same as get_pokemon
      }
  >;
}
```

Never throws in-domain. A species that exists but has an empty learnset is
`found: true` with `learnset.available: false` (this is the Mega Kangaskhan
case — **not** a miss).

### Compact-move selection (`compact-learnset.ts`)

Pure function `compactMoves(entries: FullMove[]): CompactMove[]`:

1. Input: every legal learnset slug joined to reference-cache move detail
   (type, category, power). Missing detail → still include slug+method with
   nulls.
2. Partition: STAB is **not** known here (compact is species-agnostic except
   we pass the species types in). Signature:
   `compactMoves(moves, speciesTypes: string[]): CompactMove[]`
3. Take, in order, until 16:
   - up to 6 damaging moves whose `type` is in `speciesTypes`, highest `power`
   - up to 6 other damaging, highest `power`
   - up to 4 status, preferring `protect`, `substitute`, `recover`, `wish`,
     `stealth-rock`, `spikes`, `defog`, `u-turn`, `volt-switch` if present,
     else first status by slug
4. Dedupe by slug, preserve that priority order.
5. `truncated = count > compact.length`.

`get_learnset` is **unchanged** (full list) for BOX-BR-7.

## File Structure

**Create**

- `web/src/agent/box-build.ts` — `isBoxBuildMessage`, `extractBoxNames`,
  `namedForParty(names, message)`
- `web/src/agent/box-build.test.ts`
- `web/src/agent/tools/lookup-box.ts`
- `web/src/agent/tools/lookup-box.oracle.test.ts` (fixture DB)
- `web/src/agent/tools/compact-learnset.ts`
- `web/src/agent/tools/compact-learnset.test.ts`

**Modify**

- `web/src/agent/schemas.ts` — input/output Zod, `TOOL_NAMES` append
  `lookup_box`, `toolInputJsonSchemas`
- `web/src/agent/schemas.test.ts`
- `web/src/agent/tools/index.ts` — append tool, dispatch (optional box-build
  deny is in runtime, not here)
- `web/src/agent/runtime.ts` — cap 6, dispatch deny, hard-reject filter,
  legalize keepSpecies, nudge
- `web/src/agent/runtime.test.ts`
- `web/src/server/teams/legalize-team.ts` — `keepSpecies?: string[]`
- `web/src/server/teams/legalize-team.test.ts` (or existing test file)
- `web/src/data/teams/team-schema.ts` — `learnset_unavailable`
- `web/src/agent/prompts/domain.ts` — Box-build section
- `web/src/agent/prompts/style.test.ts` — pins `lookup_box` routing, “do not
  drop”, no run_sql on box-build
- `docs/agent-design/tools.md` — T22 contract (append-only doc)
- `eval/` golden (or deterministic case) for missing-learnset keep

**Do not modify:** Teams page, Teams Assistant tool list, `get_learnset.ts`
behavior, `MAX_ITERATIONS` / `MAX_ITERATIONS_TEAM_BUILD` values for non-box
turns (BOX constraints: “non-box team-builds stay on 20/28”).

## Interface Definitions

```ts
/** Box-build iteration cap (BOX-AC-3.3). */
export const MAX_ITERATIONS_BOX_BUILD = 6;
export const SUBMIT_NUDGE_REMAINING_BOX_BUILD = 2;

/**
 * True when this turn is a box-build.
 * `historyTexts` = prior **user** message strings in the thread (for follow-ups).
 */
export function isBoxBuildMessage(
  message: string,
  historyTexts?: string[],
): boolean;

/** Latin species-like tokens from a comma/newline list (order preserved, deduped). */
export function extractBoxNames(message: string): string[];

/**
 * Named-for-party set (BOX-BR-2/4):
 * - if extractBoxNames length <= 6 → all of them
 * - plus any names the message marks keep/don't-drop (EN/KR)
 * - if length > 6 and no keep-set, the classifier still returns true; the
 *   *model* picks ≤6, and the runtime keep-list is the extracted names (so
 *   legalize will not replace a chosen member with something outside the box
 *   if we pass the chosen proposed_team species ∩ box).
 */
export function namedForParty(message: string, historyTexts?: string[]): string[];
```

Classifier rules (must be pinned by `box-build.test.ts`):

**Positive (box-build):**

- ≥6 comma- or newline-separated Latin name tokens (the production paste).
- ≥3 such tokens AND a party/team verb: English
  `build|make|party|team|box` or Korean `파티|팀|만들어|만들어줘|빼지`.
- Follow-up: current message matches keep/drop/rebuild language (`don't drop`,
  `빼지`, `다시`, `put it back`) AND some prior user message itself
  `isBoxBuildMessage` without history.

**Negative (not box-build):**

- `what can X learn` / `movepool` / `learnset` as the primary ask (BOX-AC-4.1).
- `where (do I) catch` / location / wiki questions (BOX-AC-4.2).
- `build me a rain team` with **no** owned list (ordinary TEAM-US-6).
- Empty / unrelated chat.

Runtime dispatch deny:

```ts
const BOX_FORBIDDEN = new Set(["run_sql", "search_wiki"]);
// inside runWithProvider loop, if boxBuild && BOX_FORBIDDEN.has(name):
//   push toolTrace error "forbidden_on_box_build"; do not call dispatch.
```

`legalizeTeam(members, format, { keepSpecies?: string[] })`:

- If `keepSpecies` is set, any slot whose species normalizes to a keep slug
  **must** remain that species. Repair by clearing illegal moves/items rather
  than swapping the mon. If the species is not in the format roster, keep it
  and attach `species_illegal` + `learnset_unavailable` as **warnings** on the
  accepted answer (do not drop `proposed_team`).

## Implementation Phases

### Phase 1 — `lookup_box` + compact learnset

- What: schemas, compact helper, tool, barrel append, oracle test against
  tools fixture (a known species returns ≤16 compact moves and `count` ≥ that;
  a miss returns suggestions; empty learnset → `available: false`, `found: true`).
- Depends on: nothing
- Produces: T22 callable via `dispatch("lookup_box", …)`
- Parallel: none
- Test focus: Zod cap 40; compact ordering; champions `exists_in_standard`;
  TOOL_NAMES last element `lookup_box`; prompt-cache: existing T1–T21 **order
  unchanged**.
- Requirement refs: BOX-AC-3.2, BOX-AC-3.4, BOX-BR-5 (lookup half), BOX-BR-7
  (get_learnset unchanged)

### Phase 2 — Classifier + runtime loop + legalize keep

- What: `box-build.ts` + tests; runtime cap/nudge/dispatch-deny/hard-reject
  filter; `learnset_unavailable`; legalize `keepSpecies`.
- Depends on: Phase 1 (tool exists for loop tests that call it)
- Produces: box-build turns stop at 6; SQL/wiki not executed; named species
  survive give-up
- Parallel: **none with Phase 3** if both touch runtime? Phase 3 is
  `domain.ts` only — **parallel OK**.
- Test focus: classifier positives/negatives including Korean; follow-up
  inherit; runtime.test: box-build uses 6 not 20/28; forbidden tools not
  executed; hard-reject skipped for `species_illegal` on a named member;
  legalize does not replace keepSpecies; ordinary “build me a rain team”
  still 20/28.
- Requirement refs: BOX-US-1, BOX-US-5, BOX-AC-1.1, BOX-AC-1.2, BOX-AC-1.3,
  BOX-AC-1.4, BOX-AC-2.1, BOX-AC-2.3, BOX-AC-3.1, BOX-AC-3.3, BOX-AC-4.1,
  BOX-AC-4.2, BOX-AC-4.3, BOX-AC-5.1, BOX-AC-5.2, BOX-BR-1, BOX-BR-2, BOX-BR-3,
  BOX-BR-4, BOX-BR-8, BOX-BR-9, BOX-BR-10, BOX-BR-11

### Phase 3 — Prompt + pins + agent-design doc

- What: `domain.ts` Box-build section; `style.test.ts` pins; `tools.md` T22.
- Depends on: Phase 1 (tool name exists to mention)
- Produces: model is taught the short path
- Parallel: **with Phase 2** (owns prompt/docs only)
- Test focus: body contains `lookup_box`, “do not drop”, “do not call run_sql”
  in the box-build section; full-build section still exists for non-box;
  cache breakpoint invariant still holds.
- Requirement refs: BOX-US-2, BOX-US-3, BOX-US-4, BOX-AC-2.2, BOX-AC-2.4,
  BOX-BR-5, BOX-BR-6, BOX-BR-7

### Phase 4 — Eval + warning render sanity

- What: one eval/deterministic case: box list including a missing-learnset
  form → `proposed_team` contains it + warning; `tool_trace` has no
  `run_sql`/`search_wiki`. Confirm web/iOS/Android warning badges show the
  new code’s `message` (only change client maps if unknown codes are dropped
  rather than shown).
- Depends on: Phase 2 + Phase 3
- Produces: launch bar from requirements Success Criteria
- Parallel: none
- Test focus: golden/oracle; client warning fallback tests if a switch is
  exhaustive
- Requirement refs: Success Criteria; BOX-AC-1.2; BOX-AC-2.4; BOX-AC-3.1

### Integration checkpoints

1. **After Phase 1:** `dispatch("lookup_box")` returns compact results from
   fixture DB.
2. **After Phase 2:** runtime loop honors cap + keepSpecies without prompt
   (API/agent seam).
3. **After Phase 3:** style pins prevent the full-build sequence from applying
   to box-build copy.
4. **Final:** eval case keeps Mega-like missing learnset and does not call
   SQL/wiki.

## Build Manifest

```yaml
commands:
  test: "cd web && npm test"
  test_one: "cd web && npx vitest run <file>"
  typecheck: "cd web && npm run typecheck"
  lint: "cd web && npm run lint"
  build: "cd web && npm run build"
  eval_deterministic: "cd web && npx tsx eval/run.ts --deterministic"
phases:
  - id: box-p1
    name: lookup_box + compact learnset
    depends_on: []
    owns:
      - "web/src/agent/schemas.ts"
      - "web/src/agent/schemas.test.ts"
      - "web/src/agent/tools/lookup-box.ts"
      - "web/src/agent/tools/lookup-box.oracle.test.ts"
      - "web/src/agent/tools/compact-learnset.ts"
      - "web/src/agent/tools/compact-learnset.test.ts"
      - "web/src/agent/tools/index.ts"
    shared: []
    requirement_refs: [BOX-AC-3.2, BOX-AC-3.4, BOX-BR-5, BOX-BR-7]
    test_focus: "T22 I/O, compact cap 16, empty learnset is found+unavailable"
  - id: box-p2
    name: Classifier + runtime loop + legalize keep
    depends_on: [box-p1]
    owns:
      - "web/src/agent/box-build.ts"
      - "web/src/agent/box-build.test.ts"
      - "web/src/agent/runtime.ts"
      - "web/src/agent/runtime.test.ts"
      - "web/src/server/teams/legalize-team.ts"
      - "web/src/server/teams/legalize-team.test.ts"
      - "web/src/data/teams/team-schema.ts"
    shared: []
    requirement_refs: [BOX-US-1, BOX-US-5, BOX-AC-1.1, BOX-AC-1.2, BOX-AC-3.1, BOX-AC-3.3, BOX-BR-1, BOX-BR-2, BOX-BR-9, BOX-BR-10]
    test_focus: "classifier EN/KR; cap 6; SQL/wiki not executed; keepSpecies"
  - id: box-p3
    name: Prompt + pins + agent-design doc
    depends_on: [box-p1]
    owns:
      - "web/src/agent/prompts/domain.ts"
      - "web/src/agent/prompts/style.test.ts"
      - "docs/agent-design/tools.md"
    shared: []
    requirement_refs: [BOX-US-2, BOX-US-3, BOX-US-4, BOX-BR-5, BOX-BR-6, BOX-BR-7]
    test_focus: "domain teaches lookup_box and do-not-drop; breakpoint invariant"
  - id: box-p4
    name: Eval + warning render sanity
    depends_on: [box-p2, box-p3]
    owns:
      - "web/eval/**"
    shared: []
    requirement_refs: [BOX-AC-1.2, BOX-AC-2.4, BOX-AC-3.1]
    test_focus: "golden: named missing-learnset form kept; no run_sql/search_wiki"
integration_checkpoints:
  - { after: [box-p1], name: tool↔repos, verifies: "lookup_box compact I/O" }
  - { after: [box-p2], name: runtime guard, verifies: "cap 6 + keepSpecies" }
  - { after: [box-p3], name: prompt pins, verifies: "box-build section in cached body" }
  - { after: [box-p2, box-p3, box-p4], name: success criteria, verifies: "keep + no SQL/wiki" }
```

Phase 2 `owns` `legalize-team.ts` — also update its existing test file in the
same worker. Phase 4 `web/eval/**` means add/adjust a case file, not rewrite
the harness.

Phase 2 and Phase 3 are parallel after Phase 1.

## Technical Decisions

- **BOX-AD-1 — One new tool `lookup_box`, do not widen `get_pokemon` /
  `get_learnset`.** Append-only barrel keeps T1–T21 JSON byte-stable for the
  prompt cache. Widening existing tools would cache-bust the whole prefix and
  still allow one-name calls. `get_learnset` stays the full-movepool API
  (BOX-BR-7).
- **BOX-AD-2 — Advertise all tools; deny SQL/wiki in dispatch.** Removing
  tools from the per-turn list would change the tools JSON and miss the
  prefix cache on every box-build (50–80k tokens). A denied call still costs
  an iteration if the model misbehaves; the cap of 6 bounds that. Tests
  assert well-behaved traces contain no SQL/wiki.
- **BOX-AD-3 — Classifier is heuristic, not an LLM pre-pass.** Matches Oak’s
  scope detector philosophy (precision list + Korean verbs). Required to
  pick the iteration cap before the first model call.
- **BOX-AD-4 — Soft-illegal named members on box-build only.** Global
  `HARD_VIOLATION_CODES` stay as they are for ordinary team-builds (do not
  weaken Champions legality). The runtime filter is gated on
  `isBoxBuildMessage`.
- **BOX-AD-5 — legalize may empty moves, never swap keepSpecies.** Opposite
  of today’s give-up path that drops `species_illegal` members. Without this,
  Mega Kangaskhan retries continue.
- **BOX-AD-6 — Compact 16, not a model-chosen subset.** Deterministic
  STAB/status heuristic so tests are stable and transcripts stay small.
- **BOX-AD-7 — `MAX_ITERATIONS` / `MAX_ITERATIONS_TEAM_BUILD` unchanged**
  for non-box turns. Box-build is a third branch.

## Deployment & Infrastructure

Budget Tier: hobby

**Build & Test Commands**

- test: `cd web && npm test`
- test_one: `cd web && npx vitest run <file>`
- typecheck: `cd web && npm run typecheck`
- lint: `cd web && npm run lint`
- build: `cd web && npm run build`
- eval_deterministic: `cd web && npx tsx eval/run.ts --deterministic`

No migration, no new hosting, **$0** infra. Prompt-cache prefix grows by one
tool definition (append-only); existing T1–T21 bytes unchanged.

## UI Reference

No new screens. Proposed-team warning badges: existing
`ProposedTeamCard` / mobile team warning views. If a client switches on
`WarningCode` exhaustively, add `learnset_unavailable` to show `message`.
Design system: `docs/design-system/`.

## Unresolved from Requirements

- Other languages besides EN/KR: classifier still matches **bare Latin name
  lists** (≥6 tokens). Full “don’t drop” phrasing outside EN/KR is not a
  launch blocker (Open Question in requirements).
- Exact 16-move heuristic is BOX-AD-6 (architecture), not a product open
  question.
