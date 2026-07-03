# Generation Scope — agent-design addendum

**Status:** implemented (generation-scope feature).
**Amends:** the otherwise-frozen agent-design contract (`overview.md`, `tools.md`,
`prompts.md`, `output-formats.md`, `evaluation.md`). Read this alongside them the
same way the T12–T14 tool appends are read: the base docs stand, and this file
records the deltas the generation-scope feature introduced. Full rationale +
per-file change list live in
[`docs/features/generation-scope/implementation-plan.md`](../features/generation-scope/implementation-plan.md)
(locked decisions GS-D1…GS-D7).

The one-line summary: Oak's data scope grew from **two** formats
(`scarlet-violet` = Gen 9, `champions`) to **six** — adding mainline generations
**5, 6, 7, 8** — and the turn's scope is now **resolved on the server per turn**
from an explicit in-message signal, then the conversation's sticky scope, then the
Champions-toggle seed. **Nothing about the tool surface the model sees changed**
except the widened `save_team` / `proposed_team` format enum. Scope is still
**server-controlled and never an LLM-visible tool input**.

---

## What did NOT change (the invariants this feature preserved)

- **Scope is never an LLM-visible tool input.** The model gets a scope-specific
  system prompt + scope-filtered tool results and has **no parameter** to widen or
  change scope — exactly as with the Champions toggle before. Widening the format
  space did not add a `format`/`mode`/`scope`/`generation` argument to any tool's
  JSON schema. (Reaffirms `overview.md` "server-controlled format" and `tools.md`.)
- **Tool names and tool output field names are frozen.** In particular
  `is_gen9_native` and `source_generation` **keep their names**; only their
  *semantics* generalize (see below). No tool was renamed, added, or removed by
  this feature — the count stays **14** (T1–T14).
- **Tools never throw in-domain; the runtime never throws for in-domain failures.**
  An explicitly-named but unsupported generation (Gens 1–4) is answered with a
  normal terminal `answer` event, not an `error` (see "Unsupported generations").
- **Champions is untouched.** The `champions` format, its regulation string, the
  Champions system-prompt prefix (`champions.ts` / `GROK_CHAMPIONS_*`), the
  Champions-only tool gates, and the usage-stats surface are all unchanged.

---

## 1. Scope space (GS-D1, amends `overview.md`)

`Format` widened from `"scarlet-violet" | "champions"` to add
`"gen-5" | "gen-6" | "gen-7" | "gen-8"` (`src/data/formats.ts`, the pure/portable
source of truth). `AgentMode` widened in lockstep: `"standard" | "champions"`
gained the same four gen scopes. **`"standard"` remains the Gen 9 alias** — every
existing `mode === "champions"` guard and the `"standard"` default stay valid; no
guard compared against `"standard"` in a way that breaks.

| Format | AgentMode | Dex | `generation_basis.generation` tag |
|---|---|---|---|
| `scarlet-violet` | `standard` | `Dex.forGen(9)` | `gen-9` |
| `champions` | `champions` | Gen 9 dex via `@pkmn/mods` champions | `champions` |
| `gen-5` | `gen-5` | `Dex.forGen(5)` | `gen-5` |
| `gen-6` | `gen-6` | `Dex.forGen(6)` | `gen-6` |
| `gen-7` | `gen-7` | `Dex.forGen(7)` | `gen-7` |
| `gen-8` | `gen-8` | `Dex.forGen(8)` | `gen-8` |

Mapping helpers (`formats.ts`): `formatForMode` / `modeForFormat` (gen scopes map
1:1), `genNumberForFormat`, and `basisForFormat` (the reason the standard format's
storage name `scarlet-violet` differs from its answer tag `gen-9`).

**Gens 1–4 are out of scope (GS-D1)** — their pre-nature/EV stat systems and older
damage formulas need formula variants (backlogged; see `docs/backlog.md` B-10).

Data-wise, ingest builds **all six** formats (one row-set per format,
discriminated by the `format` column — no schema/CHECK change, GS-D6). The dev/prod
DB must be **re-ingested** after adopting this feature or the new formats read as
`index_unavailable`.

---

## 2. `is_gen9_native` / `source_generation` — semantics generalized, names frozen
(amends `tools.md` — the T2 `query_pokedex` + T3 `get_pokemon` output fields and the
"Generation context defaults to Gen 9" note — and `output-formats.md` `subjects[]`)

These field names are a contract the model depends on, so they are **NOT renamed**.
Their meaning generalizes from Gen-9-specific to **active-format-relative**:

- **`is_gen9_native`** now means *"native to the active format's game."* In a
  `gen-7` turn it is `true` for a species that exists natively in Gen 7 and `false`
  for a species carried only as a pre-generation `"Past"` fallback. (The field name
  is historical; the prompt tells the model exactly this — "the field name is
  historical; it means native to the ACTIVE generation.")
- **`source_generation`** is unchanged in shape (`gen-N` string, present when a
  species is a non-native fallback), and is now interpreted against the active
  format rather than always Gen 9.

The ingest builder logic that produces these was already format-relative
(`native = champions ? true : !isNonstandard`; `source_generation = gen-${gen}`), so
only the documented meaning widened. The gen-provider additionally excludes
`isNonstandard === "Future"` species (e.g. a Gen 8/9 mon appearing in a Gen 7 dex)
so they are never indexed as fallback rows the way `"Past"` species are.

---

## 3. `generation_basis.generation` value space (amends `output-formats.md`)

The `generation` string's example set widens from `'gen-9' | 'gen-8'` to include
**`'gen-5' … 'gen-8'`** and **`'champions'`** — plus one sentinel value,
**`'unsupported'`**, used only by the route-synthesized answer for an explicitly
named Gen 1–4 request (§5). The field stays a plain `string` (no enum), so no JSON
Schema shape change and no re-validation of stored answers is required; the value is
now stamped from `basisForFormat(formatForMode(mode))` for every answer (including
the runtime's synthesized `insufficient_data` / prose fallbacks).

---

## 4. `save_team` / `proposed_team` format enum widened (GS-D6, amends `tools.md`
T13 + `output-formats.md`)

The two team format enums (`proposedTeamSchema.format`, `savedTeamSchema.format` in
`src/agent/schemas.ts`) now derive from `FORMATS` — the full six-format union —
instead of the two-value `scarlet-violet | champions`. This is the **only**
model-visible schema change in the feature: it changes the generated JSON Schema for
the `save_team` tool and for `submit_answer`, so the cached prompt prefix re-warms
once per provider (expected; no action). DB `format` columns on `conversation` /
`team` are plain `text`, so no migration is needed to store the new values.

---

## 5. Server-side scope resolution (GS-B / GS-D3) — new, and deliberately NOT a tool

Per-turn scope is resolved **in the chat route** (`src/app/api/chat/route.ts`),
between body-parse and `createAgentContext`, using a **deterministic lexicon — no
LLM pre-pass** (`src/lib/scope/detect-scope.ts`, a pure/portable module). Precedence:

```
explicit in-message signal  >  scope_seed (chip pick)  >  conversation's sticky scope  >  legacy champions_mode  >  default (champions)
```

> **Amended 2026-07-02** (web Champions-default pass): the web Champions toggle is
> removed and the default scope for a new conversation is now **champions** (was
> `scarlet-violet`). The seed input is no longer the `champions_mode` boolean —
> it's the new `scope_seed?: Format` field, set by the header's now-interactive
> scope chip (tap → pick any of the six scopes). Because a chip pick is fresh,
> explicit user intent, **`scope_seed` ranks above the conversation's sticky
> scope**, not below it. The deprecated `champions_mode` boolean is still
> honored (old iOS builds send it) but now ranks **below** sticky scope, same as
> before, so a resumed conversation is never silently reverted by a stale
> client default. See the precedence chain above and §6 for the widened `scope`
> event `source` union.

- **Signal** — `detectScopeSignal(message)` scans for high-precision game/region/
  mechanic keywords and explicit "gen N" numbers (Champions rules first). It favors
  **precision over recall**: ambiguous single words ("sun", "sword", "black", "x",
  "y") never fire alone, region *adjectives* ("alolan", "galarian", "paldean") are
  **not** signals, and "mega" is not a signal. When unsure it returns `null` and
  stickiness wins.
- **Sticky scope** — the conversation's stored `format` (signed-in) or the guest
  session's remembered scope (`getSessionScope`, an in-memory store parallel to
  guest history with the same TTL/LRU). New conversations have no sticky scope.
- **Seed** — `scope_seed` (a `Format`, set by the header scope chip) seeds the
  format for a *new* conversation, and — because it reflects the user's most
  recent explicit pick — ranks **above** sticky scope too: picking a scope in
  the chip and then sending a message re-seeds/switches the conversation's
  scope, the same as an in-message signal would. The deprecated `champions_mode`
  boolean is still accepted (old iOS builds send it) but ranks **below** sticky
  scope, matching its original seed-only semantics, and only matters when there
  is no `scope_seed` and no sticky scope yet.
- **Default** — with no signal, no seed, and no sticky scope, the turn defaults
  to **champions** (amended 2026-07-02; was `scarlet-violet`/standard).

`scope_seed?: Format` is the new request field (set by the header scope chip);
the legacy `champions_mode?: boolean` stays in the request body for back-compat
(`true` → champions, `false` → scarlet-violet) but is superseded by `scope_seed`
wherever both are present.

### BR-H6 amended → **BR-H6′** (amends chat-history behavior)

BR-H6 (a resumed conversation ignores the request-body toggle and uses its stored
format) is amended: a conversation's format is **sticky but switchable** by an
explicit in-message signal, and the switch is **persisted**. Signed-in: the route
fires `updateConversationFormat(accountId, conversationId, format)` (account-scoped,
fire-and-forget, off the critical path) when a signal changes the stored format.
Guest: `setSessionScope(sessionId, format)` every turn (idempotent).

### Unsupported generations (Gens 1–4)

When the signal names an unsupported generation, the route does **not** run the
agent against wrong-gen data. It short-circuits inside the stream with a synthesized
in-domain answer: `status: "insufficient_data"`, an honest "I don't have Gen N data
yet — I currently cover Gen 5–9 and Pokémon Champions" message,
`generation_basis: { generation: "unsupported", fallback: false }`, and
`uncertainty_flags: ["unsupported_generation_requested"]`. It is emitted as a normal
terminal `answer` event (never the `error` event), and the turn pair is persisted as
usual.

---

## 6. Visible scope (GS-C / GS-D5) — new SSE `scope` event

A new SSE event **`scope`** is emitted **once per turn, first** (before any
`tool_activity`), carrying the resolved format and where it came from:

```ts
event: scope   data: { format: Format, source: "message" | "conversation" | "seed" | "default" }
```

> **Amended 2026-07-02:** the `source` union changed from
> `"message" | "conversation" | "toggle"` to
> `"message" | "conversation" | "seed" | "default"`. `"seed"` covers both the
> new `scope_seed` chip pick and the deprecated `champions_mode` boolean —
> either one deciding the scope reports as `"seed"`. `"default"` is new: it
> reports when nothing decided the scope and it fell through to the champions
> default.

Additive to the SSE protocol (`src/lib/sse/sse-types.ts`) — old clients that don't
listen for `scope` ignore it. The client renders it as a header **scope chip**
(`scopeLabel(format)` → e.g. "Gen 7 · USUM", "Champions · Reg M-B"), so a wrong
inference is a one-tap correction rather than a silently wrong answer. The existing
per-answer `generation_basis` remains the authoritative per-answer record; the chip
is the live turn-level indicator. `scope-label.ts` is a pure/portable helper.

---

## 7. Prompt parity (amends `prompts.md`)

Per-gen prompt facts (label, games, gen-defining mechanics the model must respect —
e.g. Z-Moves exist in Gen 7 but not Gen 8; Megas exist in 6–7 but not 8; Fairy type
starts in Gen 6; no Terastal off Gen 9) live in a **single source**,
`src/agent/prompts/gen-info.ts` (`MAINLINE_GEN_INFO`), consumed by **both** prompt
bodies — the Claude/OpenAI Markdown body (`domain.ts`) and the Grok XML body
(`domain-grok.ts`) — so a per-gen fact can never drift between the two. Battle
formulas (`compute-stat`, `estimate-damage`) are reused as-is for Gens 5–8 (GS-D7);
known small per-gen inaccuracies are handled in the prompt notes + `is_estimate`,
not in code. Encounter/catch data stays stored under `scarlet-violet` only and is
read via `STANDARD_FORMAT` in any mainline scope (GS-D4); the Champions gate is
unchanged.

---

## 8. Eval

The **deterministic CI subset** and the judged golden suite are unchanged by this
addendum's landing. A gen-7 golden case (a learnset question whose answer differs
between Gen 7 and Gen 9) is contemplated for the deterministic subset **iff** the
eval fixture DB (`eval/fixtures/seed-fixture-db.ts`, `seed: "eval"`) gains a gen-7
slice; the current eval fixture has none (only the tools oracle fixture
`test/fixtures/tools-fixture.ts` carries a gen-7 slice, exercised by
`gen-scope.oracle.test.ts`), so no deterministic gen-7 case is registered — the
subset stays exactly `[G1, G3, G5, G6, G8, G11, G15]`. A gen-7 team-analysis case
for the judged (`npm run eval`, non-CI) suite is tracked as a follow-up.
