# Generation Scope — Implementation Plan

**Status:** ready to implement (not started)
**Written:** 2026-07-02
**Problem:** Oak currently understands exactly two data scopes — Gen 9 (`scarlet-violet`) and
Champions — selected by a single client-side toggle. Users ask about older generations
("analyze my gen 7 team") and forget to flip the Champions toggle off before asking mainline
questions. Both cases silently produce answers scoped to the wrong game.

**Solution (agreed):** keep scope **server-controlled** (never an LLM-visible tool input), but:

1. **Multi-gen data (GS-A).** Ingest mainline generations 5–8 as new `format` row-sets so
   older-gen questions can be answered from real data.
2. **Per-turn scope resolution (GS-B).** Resolve the turn's scope on the server from
   (explicit signal in the message) → (conversation's sticky scope) → (toggle seed),
   instead of trusting the toggle alone. Deterministic lexicon only — **no LLM pre-pass**.
3. **Visible scope (GS-C).** Tell the client which scope was used (new SSE event + UI chip)
   so a wrong inference is a one-tap correction, not a silently wrong answer.

Ship in that order. GS-B without GS-A is worse than today (the UI would claim a gen 7 basis
while answering from gen 9 data).

---

## 0. Ground rules for the implementing session

- Follow CLAUDE.md's git workflow: create a worktree off `develop`
  (`git worktree add ../oak-gen-scope -b agent/gen-scope develop`), implement there, merge back
  only when the phase gates pass.
- All paths below are relative to `web/` unless prefixed with `docs/`. Run all commands from `web/`.
- **Invariants that must survive this change** (do not "improve" them away):
  - Scope/format is **never an LLM-visible tool input**. The model gets a scope-specific
    system prompt and scope-filtered tool results; it has no parameter to widen scope.
  - Tool **names** and tool output **field names** are contract-fixed (`docs/agent-design/tools.md`).
    In particular `is_gen9_native` / `source_generation` keep their names; only their
    *semantics* generalize ("native to the active format's game"). Never rename them.
  - Tools never throw in-domain; the runtime never throws for in-domain failures.
  - **PARITY:** every domain-semantic prompt change lands in BOTH `src/agent/prompts/domain.ts`
    AND `src/agent/prompts/domain-grok.ts`. `champions.ts` is untouched by this feature.
  - `src/data/formats.ts`, `src/agent/schemas.ts`, `src/lib/sse/sse-types.ts` stay pure /
    client-safe (no server-only, no env, no SDK imports) — they're on the portable-modules list.
- After merging, the deployed/dev DB must be **re-ingested** (`npm run docker:ingest` locally,
  `fly ssh` + ingest in prod) or the new formats read as `index_unavailable`.

### Locked design decisions (do not re-litigate)

| # | Decision |
|---|----------|
| GS-D1 | Supported mainline gens initially: **5, 6, 7, 8** (`"gen-5"`…`"gen-8"`). Gen 9 keeps its existing `"scarlet-violet"` format name (stored conversations/teams/ingest_meta reference it; renaming breaks them). Gens 1–4 are out of scope (pre-nature/EV stat systems and older damage formulas need formula variants — leave a follow-up note in `docs/backlog.md`). |
| GS-D2 | `AgentMode` **widens** to include the gen scopes; `"standard"` remains the gen-9 alias so all existing `mode === "champions"` guards and the `"standard"` default stay valid. All existing checks in the codebase compare against `"champions"` only (verified) — none compare against `"standard"` in a way that breaks. |
| GS-D3 | Scope resolution is **deterministic** (lexicon), conservative (only switch on high-precision signals), and **sticky per conversation**. The Champions toggle becomes a *seed* for new conversations, not a lock. This amends BR-H6: a resumed conversation still ignores the toggle, but an explicit in-message signal may now switch the conversation's stored format (persisted). |
| GS-D4 | Encounter/catch data stays stored under the `scarlet-violet` format only (it is inherently cross-game, Gen 1–8). In any mainline scope the `get_encounters` tool reads `STANDARD_FORMAT`; the Champions gate is unchanged. |
| GS-D5 | The resolved scope is surfaced via a new SSE event `scope` emitted once per turn, plus the existing per-answer `generation_basis`. Additive; old clients ignore unknown events. |
| GS-D6 | Team schemas (`proposed_team` / `saved_team` / DB `format` columns) widen to all formats. DB columns are plain `text` with no CHECK constraints — **no migration is needed** for new format values. |
| GS-D7 | Battle formulas (`compute-stat`, `estimate-damage`) are reused as-is for gens 5–8 (nature/EV model holds from gen 3; the damage formula is the modern one from gen 5). Known small inaccuracies (crit multiplier 2× in gen 5, no Tera off gen 9) are handled in the prompt (per-gen mechanics notes + `is_estimate: true`), not in code. |

---

## Phase 1 — GS-A: multi-gen data (formats, gen-provider, ingest)

Everything in this phase is server/CLI-side; no behavior change for users until ingest runs.

### 1.1 `src/data/formats.ts`

Current file is 60 lines of pure constants/mappings. Changes:

```ts
/** Mainline generation scopes beyond Gen 9 (GS-D1). */
export type GenFormat = "gen-5" | "gen-6" | "gen-7" | "gen-8";

export type Format = "scarlet-violet" | "champions" | GenFormat;

/** All formats the ingest builds, in stable order. */
export const FORMATS = [
  "scarlet-violet",
  "champions",
  "gen-5",
  "gen-6",
  "gen-7",
  "gen-8",
] as const;
```

- `DEFAULT_FORMATS` stays `= FORMATS` (ingest builds everything by default;
  `--formats=` filtering already exists).
- `STANDARD_FORMAT` / `CHAMPIONS_FORMAT` / `CHAMPIONS_REGULATION` unchanged.
- `formatForMode(mode)`: `"champions"` → champions, `"standard"` → scarlet-violet,
  otherwise the mode **is** the format (gen scopes map 1:1): `return mode;`.
- `modeForFormat(format)`: inverse — champions → `"champions"`, scarlet-violet →
  `"standard"`, gen-N → itself.
- Add two helpers (used by prompts, runtime fallbacks, and the pokedex builder):

```ts
/** Dex generation number backing a format (Champions rides the Gen 9 dex). */
export function genNumberForFormat(format: Format): number {
  if (format === "scarlet-violet" || format === CHAMPIONS_FORMAT) return 9;
  return Number(format.slice("gen-".length));
}

/** The `generation_basis.generation` tag for answers in this format. */
export function basisForFormat(format: Format): string {
  if (format === CHAMPIONS_FORMAT) return "champions";
  if (format === STANDARD_FORMAT) return "gen-9";
  return format; // "gen-5"…"gen-8"
}
```

- `isFormat` needs no change (it reads `FORMATS`).

### 1.2 `src/agent/types.ts` — widen `AgentMode`

```ts
import type { GenFormat } from "@/data/formats"; // type-only; keeps this module pure
export type AgentMode = "standard" | "champions" | GenFormat;
```

Check for an import cycle: `formats.ts` imports `AgentMode` from `types.ts` (type-only) and
`types.ts` would import `GenFormat` from `formats.ts` (type-only). Type-only circular imports
are fine under `isolatedModules`/ESM, but if lint complains, define
`type GenFormat = \`gen-${5|6|7|8}\`` inline in `types.ts` instead and have `formats.ts` derive
from it (one source of truth either way — pick one and leave a comment).

Update the `AgentMode` doc comment: server-controlled scope; `"standard"` = Gen 9;
gen scopes added by the generation-scope feature; still never an LLM-visible tool input.

### 1.3 `src/data/pkmn/gen-provider.ts`

- Add `genNumber: number` to `FormatSource` (builders need it for learnset source filtering).
- In `loadFormat`:

```ts
if (format === CHAMPIONS_FORMAT) {
  // …existing champions branch, genNumber: 9
} else {
  const gen = genNumberForFormat(format); // 9 for "scarlet-violet", else 5–8
  dex = Dex.forGen(gen);
  roster = standardRoster(dex);
}
```

- `standardRoster` / `isRealSpecies`: additionally exclude `isNonstandard === "Future"`
  (in a gen-7 dex, gen 8/9 species may appear as "Future"; they must not be indexed as
  fallback rows the way `"Past"` species are). Keep `"Past"` species — that's the BR-1
  fallback mechanic, generalized ("native ⟺ falsy `isNonstandard`" already generalizes).
- **Probe before trusting** (the file's header documents verified @pkmn facts — extend it):
  write a scratch script or the real-behavior test (1.6) that prints, for `Dex.forGen(7)`:
  roster size, whether any `isNonstandard === "Future"` species pass `exists`, a known
  learnset (e.g. Alolan Raichu), and the 18-vs-fewer types count (older gens can have fewer
  battle types; the `BATTLE_TYPE_NAMES` intersection already handles that). Record findings
  in the header comment like the existing "Verified facts" block.

### 1.4 Ingest builders

**`src/ingest/build-learnsets.ts`** — generalize the gen filter. Replace
`opts: { format: Format; gen9Only: boolean }` with:

```ts
opts: { format: Format; genFilter?: number }
// keep a source iff genFilter is undefined (Champions) or src[0] === String(genFilter)
```

Gen numbers are single-digit (≤9) so the index-0 check stays valid. Update the header
comment (D6/BR-2 rules now read "the format's generation", not "Gen 9").

**`src/ingest/build-pokedex.ts`** — in `buildPokemonRow`:

- `generation: champions ? "champions" : basisForFormat(format)` (import from formats).
- `is_gen9_native` / `source_generation` logic is already format-relative
  (`native = champions ? true : !s.isNonstandard`; `source_generation = gen-${s.gen}`) — no
  change beyond comments. Update the `PokemonRow` doc comments: format union widened;
  `is_gen9_native` means "native to this format's game" (name is contract-frozen).

**`src/ingest/run.ts`** —

- Replace `const gen9Only = format === STANDARD_FORMAT;` with:

```ts
const isChampions = format === CHAMPIONS_FORMAT;
const genFilter = isChampions ? undefined : source.genNumber;
```

- Pass `{ format, genFilter }` to `buildLearnsetRows`.
- Encounter rows: keep appended **only** for `format === STANDARD_FORMAT` (GS-D4) — the
  existing `if (gen9Only)` becomes `if (format === STANDARD_FORMAT)`.
- `buildNames` / `buildReferenceRows` need no signature change (they consume `FormatSource`),
  but skim both for hardcoded gen-9 assumptions (e.g. reference text mentioning "gen 9") and
  fix if found.

### 1.5 Schema / migrations

None required (GS-D6): `pokemon.format`, `learnset.format`, `reference_cache.format`,
`searchable_names.format`, `ingest_meta.format`, `conversation.format`, `team.format` are all
plain `text`. Verify by grepping `drizzle/` for any CHECK constraint on `format` (there is
none today).

### 1.6 Phase 1 tests

- `src/ingest/build-learnsets.test.ts`: update for the `genFilter` option; add a case
  filtering `7L…`/`7M` sources with `genFilter: 7` and dropping `9M`.
- `src/ingest/build-pokedex.test.ts`: a gen-7 row carries `generation: "gen-7"`; a
  `"Past"`-flagged species yields `is_gen9_native: 0` + `source_generation` as before.
- New real-behavior test alongside the existing gen-provider test (see commit
  `bc0344b test(eval): add real-behavior @pkmn gen-provider test (T2)` for the pattern):
  `loadFormat("gen-7")` returns a plausible roster (assert a species that exists in gen 7
  and one that must NOT, e.g. Grookey), `genNumber === 7`, and its `getLearnset` filtered
  through `buildLearnsetRows` contains a known gen-7-only move source.
- `src/data/formats` tests (if a test file exists; create one if not): round-trip
  `formatForMode(modeForFormat(f)) === f` for every `FORMATS` entry, plus
  `genNumberForFormat` / `basisForFormat` table.

**Gate:** `npm run typecheck && npm run lint && npm test` (Docker running), then a live smoke:
`npm run docker:ingest` (or `npm run ingest -- --formats=gen-7` against the dev DB) and
`npm run docker:psql` → `select format, count(*) from pokemon group by 1;` — expect six
format rows with sane counts (gen-5 ≈ 650 species-forms, gen-7 ≈ 800+, etc.).

---

## Phase 2 — scope-aware agent layer (prompts, runtime, schemas, tools)

### 2.1 New file: `src/agent/prompts/gen-info.ts`

Single source of per-gen prompt facts, consumed by BOTH prompt bodies (parity by
construction):

```ts
import type { AgentMode } from "@/agent/types";

export interface MainlineGenInfo {
  /** e.g. "gen-7" — must equal basisForFormat(formatForMode(mode)). */
  basisTag: string;
  /** e.g. "Generation 7 (Sun/Moon and Ultra Sun/Ultra Moon)". */
  label: string;
  /** Short games list for prose, e.g. "Sun/Moon/USUM". */
  gamesShort: string;
  /**
   * 2–5 bullet lines of gen-defining mechanics the model must respect, e.g. for gen-7:
   * Z-Moves exist; Megas exist; no Dynamax; no Terastallization; Hidden Power exists.
   */
  mechanicsNotes: string;
  /**
   * One line about catch-location coverage for this gen (get_encounters spans Gen 1–8,
   * so gens 5–8 have NATIVE encounter data — unlike gen 9).
   */
  encountersNote: string;
}

export const MAINLINE_GEN_INFO: Record<"standard" | "gen-5" | "gen-6" | "gen-7" | "gen-8", MainlineGenInfo> = { … };
```

Author the mechanics notes carefully — they are the model's only guard against recommending
off-gen mechanics (Tera in gen 7, Z-Moves in gen 8, etc.). Include for each gen: which
gimmick exists (5: none; 6: Megas; 7: Megas + Z-Moves; 8: Dynamax/Gigantamax, NO Megas/Z),
Fairy type (exists from gen 6 — in gen 5 scope there is no Fairy type; the ingested gen-5
type chart already reflects that, tell the model to trust the tools), physical/special split
(all ≥5, no note needed), and that "can learn move X" is evaluated against THAT gen's
learnset.

### 2.2 `src/agent/prompts/domain.ts` (Claude/OpenAI Markdown body)

- Convert `STANDARD_SYSTEM_PROMPT` and `STANDARD_FEW_SHOT` from consts into builders:
  `standardSystemPrompt(info: MainlineGenInfo)` / `standardFewShot(info)` — template
  literal functions over the existing text. Memoize per mode
  (`const cache = new Map<AgentMode, PromptDomain>()`) so each scope's prefix stays
  **byte-stable** across turns (prompt caching keys on exact bytes; per-scope cache entries
  are expected and fine — same as the Champions prefix today).
- Parameterize, at minimum:
  - Rule 2 ("Answers are based on Generation 9 (Scarlet/Violet, including DLC)…") →
    `info.label`, and generalize the `is_gen9_native` sentence: "your tools tell you whether
    a Pokémon is native to ${gamesShort} via is_gen9_native (the field name is historical —
    it means native to the ACTIVE generation) with a source_generation."
  - Rule 3 ("evaluated against the Gen 9 learnset") → `${info.label}` learnset.
  - Insert `info.mechanicsNotes` as a new numbered rule in "Data and generation rules".
  - The encounters section (line ~83–91) → `info.encountersNote` (for gens 5–8 the
    "no data for SV/PLA/BDSP" caveat is replaced by "this generation's games are covered").
  - Every few-shot `generation_basis: { generation: "gen-9", … }` → `"${info.basisTag}"`,
    and citation strings like `learnset/trick-room (gen-9)` → `(${info.basisTag})`.
  - Review few-shot species for gen-neutrality: **Ceruledge** (gen 9) appears in the
    Trick Room example — reword that example so its named standouts are gen-5-era species
    (e.g. Dusknoir + Chandelure), valid in every supported scope. Keep the example's
    structure identical.
- `domainForMode(mode)`:

```ts
export function domainForMode(mode: AgentMode): PromptDomain {
  if (mode === "champions") return CHAMPIONS_DOMAIN; // unchanged
  return cachedStandardDomain(mode); // builds from MAINLINE_GEN_INFO[mode]
}
```

### 2.3 `src/agent/prompts/domain-grok.ts` (Grok XML body — **the default model**)

Apply the exact same parameterization to `GROK_STANDARD_SYSTEM_PROMPT` /
`GROK_STANDARD_FEW_SHOT` and `grokDomainForMode` (line ~1096), sourcing from the SAME
`MAINLINE_GEN_INFO` record. The Grok body's structure (XML sections `<constraints>`,
`<output_contract>`, `<tool_routing>`, `<stop_condition>`) must not change — only the
generation-fact text inside it. Champions blocks (`GROK_CHAMPIONS_*`) untouched.

### 2.4 Prompt structure tests

- `src/agent/prompts/style.test.ts` (Grok block) + `src/agent/prompts/domain-grok.test.ts`
  pin the Grok body's structure — update them to call the builders for `"standard"` and add
  at least one gen scope (e.g. `"gen-7"`): assert the XML sections still exist, the body
  contains the right `label` and `basisTag`, and does NOT contain "Generation 9" when built
  for gen-7.
- Add a **parity guard test**: for each mainline mode, both bodies contain
  `MAINLINE_GEN_INFO[mode].basisTag` and `label` (cheap semantic-drift tripwire).

### 2.5 `src/agent/runtime.ts`

- `synthesizeInsufficientData(reason)` and `synthesizeFromProse(prose)` (lines ~607–641)
  hardcode `generation_basis: { generation: "gen-9", fallback: false }`. Thread the mode in:
  give both an extra `mode: AgentMode` param and set
  `generation: basisForFormat(formatForMode(mode))`; update the two-to-three call sites.
- `buildSystemSegments({ provider, mode })` already passes `ctx.mode` through — no change
  needed there (`prompts/index.ts` routing is untouched; the mode-awareness moved into
  `domainForMode`/`grokDomainForMode`).
- Team-legality validation (~lines 890/915) already uses `formatForMode(ctx.mode)` — works
  as-is once data exists.

### 2.6 `src/agent/schemas.ts`

- Widen the two team format enums (GS-D6):

```ts
import { FORMATS } from "@/data/formats"; // pure module — keeps schemas.ts client-safe
// proposedTeamSchema / savedTeamSchema:
format: z.enum(FORMATS),
```

  (`FORMATS` is a `readonly` const tuple, which `z.enum` accepts. If the Zod version in use
  rejects the readonly tuple type, spread into a literal: `z.enum([...FORMATS])` with an
  `as` cast — keep one source of truth.)
- Note: this changes the generated JSON Schema for the `save_team` tool and the
  `submit_answer` schema — the cached prompt prefix re-warms once per provider. Expected;
  no action.

### 2.7 Tools

- `src/agent/tools/get-encounters.ts` (GS-D4): line ~44 currently passes
  `formatForMode(ctx.mode)`. Change to always pass `STANDARD_FORMAT` for non-Champions
  modes (encounter reference rows only exist under `scarlet-violet`; the data itself spans
  Gen 1–8 and is grouped per game). Champions gate (`ctx.mode === "champions"` →
  `not_available_in_champions`) unchanged.
- `src/agent/tools/get-usage-stats.tool.ts`: `ctx.mode !== "champions"` → unavailable —
  correct under the widened union; no change.
- `src/agent/tools/compute-stat.tool.ts`: the `ctx.mode === "champions"` branch is correct;
  the standard branch serves all mainline gens (GS-D7). Audit `src/agent/formulas/` for
  gen-9-only inputs (e.g. a Tera parameter in `estimate-damage`): if present, do NOT remove
  it — the per-gen `mechanicsNotes` already tell the model not to use Tera off gen 9.
- Grep all remaining `formatForMode(ctx.mode)` call sites (≈14 tools) — they all generalize
  automatically. No signature changes anywhere in the tool layer; the model-visible tool
  surface is unchanged except the widened `save_team` format enum.

### 2.8 Phase 2 tests

- Oracle/tool tests: the fixtures (`test/fixtures/tools-fixture.ts`) seed
  `scarlet-violet` + `champions`. Add a *small* gen-7 slice (3–5 Pokémon with one learnset
  divergence from gen 9 — e.g. a move that is gen-7-legal but not gen-9-legal) and one
  oracle test proving `ctx.mode = "gen-7"` returns the gen-7 row-set (and that
  `resolve_entity` works per format — remember `installAsSingleton(fix)`, per the Gotcha).
- Runtime unit test: synthesized fallback answers carry the mode's basis tag.

**Gate:** `npm run typecheck && npm run lint && npm test`.

---

## Phase 3 — GS-B: the scope resolver and route wiring

### 3.1 New file: `src/lib/scope/detect-scope.ts` (+ `detect-scope.test.ts`)

Pure, dependency-free (client-safe; a future iOS client can reuse it). API:

```ts
import type { Format } from "@/data/formats";

export interface ScopeSignal {
  format: Format;
  /** The lexicon phrase that matched — for logging and tests. */
  matched: string;
}

/** Scan a user message for an EXPLICIT, high-precision game-scope signal. */
export function detectScopeSignal(message: string): ScopeSignal | null;
```

Lexicon (case-insensitive, word-boundary regexes over the raw message; first-match-wins with
the more specific patterns ordered first). **Precision over recall** — when in doubt, return
`null` and let stickiness win:

| Signal → format | Patterns |
|---|---|
| `champions` | `\bchampions\b`, `\breg(?:ulation)? [a-z](-[a-z])?\b` (e.g. "Reg M-B") |
| `scarlet-violet` | `\bscarlet\b`, `\bviolet\b`, `\bgen(?:eration)?\s*9\b`, `\bsv\b` (only as its own token), `\bpaldea\b` (see form-word guard), `\btera(?:stal|stallize|type)?\b` |
| `gen-8` | `\bgen(?:eration)?\s*8\b`, `\bsword\b.*\bshield\b|\bswsh\b`, `\bgalar\b`, `\bdynamax\b`, `\bgigantamax\b`, `\bbdsp\b`, `brilliant diamond`, `shining pearl`, `legends:? arceus\b|\bpla\b` |
| `gen-7` | `\bgen(?:eration)?\s*7\b`, `\bsun\b.*\bmoon\b` (require both words), `\busum\b`, `ultra sun|ultra moon`, `\balola\b`, `\bz-?moves?\b`, `let'?s go` |
| `gen-6` | `\bgen(?:eration)?\s*6\b`, `\bkalos\b`, `\boras\b`, `omega ruby|alpha sapphire`, `\bx and y\b|\bxy\b` (token-only) |
| `gen-5` | `\bgen(?:eration)?\s*5\b`, `\bunova\b`, `black 2|white 2|\bb2w2\b|\bbw2?\b` (token-only), `\bblack\b.*\bwhite\b` (require both) |

**Mandatory guards** (encode as tests):

- Regional-form adjectives are NOT scope signals: `alolan`, `galarian`, `hisuian`,
  `paldean` must not match (an "Alolan Ninetales" question in gen 9 is still gen 9). Use
  negative lookahead or match region words only when NOT suffixed with `-n`/`n `.
- Single ambiguous English words never match alone: `sun`, `moon`, `black`, `white`, `x`,
  `y`, `sword`, `shield` require their pair or an unambiguous token (`usum`, `swsh`, …).
- "mega" is NOT a signal (Megas exist in Champions and gens 6–7).
- Gen 1–4 signals (kanto, johto, "gen 3", "platinum", …): detect them but return a special
  `{ format: null, unsupported: "gen-3" }`-style result — see 3.4 (the route answers with an
  honest "not supported yet" rather than silently answering from gen 9). Model this as a
  discriminated union: `type ScopeDetection = { kind: "scope"; format: Format; matched: string } | { kind: "unsupported"; label: string; matched: string } | null`.

Tests: a table-driven suite of ≥30 messages covering every row plus every guard, including
mixed cases ("my alolan raichu in scarlet" → scarlet-violet; "is tera blast good on my
champions team" → champions beats tera? **No** — decide and pin: first-match-wins with
champions patterns ordered FIRST, since a message naming champions explicitly is the
stronger signal).

### 3.2 `src/server/session-store.ts` — guest scope stickiness

Add a parallel scope map with the same lifecycle as guest history (same TTL, same LRU cap —
reuse `BoundedStore` with `SESSION_MAX_ENTRIES` / `SESSION_TTL_MS`):

```ts
export function getSessionScope(sessionId: string): Format | undefined;
export function setSessionScope(sessionId: string, format: Format): void;
```

Memoize on `globalThis` like the message store (dev hot-reload survival), and clear in
`_resetStoreForTests`. Do not fold scope into the message entries — the message store's
shape is depended on by `trim`/`getHistory` and by tests.

### 3.3 `src/data/repos/conversation-repo.ts` — persist a scope switch

Add:

```ts
/** GS-D3 / BR-H6′: update a conversation's format when an explicit in-message
 *  signal switches its scope. Account-scoped like every other conversation write. */
export async function updateConversationFormat(
  accountId: string,
  conversationId: string,
  format: Format,
): Promise<void>;
```

(One `UPDATE conversation SET format = … WHERE id = … AND account_id = …`.)

### 3.4 `src/app/api/chat/route.ts` — the resolver's placement

All changes live between body-parse and `createAgentContext`; the SSE mechanics are
untouched except one new event.

1. **Replace** the current mode derivation (line ~218,
   `let mode: AgentMode = body.champions_mode ? "champions" : "standard"`) with a
   seed-only value:

```ts
// The toggle is a SEED for new conversations, not a lock (GS-D3).
const seedFormat: Format = body.champions_mode ? CHAMPIONS_FORMAT : STANDARD_FORMAT;
```

2. **In the history-resolution block** (step 3): capture the sticky scope instead of
   assigning `mode` directly:
   - Signed-in + existing conversation: `stickyFormat = conv.format as Format` (this
     replaces the current `mode = modeForFormat(conv.format)` line, ~330).
   - Guest: `stickyFormat = getSessionScope(session_id)`.
   - New conversation either way: `stickyFormat = undefined`.

3. **Resolve, immediately after the history block** (before step 3c / model resolution):

```ts
const detection = detectScopeSignal(message);
let format: Format =
  (detection?.kind === "scope" ? detection.format : undefined)
  ?? stickyFormat
  ?? seedFormat;
const mode: AgentMode = modeForFormat(format);
```

   Log one structured line when a signal fired
   (`event: "scope_signal", matched, from: stickyFormat ?? seedFormat, to: format`) —
   this is the observability for tuning the lexicon later.

4. **Persist the switch** (fire-and-forget, same non-blocking discipline as recording):
   - Signed-in, conversation exists, `format !== conv.format`:
     `void repo.updateConversationFormat(account.id, session_id, format).catch(log)`.
   - Guest: `setSessionScope(session_id, format)` every turn (cheap, idempotent).
   - Note the interaction with the existing persist path: `appendTurnPair` already stamps
     `format: formatForMode(mode)` (line ~566) when creating a conversation — that now
     stamps the *resolved* format automatically. Verify `appendTurnPair` does not also
     overwrite `conversation.format` on every turn in a way that conflicts (if it upserts
     format, it will simply write the same resolved value — fine; just confirm).

5. **Unsupported-gen detection** (`detection.kind === "unsupported"`): do NOT run the agent
   against wrong-gen data. Short-circuit inside the stream with a synthesized in-domain
   answer (status `insufficient_data`,
   `answer_markdown: "I don't have Generation 3 data yet — I currently cover Gen 5–9 and Pokémon Champions. Ask me in one of those scopes…"`,
   `generation_basis: { generation: "unsupported", fallback: false, note: … }`,
   `uncertainty_flags: ["unsupported_generation_requested"]`). Emit it as a normal terminal
   `answer` event (in-domain failures never use the `error` event). Do this AFTER the
   stream opens so the client experience is uniform. Persist the turn pair as usual.

6. **Emit the resolved scope**: first event inside `start()`'s async task, before any
   tool activity:

```ts
send("scope", { format, source: detection ? "message" : stickyFormat ? "conversation" : "toggle" });
```

7. `mode` is used downstream exactly as before (ctx, `formatForMode(mode)` at persist,
   `turn_record.mode`). `turn_record.mode` now records gen scopes too — the admin panel's
   mode column is free-text-ish; verify `src/lib/admin/admin-types.ts` doesn't pin a
   two-value union (widen to `AgentMode` if it does).

### 3.5 `src/lib/sse/sse-types.ts`

- Add to the protocol doc comment and types:

```ts
/** `event: scope` payload — the server-resolved game scope for this turn (GS-C). */
export interface ScopeEvent {
  format: Format; // import type { Format } from "@/data/formats" — both modules are pure
  source: "message" | "conversation" | "toggle";
}
```

  Extend `SseEventName` / `SseEventDataMap` with `scope`. Additive — old clients ignore it.
- `ChatRequestBody` is unchanged (`champions_mode` stays, semantics: seed).

### 3.6 Phase 3 tests

- `detect-scope.test.ts` — the table suite from 3.1.
- `session-store.test.ts` — scope get/set respects TTL + reset.
- Route-level integration test (find the existing route/SSE integration test under `test/`
  and extend it): (a) message "analyze my gen 7 team" on a fresh session with
  `champions_mode: true` → `scope` event carries `gen-7`, ctx.mode seen by tools is gen-7
  (assert via the fixture DB rows returned); (b) second message with no signal → still
  gen-7 (stickiness); (c) "gen 3" message → terminal answer with
  `unsupported_generation_requested`; (d) signed-in resume: stored `champions` conversation
  + "in scarlet and violet…" message → scope switches AND `conversation.format` is updated.

**Gate:** `npm run typecheck && npm run lint && npm test`.

---

## Phase 4 — GS-C: client UI

### 4.1 `src/lib/sse/sse-client.ts`

Handle the new `scope` frame: expose it from the hook (e.g. a `scope` state field +
include it in the hook's return), alongside the existing status/turn state. Update
`sse-client.test.ts` with a recorded frame.

### 4.2 `src/app/page.tsx`

- Track `resolvedScope: Format | null` from the hook; update it on every `scope` event.
- `artifactFormat` (line ~354, currently `championsMode ? "champions" : "scarlet-violet"`)
  → derive from `resolvedScope ?? (championsMode ? "champions" : "scarlet-violet")`.
- `handleOpenConversation` (line ~305): also set `resolvedScope` from `detail.format`.
- Import flow (`importConversation(sessionId, championsMode, turns)` line ~205 +
  `src/lib/api/history-client.ts` + `src/app/api/conversations/import/route.ts`): pass the
  resolved format (fall back to the toggle-derived one) so a guest thread that switched to
  gen-7 imports as gen-7. Widen the import body with an optional `format` field validated
  by `isFormat`; keep `champions_mode` accepted for back-compat.

### 4.3 Scope chip

- New `src/components/controls/ScopeChip.tsx` (+ `.test.tsx`, jsdom project — render
  fixture props only, never import repos/runtime): a small pill showing the active scope
  ("Champions · Reg M-B", "Gen 9 · Scarlet/Violet", "Gen 7 · USUM"). Label mapping lives in
  a tiny pure helper (put `scopeLabel(format): string` in `src/lib/scope/` next to the
  detector so iOS can reuse it).
- Render it in the header next to `ChampionsToggle` driven by `resolvedScope`, and let
  `AnswerCard`'s existing `generation_basis` surface stand as the per-answer record (the
  `CaveatStrip`/fallback banner already covers fallback flagging — no change there).
- `ChampionsToggle.tsx`: update its title/aria copy to reflect seed semantics ("Start new
  chats in Champions scope"). Behavior unchanged otherwise.

**Gate:** `npm run typecheck && npm run lint && npm test` and
`npx vitest run --project jsdom` (component tests), plus a manual `npm run docker:dev` pass:
ask "what's a good gen 7 team around Alolan Ninetales?" with the Champions toggle ON and
confirm the chip flips to Gen 7 and the answer's basis reads gen-7.

---

## Phase 5 — docs, eval, backlog

- **`docs/agent-design/`**: add `generation-scope-addendum.md` (same pattern as the
  T12–T14 appends): scope space widened to Champions + gens 5–9; scope remains
  server-resolved and never LLM-visible; `is_gen9_native` semantics generalized (name
  frozen); `generation_basis.generation` value space now includes `gen-5`…`gen-8`;
  `save_team`/`proposed_team` format enum widened; BR-H6 amended (BR-H6′: conversation
  format is sticky but switchable by explicit in-message signal, persisted).
- **`CLAUDE.md`**: update "Two formats (standard + Champions)" → "Formats & scope
  resolution" (six formats; toggle = seed; resolver in `src/lib/scope/`; ingest builds all
  formats; re-ingest gotcha now includes new formats). Update the tool count/prompt notes
  if touched.
- **`README.md`**: user-facing description of multi-gen support + the scope chip.
- **`docs/backlog.md`**: gens 1–4 support (stat/damage formula variants, no-nature era);
  optional LLM classifier fallback for ambiguous scope signals (only if lexicon
  precision proves insufficient — check the `scope_signal` logs first); per-gen encounter
  filtering nicety.
- **Eval**: add one golden case to the deterministic subset if the fixture DB gains the
  gen-7 slice (e.g. a learnset question whose answer differs between gen 7 and gen 9 —
  pins the whole pipe end-to-end offline). Full judged suite: add a gen-7 team-analysis
  golden case to `eval/` (runs under `npm run eval`, not CI).

**Final gate:** `npm run typecheck && npm run lint && npm test` all green in the worktree →
merge `agent/gen-scope` into `develop` per CLAUDE.md → `npm run docker:ingest` → manual
smoke (Phase 4 gate script) → remove the worktree.

---

## Explicitly out of scope

- Gens 1–4 (GS-D1) — backlog.
- An LLM-based scope classifier — backlog, gated on lexicon telemetry.
- A full scope *picker* UI replacing the Champions toggle — the chip + auto-resolution ships
  first; revisit once usage data exists.
- Champions-side changes of any kind (`champions.ts`, the champions mod, usage stats).
- iOS client (`ios/`) — it talks to the same SSE seam; the new `scope` event is additive and
  can be adopted later.
