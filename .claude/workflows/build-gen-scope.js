export const meta = {
  name: 'build-gen-scope',
  description:
    'Build the Oak GENERATION-SCOPE feature (Next.js App Router + TypeScript, Postgres/Drizzle, Grok-primary agent) per docs/features/generation-scope/implementation-plan.md — phase by phase down a 7-node Build Manifest DAG, each phase gated by real typecheck/lint/Vitest with a bounded repair loop, plus 3 integration checkpoints. Widens Oak to six data scopes (adds mainline gen-5..gen-8), adds a deterministic server-side scope resolver (message signal > sticky conversation > toggle seed), and surfaces the resolved scope (new `scope` SSE event + UI chip). Scope stays NEVER an LLM-visible tool input. All work happens in ONE shared worktree (pass args.root).',
  whenToUse:
    'Run to (re)build the Oak generation-scope feature. Default (no args) builds the whole DAG p1–p7 in the main repo; pass {root, phases} to target a worktree and/or a subset (phases: "p3" or ["p3","p4"]); resume a paused run with resumeFromRunId.',
  phases: [
    { title: 'P1 Formats/types/gen-provider', detail: 'widen Format+AgentMode+FormatSource; genNumberForFormat/basisForFormat; probe Dex.forGen(7)' },
    { title: 'P2 Ingest builders + run.ts', detail: 'genFilter learnsets ∥ pokedex generation; run.ts derivation + encounter gate' },
    { title: 'P3 Prompts + gen-info (PARITY)', detail: 'gen-info.ts → domain.ts ∥ domain-grok.ts → parity-guard test' },
    { title: 'P4 Runtime + schemas + tools', detail: 'synthesize basis ∥ team enum widen ∥ get-encounters STANDARD_FORMAT + gen-7 oracle fixture' },
    { title: 'P5 Scope resolver + route (GS-B)', detail: 'detect-scope ∥ session-store ∥ conversation-repo ∥ sse/admin types → route integrator' },
    { title: 'P6 Client UI (GS-C)', detail: 'sse-client scope frame ∥ ScopeChip ∥ page.tsx → import-flow widening' },
    { title: 'P7 Docs, eval, backlog', detail: 'agent-design addendum + CLAUDE/README + backlog + gen-7 eval golden case' },
    { title: 'Checkpoints', detail: 'ingest-e2e (after p2), scope-resolver-e2e (after p5), feature-e2e (after p7)' },
    { title: 'Finalize', detail: 'feature-invariant guard + per-phase commits + auto-merge to develop' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// args: {root?, phases?}  (back-compat: a bare string/array is treated as phases)
//   root   — repo/worktree root the agents operate in (keeps this file generic)
//   phases — 'all' | 'p3' | ['p3','p4']
// ─────────────────────────────────────────────────────────────────────────────
let A = args
if (typeof A === 'string') {
  const s = A.trim()
  if (s.startsWith('{') || s.startsWith('[')) {
    try {
      A = JSON.parse(s)
    } catch (e) {
      /* keep as bare string */
    }
  }
}
if (typeof A === 'string') A = { phases: A }
else if (Array.isArray(A)) A = { phases: A }
else if (!A || typeof A !== 'object') A = {}
const ARGS = A
const ROOT = ARGS.root || '/Users/gowtam/Documents/Projects/Oak'
const MAIN = '/Users/gowtam/Documents/Projects/Oak' // the shared develop checkout the auto-merge runs in
const WEB = `${ROOT}/web`
const PLAN = 'docs/features/generation-scope/implementation-plan.md'
const MAX_REPAIR = 3
const REPAIR_FLOOR = 40_000 // stop repairing if a budget target is set and less than this remains

// Best-effort Node-20 pin (project pins 20 via .nvmrc; the host may run a newer Node).
const NVM = 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm use 20 >/dev/null 2>&1 || true;'

// Whole-tree static gates (no Docker). Always run first; fail fast with &&.
const STATIC = `${NVM} cd ${WEB} && npm run typecheck && npm run lint`
// Full suite (node + jsdom) — needs Docker (Testcontainers). Used only at checkpoints.
const FULL_TEST = `${NVM} cd ${WEB} && npm test`
// Production build — used best-effort only in the final checkpoint.
const NEXT_BUILD = `${NVM} cd ${WEB} && npm run build`

// Docker-unavailable soft-pass clause, reused by every node-test verifier/checkpoint.
const DOCKER_CLAUSE = `This runs Vitest's NODE project, which starts a Testcontainers Postgres (needs a Docker daemon). If the command fails ONLY because Docker/Testcontainers is unavailable (e.g. "Cannot connect to the Docker daemon", "connect ECONNREFUSED", "could not find a working container runtime"), then typecheck+lint already passed: treat the phase as PASSED-ON-STATIC, set passed=true, and SAY SO explicitly in the summary. If Vitest actually runs and a real test fails, that is a FAIL with the error tail.`

// ─────────────────────────────────────────────────────────────────────────────
// Schemas (force structured returns)
// ─────────────────────────────────────────────────────────────────────────────
const IMPL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    filesWritten: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string', description: 'Decisions, deviations, anything the verifier/next phase should know.' },
  },
  required: ['filesWritten'],
}
const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    passed: { type: 'boolean' },
    errorTail: { type: 'string', description: 'Up to ~120 lines of the most relevant tsc/eslint/vitest error output; empty if passed.' },
    summary: { type: 'string' },
  },
  required: ['passed', 'errorTail', 'summary'],
}
const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          file: { type: 'string' },
          detail: { type: 'string' },
        },
        required: ['severity', 'file', 'detail'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['issues', 'summary'],
}
const CHECKPOINT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    gatePassed: { type: 'boolean', description: 'Did the broad gate (full test / build) pass — or pass-on-static if Docker absent?' },
    claimVerified: { type: 'boolean', description: 'Did the adversarial inspection confirm the checkpoint claim holds in the code?' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          detail: { type: 'string' },
        },
        required: ['severity', 'detail'],
      },
    },
    errorTail: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['gatePassed', 'claimVerified', 'findings', 'summary'],
}
const GUARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', description: 'true iff ALL four feature invariants hold' },
    violations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { invariant: { type: 'string' }, detail: { type: 'string' } },
        required: ['invariant', 'detail'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['ok', 'violations', 'summary'],
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared prompt preamble
// ─────────────────────────────────────────────────────────────────────────────
const COMMON = `You are an autonomous builder for the Oak GENERATION-SCOPE feature — widening Oak from two data scopes (Gen 9 "scarlet-violet" + Champions) to SIX (adds mainline "gen-5".."gen-8"), resolving each turn's scope SERVER-SIDE from (explicit message signal) > (sticky conversation scope) > (toggle seed) with a DETERMINISTIC lexicon (NO LLM pre-pass), and surfacing it to the client (a new \`scope\` SSE event + a UI chip). Oak is a TypeScript / Next.js App Router monolith rooted at \`web/\`, Postgres via Drizzle + node-postgres, the agent runs Grok 4.3 (native xAI Responses provider) with Claude/GPT selectable, Vitest tests backed by Testcontainers Postgres.

REPO ROOT: ${ROOT}
- ⚠️ CRITICAL PATH RULE: this is a git WORKTREE, NOT the main checkout. Your shell's default cwd is a DIFFERENT directory. EVERY file path in this brief (e.g. \`web/src/data/formats.ts\`) is RELATIVE TO ${ROOT} — always resolve it as \`${ROOT}/web/src/data/formats.ts\`. Use ROOT-ABSOLUTE paths for every Read/Edit/Write/grep, and \`cd ${ROOT}\` (or \`cd ${WEB}\`) before any shell command. NEVER edit files under the main checkout — only within ${ROOT}.
- The app lives under \`web/\` (i.e. ${WEB}). Run every command from there (\`cd ${WEB}\` first). The \`@/\` alias resolves to \`${WEB}/src/\`.
- This IS a git worktree on branch \`agent/gen-scope\`. Prefix node/npm commands with \`${NVM}\` so they run on Node 20 (the pinned version).

AUTHORITATIVE SPEC — READ IT, do not rely on memory:
- ${ROOT}/${PLAN}  (the implementation plan: locked decisions GS-D1..D7, per-file changes WITH LINE NUMBERS, Phase 1..5, invariants in "§0 Ground rules")
- ${ROOT}/CLAUDE.md  ("Two formats (standard + Champions)", "Models & providers (Grok primary)", "Gotchas", "Testing", "Key conventions")
Read the plan sections your phase names BEFORE writing code. The plan wins over anything stated here.

NON-NEGOTIABLE INVARIANTS (implementation-plan §0 — do NOT "improve" them away):
- SCOPE/FORMAT IS NEVER AN LLM-VISIBLE TOOL INPUT. The model gets a scope-specific system prompt + scope-filtered tool results; it has NO parameter to widen scope. NEVER add a format/mode/scope field to any tool's JSON schema.
- TOOL NAMES and tool OUTPUT FIELD NAMES are a frozen contract (docs/agent-design/tools.md). In particular \`is_gen9_native\` and \`source_generation\` KEEP THEIR NAMES; only their SEMANTICS generalize ("native to the active format's game"). NEVER rename them.
- Tools never throw in-domain; the runtime never throws for in-domain failures — return documented shapes / a valid OakAnswer.
- PARITY: every domain-SEMANTIC prompt change lands in BOTH \`src/agent/prompts/domain.ts\` AND \`src/agent/prompts/domain-grok.ts\`, sourced from the SAME \`src/agent/prompts/gen-info.ts\`. \`champions.ts\` and \`GROK_CHAMPIONS_*\` are UNTOUCHED by this feature.
- PURE MODULES stay pure (no \`server-only\` / \`@/env\` / SDK imports): \`src/data/formats.ts\`, \`src/agent/schemas.ts\`, \`src/lib/sse/sse-types.ts\`, and the new \`src/lib/scope/*\`. They are on the portable-modules list.
- \`AgentMode\` WIDENS to include the gen scopes; \`"standard"\` REMAINS the gen-9 alias (all existing \`mode === "champions"\` guards and the \`"standard"\` default stay valid). GS-D1: supported gens are 5,6,7,8; gen 9 keeps the \`"scarlet-violet"\` format name; gens 1–4 are OUT of scope.
- No DB migration is needed (GS-D6: format columns are plain \`text\`, no CHECK constraint).

CONVENTIONS (CLAUDE.md):
- Zod (\`src/agent/schemas.ts\`) is the single source of truth; the generated JSON Schema feeds all three providers. Don't hand-maintain a duplicate.
- Repos are the sole Postgres readers, async, \`import "server-only"\`, read the \`@/data/db\` singleton, \`.mapWith(Number)\` on counts, \`ilike\` (not \`like\`), \`bigint({mode:"number"})\` epoch-ms.
- Error styles split at the runtime/route seam: structured shapes in the tool/data layer; try/catch → error mapping at the HTTP edge.
- \`env.ts\` validates eagerly and throws on a missing \`XAI_API_KEY\`; that's why the route dynamically imports the runtime.
- Component tests (jsdom) render fixture payloads ONLY and must NEVER import db/repos/runtime.
- Node tests that pull a \`server-only\` module must \`vi.mock("server-only", () => ({}))\`. Tests that exercise \`resolve_entity\` must \`installAsSingleton(fix)\` (sets \`globalThis.__oakDb\` + resets the resolve cache) — NOT only bind \`ctx.db\`.

REFERENCE PATTERNS to mirror (read before writing the analogous file):
- gen-provider real-behavior test: \`web/src/data/pkmn/gen-provider.test.ts\` (\`beforeAll\` calls real \`loadFormat\` once; asserts roster floors offline).
- ingest builder tests: \`web/src/ingest/build-learnsets.test.ts\`, \`web/src/ingest/build-pokedex.test.ts\`.
- route integration: \`web/test/api-chat.integration.test.ts\` (mocks \`runOak\` + \`createAgentContext\` + \`getCurrentAccount\`→null; parses SSE frames), \`web/test/chat-route-persistence.integration.test.ts\` (real Testcontainers Postgres; captures \`ctx.mode\` via a hoisted \`createAgentContext\` mock).
- prompt structure tests: \`web/src/agent/prompts/style.test.ts\` (Grok block), \`web/src/agent/prompts/domain-grok.test.ts\`.
- component test: \`web/src/components/answer-card/*.test.tsx\` (jsdom, fixtures only).

EXECUTION RULES:
- Create files at the EXACT paths the plan names. Edit \`shared\` (pre-existing) files SURGICALLY and ADDITIVELY so other phases and existing behavior are unaffected.
- Only create/edit files inside YOUR sub-task's ownership. Do NOT touch another sub-task's files.
- Do NOT run the build gate yourself (a separate verifier owns typecheck/lint/vitest). You MAY read files, run read-only \`git\`/\`grep\`, and run \`${NVM} cd ${WEB} && npm run typecheck\` to self-check before returning.`

// ─────────────────────────────────────────────────────────────────────────────
// PHASES — mapped from implementation-plan.md Phase 1..5 onto a 7-node DAG.
//   depends_on / owns / shared / test_focus are the manifest.
//   gateTest: the phase-specific vitest invocation appended after STATIC.
//   project: 'node' (Docker) | 'jsdom' (no Docker) — drives the Docker soft-pass.
//   task | (pre?,fanout,post?): implementer structure.
//   securityReview: optional adversarial concern.
// ─────────────────────────────────────────────────────────────────────────────
const PHASES = [
  {
    id: 'p1',
    name: 'Formats / types / gen-provider foundation',
    depends_on: [],
    owns: ['web/src/data/formats.test.ts'],
    shared: ['web/src/data/formats.ts', 'web/src/agent/types.ts', 'web/src/data/pkmn/gen-provider.ts', 'web/src/data/pkmn/gen-provider.test.ts'],
    project: 'node',
    gateTest: `npx vitest run --project node src/data/formats.test.ts src/data/pkmn/gen-provider.test.ts`,
    docs: ['Locked decisions GS-D1/GS-D2', 'Phase 1 §1.1 formats.ts', '§1.2 types.ts', '§1.3 gen-provider.ts', '§1.6 tests'],
    test_focus: 'formatForMode∘modeForFormat round-trip for all 6 formats; genNumberForFormat/basisForFormat tables; real @pkmn Dex.forGen(7) roster + learnset + genNumber===7',
    task: `PHASE P1 — FORMATS / TYPES / GEN-PROVIDER FOUNDATION. Read implementation-plan §1.1, §1.2, §1.3, §1.6 and GS-D1/GS-D2. These three source files are the tightly-coupled type/source HUB — do them together so Format / AgentMode / genNumber stay consistent. KEEP the dependency arrow one-directional: \`formats.ts\` → \`types.ts\` (both type-only), NO import cycle.
1. \`web/src/data/formats.ts\` (SHARED, stays PURE): add \`GenFormat = "gen-5"|"gen-6"|"gen-7"|"gen-8"\`; widen \`Format\` to \`"scarlet-violet"|"champions"|GenFormat\`; make \`FORMATS\` the 6-entry tuple in the plan's stable order (scarlet-violet, champions, gen-5..gen-8). DEFAULT_FORMATS stays = FORMATS. STANDARD_FORMAT/CHAMPIONS_FORMAT/CHAMPIONS_REGULATION unchanged. \`formatForMode\`: champions→champions, "standard"→scarlet-violet, else \`return mode\` (gen scopes map 1:1). \`modeForFormat\`: inverse. ADD \`genNumberForFormat(format): number\` (scarlet-violet|champions → 9, else Number of the gen digit) and \`basisForFormat(format): string\` (champions→"champions", scarlet-violet→"gen-9", else the format string). \`isFormat\` needs no change.
2. \`web/src/agent/types.ts\` (SHARED): widen \`AgentMode\` (~line 29) to \`"standard"|"champions"|GenFormat\` via a type-only import of \`GenFormat\` from \`@/data/formats\`. If lint flags the cycle, define \`GenFormat\` inline in ONE module and derive the other from it (one source of truth; leave a comment). Update the \`AgentMode\` doc comment (server-controlled scope; "standard"=Gen 9; gen scopes added by generation-scope; STILL never an LLM-visible tool input).
3. \`web/src/data/pkmn/gen-provider.ts\` (SHARED): add \`genNumber: number\` to \`FormatSource\`. In \`loadFormat\`, keep the CHAMPIONS branch (genNumber 9); in the else branch use \`const gen = genNumberForFormat(format); dex = Dex.forGen(gen); roster = standardRoster(dex);\` and set genNumber. In \`standardRoster\`/\`isRealSpecies\` ALSO exclude \`isNonstandard === "Future"\` (gen 8/9 species appear as "Future" in an older-gen dex and must NOT be indexed) — but KEEP "Past" species (the BR-1 fallback). Extend the "Verified facts" header comment with what you probe below.
TESTS:
- \`web/src/data/formats.test.ts\` (NEW): for every FORMATS entry assert \`formatForMode(modeForFormat(f)) === f\`; table-test genNumberForFormat and basisForFormat.
- \`web/src/data/pkmn/gen-provider.test.ts\` (SHARED, REAL @pkmn — mirror its existing beforeAll style): add a \`loadFormat("gen-7")\` case — assert \`genNumber === 7\`, a plausible roster (a species that EXISTS in gen 7 present; one that must NOT exist e.g. Grookey absent), that NO \`isNonstandard === "Future"\` species passes \`exists\` in the gen-7 dex, a known learnset (e.g. Alolan Raichu), and that the battle-type set builds (older gens may have <18 types; the BATTLE_TYPE_NAMES intersection handles it). Record the probed facts in the header comment.`,
  },
  {
    id: 'p2',
    name: 'Ingest builders + run.ts',
    depends_on: ['p1'],
    owns: [],
    shared: ['web/src/ingest/build-learnsets.ts', 'web/src/ingest/build-learnsets.test.ts', 'web/src/ingest/build-pokedex.ts', 'web/src/ingest/build-pokedex.test.ts', 'web/src/ingest/run.ts'],
    project: 'node',
    gateTest: `npx vitest run --project node src/ingest`,
    docs: ['Phase 1 §1.4 Ingest builders', '§1.5 Schema (none needed)', 'GS-D4 encounters'],
    test_focus: 'genFilter keeps 7L/7M and drops 9M; a gen-7 row carries generation:"gen-7"; a "Past" species → is_gen9_native 0 + source_generation; encounters appended only for scarlet-violet',
    fanout: [
      {
        label: 'learnsets',
        files: 'web/src/ingest/build-learnsets.ts (+ build-learnsets.test.ts)',
        detail: `Generalize the gen filter (§1.4). Replace \`opts: { format: Format; gen9Only: boolean }\` with \`opts: { format: Format; genFilter?: number }\`; keep a source iff \`genFilter === undefined\` (Champions) OR \`src[0] === String(genFilter)\`. Gen numbers are single-digit so the index-0 check stays valid. Update the header comment (D6/BR-2 now read "the format's generation", not "Gen 9"). TEST: add a case with \`genFilter: 7\` keeping "7L…"/"7M" and dropping "9M"; migrate the existing gen9Only cases to \`genFilter: 9\` / \`undefined\`; keep the champions + method-priority + edge cases green.`,
      },
      {
        label: 'pokedex',
        files: 'web/src/ingest/build-pokedex.ts (+ build-pokedex.test.ts)',
        detail: `In \`buildPokemonRow\` (§1.4) change \`generation: champions ? "champions" : "gen-9"\` to \`generation: champions ? "champions" : basisForFormat(format)\` (import \`basisForFormat\` from \`@/data/formats\`). The \`is_gen9_native\`/\`source_generation\` derivation is ALREADY format-relative — do NOT change it beyond comments; the column name \`is_gen9_native\` is FROZEN (now means "native to this format's game"). Update the \`PokemonRow\` doc comments (format union widened; is_gen9_native meaning generalized). TEST: a gen-7 row (build via \`Dex.forGen(7)\` like the existing gen-9 cases, or a fakeSpecies with format "gen-7") carries \`generation: "gen-7"\`; a "Past"-flagged species still yields \`is_gen9_native: 0\` + \`source_generation\` as before.`,
      },
    ],
    post: `P2 INTEGRATOR — \`web/src/ingest/run.ts\` (SHARED, §1.4): replace \`const gen9Only = format === STANDARD_FORMAT;\` with \`const isChampions = format === CHAMPIONS_FORMAT; const genFilter = isChampions ? undefined : source.genNumber;\` and pass \`{ format, genFilter }\` to \`buildLearnsetRows\`. Change the encounter-append gate from \`if (gen9Only)\` to \`if (format === STANDARD_FORMAT)\` (GS-D4 — encounters stay scarlet-violet-only). Skim \`build-names.ts\`, \`build-reference.ts\`, \`build-encounters.ts\` for any HARDCODED gen-9 assumption (they consume FormatSource and are already format-parameterized — expect NO signature change; fix only a stray "gen 9" string if you find one). NO schema/migration change (GS-D6 — verified no CHECK constraint on any format column). Do not run the gate.`,
  },
  {
    id: 'p3',
    name: 'Prompts + gen-info (PARITY)',
    depends_on: ['p1'],
    owns: ['web/src/agent/prompts/gen-info.ts', 'web/src/agent/prompts/parity.test.ts'],
    shared: ['web/src/agent/prompts/domain.ts', 'web/src/agent/prompts/domain-grok.ts', 'web/src/agent/prompts/style.test.ts', 'web/src/agent/prompts/domain-grok.test.ts'],
    project: 'node',
    gateTest: `npx vitest run --project node src/agent/prompts`,
    docs: ['Phase 2 §2.1 gen-info.ts', '§2.2 domain.ts', '§2.3 domain-grok.ts', '§2.4 prompt tests', 'PARITY invariant §0'],
    test_focus: 'both bodies built for "standard" and "gen-7" carry the right label+basisTag and drop "Generation 9" for gen-7; parity guard: both bodies contain each mainline mode\'s basisTag+label; champions bodies unchanged',
    securityReview: `PARITY + CONTRACT. Confirm EVERY domain-semantic change (info.label, info.basisTag, info.mechanicsNotes, info.encountersNote, all few-shot \`generation_basis\` strings + citations, the Ceruledge→gen-5-era example swap, the "is_gen9_native is a historical name" sentence) landed in BOTH \`domain.ts\` AND \`domain-grok.ts\`, sourced from the SAME \`MAINLINE_GEN_INFO\` in \`gen-info.ts\`. \`champions.ts\` and \`GROK_CHAMPIONS_*\` are UNTOUCHED. \`is_gen9_native\`/\`source_generation\` are referenced by their FROZEN names (semantics generalized, names not renamed). The Grok XML section structure (\`<constraints>\`, \`<data_rules>\`, \`<tool_routing>\`, \`<output_contract>\`, \`<stop_condition>\`) is unchanged — only the generation-fact TEXT inside it changed. Each per-mode prefix is byte-stable across turns (per-mode memoization).`,
    pre: {
      label: 'gen-info',
      files: 'web/src/agent/prompts/gen-info.ts',
      detail: `\`web/src/agent/prompts/gen-info.ts\` (NEW) — the SINGLE source of per-gen prompt facts consumed by BOTH prompt bodies (parity by construction), per §2.1. Export \`interface MainlineGenInfo { basisTag; label; gamesShort; mechanicsNotes; encountersNote }\` and \`export const MAINLINE_GEN_INFO: Record<"standard"|"gen-5"|"gen-6"|"gen-7"|"gen-8", MainlineGenInfo>\`. \`basisTag\` MUST equal \`basisForFormat(formatForMode(mode))\` ("gen-9" for standard, else the gen string). Author \`mechanicsNotes\` CAREFULLY — they are the model's ONLY guard against off-gen mechanics: gen-5 = no gimmick, NO Fairy type (trust the ingested gen-5 type chart), physical/special split present; gen-6 = Mega Evolution, Fairy type introduced; gen-7 = Megas + Z-Moves, no Dynamax/Tera; gen-8 = Dynamax/Gigantamax, NO Megas/Z-Moves, no Tera; standard(gen-9) = Terastallization, no Megas/Z/Dynamax. \`encountersNote\`: gens 5–8 have NATIVE catch/location data (get_encounters spans Gen 1–8) unlike gen 9. Note that "can learn move X" is evaluated against THAT gen's learnset. Type-only \`import type { AgentMode } from "@/agent/types"\` keeps this module pure. Create ONLY this file; it must compile standalone.`,
    },
    fanout: [
      {
        label: 'domain',
        files: 'web/src/agent/prompts/domain.ts (Claude/OpenAI Markdown body ONLY — do NOT touch any test file)',
        detail: `§2.2. Convert \`STANDARD_SYSTEM_PROMPT\` (~line 31) and \`STANDARD_FEW_SHOT\` (~line 299) into BUILDERS \`standardSystemPrompt(info)\` / \`standardFewShot(info)\` — template-literal functions over the existing text. Memoize per mode (\`const cache = new Map<AgentMode, PromptDomain>()\`) so each scope's prefix is byte-stable. Parameterize at minimum: Rule 2 ("based on Generation 9…") → \`info.label\` + generalize the is_gen9_native sentence (field name is historical → "native to the ACTIVE generation"); Rule 3 learnset → \`info.label\`; INSERT \`info.mechanicsNotes\` as a numbered rule; the encounters section (~lines 83–91) → \`info.encountersNote\`; every few-shot \`generation_basis:{generation:"gen-9"…}\` → \`info.basisTag\` and citation "(gen-9)" → "(<basisTag>)"; reword the Ceruledge Trick-Room few-shot to gen-5-era standouts (e.g. Dusknoir + Chandelure) valid in every supported scope — keep structure identical. \`domainForMode(mode)\` (~line 510): champions → CHAMPIONS_DOMAIN unchanged; else a cached standard domain built from \`MAINLINE_GEN_INFO[mode]\`. Import \`MAINLINE_GEN_INFO\` from \`./gen-info\`. Do NOT touch \`champions.ts\`. Do NOT edit any \`*.test.ts\` — the POST integrator owns all prompt-test edits.`,
      },
      {
        label: 'domain-grok',
        files: 'web/src/agent/prompts/domain-grok.ts (Grok XML body ONLY — do NOT touch any test file)',
        detail: `§2.3. Apply the SAME parameterization to \`GROK_STANDARD_SYSTEM_PROMPT\` (~line 27) / \`GROK_STANDARD_FEW_SHOT\` (~line 339) and \`grokDomainForMode\` (~line 1096), sourcing from the SAME \`MAINLINE_GEN_INFO\` (import from \`./gen-info\`). Convert the two GROK_STANDARD consts to per-mode builders memoized like domain.ts. The XML section structure (\`<role>\`, \`<task>\`, \`<constraints>\`, \`<data_rules>\`, \`<tool_routing>\`, \`<reasoning>\`, \`<output_contract>\`, \`<stop_condition>\`, etc.) MUST NOT change — only the generation-fact TEXT inside \`<data_rules>\` and the few-shot basis strings. \`GROK_CHAMPIONS_*\` untouched. Do NOT edit any \`*.test.ts\` — the POST integrator owns all prompt-test edits.`,
      },
    ],
    post: `P3 PROMPT-TESTS + PARITY GUARD (owns ALL prompt-test edits so the two body agents never collide on a test file). §2.4:
- UPDATE \`web/src/agent/prompts/style.test.ts\` and \`web/src/agent/prompts/domain-grok.test.ts\`: build for "standard" AND at least one gen scope ("gen-7"); assert the Claude byte-identical path + the Grok XML sections still hold, the body contains the right \`info.label\` and \`info.basisTag\`, and does NOT contain "Generation 9" when built for gen-7. Keep the champions-body assertions (champions_scope, "NO Terastallization", 8-example few-shot, etc.) green. If the standard consts were removed in favor of builders, update the assertions to build via \`domainForMode("standard")\` / \`grokDomainForMode("standard")\`.
- CREATE \`web/src/agent/prompts/parity.test.ts\` (NEW): for each mainline mode in ["standard","gen-5","gen-6","gen-7","gen-8"], build BOTH \`domainForMode(mode)\` and \`grokDomainForMode(mode)\` and assert each body's systemPrompt+fewShot contains \`MAINLINE_GEN_INFO[mode].basisTag\` AND \`.label\` — the semantic-drift tripwire the gate enforces. Also assert building for "gen-7" does NOT emit "Generation 9" in either body. Do not run the gate.`,
  },
  {
    id: 'p4',
    name: 'Runtime + schemas + tools',
    depends_on: ['p1'],
    owns: ['web/src/agent/tools/gen-scope.oracle.test.ts'],
    shared: ['web/src/agent/runtime.ts', 'web/src/agent/runtime.test.ts', 'web/src/agent/schemas.ts', 'web/src/agent/tools/get-encounters.ts', 'web/test/fixtures/tools-fixture.ts'],
    project: 'node',
    gateTest: `npx vitest run --project node src/agent/runtime.test.ts src/agent/tools`,
    docs: ['Phase 2 §2.5 runtime.ts', '§2.6 schemas.ts', '§2.7 tools', '§2.8 tests', 'GS-D4/GS-D7'],
    test_focus: 'synthesized fallback answers carry the mode\'s basis tag; team enum accepts all 6 formats; get-encounters reads STANDARD_FORMAT off-champions; a gen-7 oracle read returns the gen-7 row-set',
    fanout: [
      {
        label: 'runtime',
        files: 'web/src/agent/runtime.ts + web/src/agent/runtime.test.ts',
        detail: `§2.5. \`synthesizeInsufficientData\` (~line 607) and \`synthesizeFromProse\` (~line 630) hardcode \`generation_basis: { generation: "gen-9", fallback: false }\` (~lines 618/639). Give BOTH an extra \`mode: AgentMode\` param and set \`generation: basisForFormat(formatForMode(mode))\` (import both from \`@/data/formats\`). Update the 2–3 call sites (~846/847/1025/1051) to thread \`ctx.mode\`. NO change to buildSystemSegments (it already passes \`ctx.mode\`) or the team-legality validation (already uses \`formatForMode(ctx.mode)\`). TEST (\`runtime.test.ts\`): a synthesized fallback answer built for a gen mode carries that mode's basis tag (e.g. mode "gen-7" → \`generation: "gen-7"\`). Do NOT touch schemas.ts / tools / the fixture (other sub-tasks own them).`,
      },
      {
        label: 'schemas',
        files: 'web/src/agent/schemas.ts',
        detail: `§2.6. Widen the two team format enums (\`proposedTeamSchema\` ~line 692 and \`savedTeamSchema\` ~line 705) from \`z.enum(["scarlet-violet","champions"])\` to \`z.enum(FORMATS)\` — \`import { FORMATS } from "@/data/formats"\` (pure module → keeps schemas.ts client-safe). If the Zod version rejects the readonly tuple, spread \`z.enum([...FORMATS])\`. This re-warms the save_team / submit_answer JSON Schema once per provider — expected, no action. Change NOTHING else in this file (frozen contract).`,
      },
      {
        label: 'tools',
        files: 'web/src/agent/tools/get-encounters.ts',
        detail: `§2.7 / GS-D4. In \`get-encounters.ts\` (~line 44) change the format passed to \`getEncounters\` from \`formatForMode(ctx.mode)\` to ALWAYS \`STANDARD_FORMAT\` for non-champions modes (encounter reference rows only exist under scarlet-violet; the data spans Gen 1–8). Keep the champions gate (\`ctx.mode === "champions"\` → \`not_available_in_champions\`) unchanged. Import \`STANDARD_FORMAT\` from \`@/data/formats\`. Do NOT change any other tool — the other 13 \`formatForMode(ctx.mode)\` sites generalize automatically (the POST agent audits them read-only). Add NO new tool input field.`,
      },
    ],
    post: `P4 GEN-7 ORACLE FIXTURE + AUDIT. §2.8:
- \`web/test/fixtures/tools-fixture.ts\` (SHARED — additive): add a SMALL gen-7 slice (3–5 Pokémon) with ONE learnset divergence from gen 9 (a move that is gen-7-legal but NOT gen-9-legal). Seed \`pokemon\`/\`learnset\`/\`searchable_names\`/\`reference_cache\`/\`ingest_meta\` rows under \`format: "gen-7"\` so the index reads "available". Do NOT disturb the existing scarlet-violet + champions rows.
- \`web/src/agent/tools/gen-scope.oracle.test.ts\` (NEW): with \`ctx.mode = "gen-7"\`, prove a tool read (e.g. get-pokemon / query-pokedex / resolve_entity) returns the gen-7 row-set and reflects the divergence. Remember \`installAsSingleton(fix)\` (the resolve-index Gotcha) if you exercise resolve_entity. Mirror an existing \`*.oracle.test.ts\`.
- AUDIT (read-only, report in notes): grep all 14 \`formatForMode(ctx.mode)\` call sites (11 tools + runtime x2 + enrich-answer.ts) — confirm they generalize with NO signature change, and that \`compute-stat.tool.ts\` (champions branch) + \`get-usage-stats.tool.ts\` (\`!== "champions"\` gate) are correct under the widened union. Do not run the gate.`,
  },
  {
    id: 'p5',
    name: 'Scope resolver + route wiring (GS-B)',
    depends_on: ['p4'],
    owns: ['web/src/lib/scope/detect-scope.ts', 'web/src/lib/scope/scope-label.ts', 'web/src/lib/scope/detect-scope.test.ts'],
    shared: ['web/src/server/session-store.ts', 'web/src/server/session-store.test.ts', 'web/src/data/repos/conversation-repo.ts', 'web/src/lib/sse/sse-types.ts', 'web/src/lib/admin/admin-types.ts', 'web/src/app/api/chat/route.ts', 'web/test/api-chat.integration.test.ts', 'web/test/chat-route-persistence.integration.test.ts'],
    project: 'node',
    gateTest: `npx vitest run --project node src/lib/scope src/server/session-store.test.ts test/api-chat.integration.test.ts test/chat-route-persistence.integration.test.ts`,
    docs: ['Phase 3 §3.1 detect-scope', '§3.2 session-store', '§3.3 conversation-repo', '§3.4 route.ts', '§3.5 sse-types', '§3.6 tests', 'GS-D3/GS-D5'],
    test_focus: 'lexicon precision + mandatory guards; sticky scope get/set/TTL; scope event + source; unsupported-gen short-circuit; resume-switch persists conversation.format',
    securityReview: `SCOPE INVARIANT (implementation-plan §0 / GS-D3). Confirm: scope/format is NEVER exposed as an LLM-visible tool input (NO new param on any tool JSON schema — grep \`src/agent/tools\` + \`schemas.ts\`); resolution is DETERMINISTIC (lexicon only, NO model call); the persist of a switch is FIRE-AND-FORGET (\`void … .catch(log)\`, never awaited); the unsupported-gen branch SHORT-CIRCUITS a synthesized in-domain answer BEFORE any \`runOak\` call and rides a normal \`answer\` event (never \`error\`); precision-over-recall guards hold (region adjectives alolan/galarian/hisuian/paldean do NOT match; ambiguous sun/moon/black/white/x/y/sword/shield need a pair or unambiguous token; "mega" never matches); \`send("scope", …)\` is the FIRST stream event.`,
    fanout: [
      {
        label: 'detect-scope',
        files: 'web/src/lib/scope/detect-scope.ts + web/src/lib/scope/scope-label.ts + web/src/lib/scope/detect-scope.test.ts',
        detail: `§3.1 (NEW, PURE/client-safe — a future iOS client reuses these; \`import type { Format } from "@/data/formats"\` ONLY). \`detect-scope.ts\` exports \`type ScopeDetection = { kind:"scope"; format: Format; matched: string } | { kind:"unsupported"; label: string; matched: string } | null\` and \`detectScopeSignal(message): ScopeDetection\`. Case-insensitive word-boundary regexes over the raw message; FIRST-MATCH-WINS with more-specific patterns first and CHAMPIONS ordered FIRST (an explicit "champions" is the stronger signal). Encode the FULL lexicon table + MANDATORY GUARDS from §3.1 (region-form adjectives never match; ambiguous single words need a pair/unambiguous token; "mega" is never a signal; gens 1–4 → \`{ kind:"unsupported", label:"gen-3"|… }\`). \`scope-label.ts\` exports \`scopeLabel(format): string\` ("Champions · Reg M-B", "Gen 9 · Scarlet/Violet", "Gen 7 · USUM", …) — a tiny pure helper the UI + iOS reuse. \`detect-scope.test.ts\`: a table-driven suite of ≥30 messages covering every lexicon row PLUS every guard, incl. mixed cases ("my alolan raichu in scarlet"→scarlet-violet; "is tera blast good on my champions team"→champions).`,
      },
      {
        label: 'session-store',
        files: 'web/src/server/session-store.ts (+ session-store.test.ts)',
        detail: `§3.2 (SHARED — additive). Add a PARALLEL scope map with the SAME lifecycle as guest history: a second \`BoundedStore<Format>\` on \`globalThis\` (mirror the existing \`getStore()\`), config \`{ maxEntries: SESSION_MAX_ENTRIES, ttlMs: SESSION_TTL_MS }\`. Export \`getSessionScope(sessionId): Format | undefined\` and \`setSessionScope(sessionId, format: Format): void\`. Clear it in \`_resetStoreForTests\` too. Do NOT fold scope into the ChatMessage entries (trim/getHistory + tests depend on that shape). TEST: get→undefined before set; set→get round-trips; TTL + \`_resetStoreForTests\` clear it.`,
      },
      {
        label: 'conversation-repo',
        files: 'web/src/data/repos/conversation-repo.ts',
        detail: `§3.3 (SHARED — additive). Add \`export async function updateConversationFormat(accountId, conversationId, format: Format): Promise<void>\` — a single \`db.update(conversation).set({ format }).where(and(eq(account_id, accountId), eq(id, conversationId)))\`, mirroring \`renameConversation\` (~line 360). Account-scoped like every other write. Import \`Format\` from \`@/data/formats\`.`,
      },
      {
        label: 'wire-types',
        files: 'web/src/lib/sse/sse-types.ts + web/src/lib/admin/admin-types.ts',
        detail: `§3.5 (SHARED — additive; both stay client-safe). \`sse-types.ts\`: add \`export interface ScopeEvent { format: Format; source: "message"|"conversation"|"toggle" }\` (\`import type { Format } from "@/data/formats"\` — pure), extend \`SseEventName\` with "scope" and \`SseEventDataMap\` with \`scope: ScopeEvent\`, and add one line to the protocol doc-comment. \`ChatRequestBody\` unchanged (champions_mode stays; semantics now = seed). \`admin-types.ts\`: widen \`TurnMode\` (~line 42) from \`"standard"|"champions"\` to the full \`AgentMode\` (type-only \`import type { AgentMode } from "@/agent/types"\` — pure, so admin-types stays client-safe) so \`turn_record.mode\` can carry gen scopes; one source of truth.`,
      },
    ],
    post: `P5 ROUTE INTEGRATOR — \`web/src/app/api/chat/route.ts\` (SHARED, surgical: all changes live between body-parse and \`createAgentContext\`; SSE mechanics untouched except ONE new event) + the two integration tests. Implement §3.4 steps 1–7 EXACTLY:
1. Replace the mode derivation (~line 218) with a SEED: \`const seedFormat: Format = body.champions_mode ? CHAMPIONS_FORMAT : STANDARD_FORMAT;\`.
2. In the history block (step 3): capture a \`stickyFormat\` instead of assigning mode — signed-in + existing conversation: \`stickyFormat = conv.format as Format\` (replaces the ~line 330 \`mode = modeForFormat(conv.format)\`); guest: \`stickyFormat = getSessionScope(session_id)\`; new conversation: undefined.
3. Immediately after the history block: \`const detection = detectScopeSignal(message); const format: Format = (detection?.kind === "scope" ? detection.format : undefined) ?? stickyFormat ?? seedFormat; const mode: AgentMode = modeForFormat(format);\`. Log one structured line when a signal fired (\`{ event:"scope_signal", matched, from, to }\`).
4. Persist a switch (fire-and-forget): signed-in + conversation exists + \`format !== conv.format\` → \`void repo.updateConversationFormat(account.id, session_id, format).catch(log)\`; guest → \`setSessionScope(session_id, format)\` every turn. (\`appendTurnPair\` stamps format only on CREATE, verified — so this UPDATE is needed for a mid-conversation switch.)
5. Unsupported-gen (\`detection.kind === "unsupported"\`): do NOT run the agent. AFTER the stream opens, synthesize an in-domain OakAnswer (status "insufficient_data"; honest "I don't have Generation N data yet — I currently cover Gen 5–9 and Pokémon Champions…"; \`generation_basis { generation:"unsupported", fallback:false, note }\`; \`uncertainty_flags ["unsupported_generation_requested"]\`) and emit it as the terminal \`answer\` event (NEVER \`error\`). Persist the turn pair as usual.
6. Emit the resolved scope FIRST inside \`start()\`'s async task, before any tool activity: \`send("scope", { format, source: detection ? "message" : stickyFormat ? "conversation" : "toggle" })\`.
7. \`mode\` flows downstream exactly as before (ctx, \`formatForMode(mode)\` at persist, \`turn_record.mode\`).
TESTS — extend \`web/test/api-chat.integration.test.ts\` (guest) and \`web/test/chat-route-persistence.integration.test.ts\` (signed-in, real Postgres, already captures ctx.mode): (a) "analyze my gen 7 team" on a fresh session with \`champions_mode: true\` → \`scope\` event carries gen-7 AND the captured ctx.mode is gen-7; (b) a second message with no signal → still gen-7 (stickiness); (c) a "gen 3" message → terminal \`answer\` with \`uncertainty_flags ["unsupported_generation_requested"]\` and NO agent run; (d) signed-in resume of a stored champions conversation + an "in scarlet and violet…" message → scope switches AND conversation.format is updated (assert via the repo).`,
  },
  {
    id: 'p6',
    name: 'Client UI (GS-C)',
    depends_on: ['p5'],
    owns: ['web/src/components/controls/ScopeChip.tsx', 'web/src/components/controls/ScopeChip.test.tsx'],
    shared: ['web/src/lib/sse/sse-client.ts', 'web/src/lib/sse/sse-client.test.ts', 'web/src/components/controls/ChampionsToggle.tsx', 'web/src/app/page.tsx', 'web/src/lib/api/history-client.ts', 'web/src/app/api/conversations/import/route.ts'],
    project: 'node',
    gateTest: `npx vitest run --project jsdom src/components/controls test/sse-client.fullstack.test.tsx && npx vitest run --project node src/lib/sse/sse-client.test.ts`,
    docs: ['Phase 4 §4.1 sse-client', '§4.2 page.tsx', '§4.3 scope chip', 'GS-C'],
    test_focus: 'parseFrame handles the scope frame; the hook exposes scope; ScopeChip renders per format; the import path carries the resolved format',
    uiTestNote: true,
    fanout: [
      {
        label: 'sse-client',
        files: 'web/src/lib/sse/sse-client.ts (+ sse-client.test.ts)',
        detail: `§4.1. Add a \`case "scope"\` to \`parseFrame\` (~line 85 — it hard-switches on known event names and SILENTLY DROPS unknowns, so without this the frame never reaches the hook). Add a \`scope\` field to \`SseClientState\`, set it in the stream-consumer loop (~lines 405–463: \`else if (event.event === "scope")\`), and include it in the hook's return. Update \`sse-client.test.ts\` with a recorded \`scope\` frame asserting parseFrame returns it and the hook exposes it. Do NOT touch page.tsx / ScopeChip / the import flow.`,
      },
      {
        label: 'scope-chip',
        files: 'web/src/components/controls/ScopeChip.tsx (+ ScopeChip.test.tsx) + web/src/components/controls/ChampionsToggle.tsx',
        detail: `§4.3. \`ScopeChip.tsx\` (NEW): a small pill showing the active scope via \`scopeLabel(format)\` from \`@/lib/scope/scope-label\`. Pure props \`{ format }\`. \`ScopeChip.test.tsx\` (jsdom — fixtures ONLY, never import repos/runtime): renders the right label for champions, scarlet-violet, and gen-7. \`ChampionsToggle.tsx\`: update ONLY the title/aria copy to seed semantics ("Start new chats in Champions scope"); behavior unchanged. Do NOT touch page.tsx / sse-client / the import flow.`,
      },
      {
        label: 'page',
        files: 'web/src/app/page.tsx (the non-import wiring ONLY)',
        detail: `§4.2. Track \`resolvedScope: Format | null\` from the hook; update it on every \`scope\` event. \`artifactFormat\` (~line 354) → \`resolvedScope ?? (championsMode ? "champions" : "scarlet-violet")\`. \`handleOpenConversation\` (~line 305): also \`setResolvedScope(detail.format)\`. Render \`<ScopeChip format={resolvedScope ?? …}/>\` in the header. Do NOT change the \`importConversation\` call or the import client/route here — the POST integrator owns the whole import flow (including this call site). Do NOT touch sse-client / ScopeChip.`,
      },
    ],
    post: `P6 IMPORT-FLOW INTEGRATOR — widen the import path so a guest thread that switched to gen-7 imports as gen-7 (§4.2). \`web/src/lib/api/history-client.ts\`: \`importConversation\` gains an optional \`format\`. \`web/src/app/api/conversations/import/route.ts\`: accept an optional \`format\` field validated by \`isFormat\` (keep \`champions_mode\` accepted for back-compat) and stamp the resolved format on the created conversation. Reconcile the \`importConversation\` call site in \`web/src/app/page.tsx\` to pass the resolved format (fall back to the toggle-derived one). Do not run the gate.`,
  },
  {
    id: 'p7',
    name: 'Docs, eval, backlog',
    depends_on: ['p2', 'p3', 'p5', 'p6'],
    owns: ['docs/agent-design/generation-scope-addendum.md'],
    shared: ['CLAUDE.md', 'README.md', 'docs/backlog.md', 'web/eval/deterministic.ts'],
    project: 'node',
    gateTest: `npx vitest run --project node eval`,
    docs: ['Phase 5 — docs, eval, backlog'],
    test_focus: 'the deterministic eval subset stays green, incl. a new gen-7 golden case if the fixture gained a gen-7 slice',
    task: `PHASE P7 — DOCS, EVAL, BACKLOG. Read implementation-plan Phase 5.
- \`docs/agent-design/generation-scope-addendum.md\` (NEW, mirror the T12–T14 append pattern): scope space widened to Champions + gens 5–9; scope remains server-resolved and NEVER LLM-visible; \`is_gen9_native\` semantics generalized (name frozen); \`generation_basis.generation\` value space now includes gen-5…gen-8; \`save_team\`/\`proposed_team\` format enum widened; BR-H6 amended (BR-H6′: conversation format sticky but switchable by an explicit in-message signal, persisted).
- \`CLAUDE.md\` (SHARED — additive): update "Two formats (standard + Champions)" → "Formats & scope resolution" (six formats; toggle = seed; resolver in \`src/lib/scope/\`; ingest builds all formats; the re-ingest gotcha now includes the new formats).
- \`README.md\` (SHARED — additive): user-facing multi-gen support + the scope chip.
- \`docs/backlog.md\` (SHARED — additive; create if absent): gens 1–4 support (stat/damage formula variants, no-nature era); optional LLM classifier fallback for ambiguous scope signals (gated on the scope_signal telemetry); per-gen encounter filtering nicety.
- EVAL: if the fixture DB gained a gen-7 slice (P4), add ONE golden case to the DETERMINISTIC subset (\`web/eval/deterministic.ts\`) — a learnset question whose answer differs between gen 7 and gen 9 — pinning the whole pipe end-to-end offline. Also author a gen-7 team-analysis golden case in the judged \`eval/\` suite (runs under \`npm run eval\`, NOT CI — leave it authored; running it is a deferred human step).
Do not run the gate.`,
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Integration checkpoints — dedicated gated + adversarial-verification agents.
//   keyed by the phase id they run AFTER.
// ─────────────────────────────────────────────────────────────────────────────
const CHECKPOINTS = {
  p2: {
    name: 'ingest-e2e',
    after: ['p2'],
    needsDocker: true,
    claim: `Multi-gen ingest is correct: the genFilter drops off-gen learnset sources, gen-7 rows carry generation:"gen-7", the frozen field names is_gen9_native/source_generation are unchanged, and encounters stay scarlet-violet-only (GS-D4).`,
    verify: `1) Run the broad gate \`${FULL_TEST}\` (Docker; apply the Docker soft-pass rule). 2) ADVERSARIALLY inspect \`src/ingest/build-learnsets.ts\`, \`build-pokedex.ts\`, \`run.ts\`: PROVE genFilter keeps only sources whose leading gen digit matches (undefined = Champions keeps all), that \`generation\` is \`basisForFormat(format)\` for mainline and "champions" for Champions, that \`is_gen9_native\`/\`source_generation\` are NOT renamed, and that encounters append ONLY for scarlet-violet. 3) BEST-EFFORT real ingest: \`${NVM} cd ${WEB} && npm run ingest -- --formats=gen-7 ; echo "OAK_EXIT=$?"\` (Bash timeout 600000). If it fails ONLY because no Docker/Postgres is reachable (DATABASE_URL unreachable / ECONNREFUSED / no container runtime), treat it as a DEFERRED human check (say so) — do NOT fail the checkpoint on that alone. If it runs, note the row counts. Report any off-gen leak or renamed field as a finding.`,
  },
  p5: {
    name: 'scope-resolver-e2e',
    after: ['p5'],
    needsDocker: true,
    claim: `The scope resolver picks message > sticky > seed correctly, scope is NEVER an LLM-visible tool input, and an unsupported gen is answered honestly WITHOUT running the agent on wrong-gen data.`,
    verify: `1) Run \`${FULL_TEST}\` (Docker soft-pass rule). 2) ADVERSARIALLY trace \`src/app/api/chat/route.ts\` + \`src/lib/scope/detect-scope.ts\`: confirm the precedence \`(detection?scope) ?? stickyFormat ?? seedFormat\`; that NO tool JSON schema gained a format/mode/scope field (grep \`src/agent/tools\` + \`schemas.ts\`); that resolution is a pure lexicon (no model call); that the persist of a switch is \`void … .catch\`; that the unsupported branch synthesizes a terminal \`answer\` (not \`error\`) BEFORE any \`runOak\` call; that \`send("scope", …)\` is the first stream event. 3) Confirm the integration tests assert stickiness, the resume-switch persisting \`conversation.format\`, and the unsupported flag. Report any scope leak into the tool surface or any path that runs the agent on the wrong gen.`,
  },
  p7: {
    name: 'feature-e2e',
    after: ['p7'],
    needsDocker: true,
    claim: `The full generation-scope path works end to end: a gen-7 signal resolves to gen-7, tools return gen-7 rows, the scope event + chip reflect it, and answers' basis reads gen-7 — with the whole suite green and the feature invariants intact.`,
    verify: `1) Run \`${FULL_TEST}\` (Docker soft-pass) AND best-effort \`${NEXT_BUILD}\` — if the build fails ONLY because env (e.g. XAI_API_KEY) is unset here, note it as a DEFERRED human check and do NOT fail the checkpoint on that alone. 2) ADVERSARIALLY trace the whole path: \`detectScopeSignal\` → route resolution → \`ctx.mode\` → scope-filtered repo rows (\`formatForMode\`) → runtime synthesize basis (\`basisForFormat\`) → \`scope\` SSE event → \`sse-client\` parseFrame → \`ScopeChip\`. Confirm PARITY held (both prompt bodies changed; champions.ts didn't) and the frozen field names are intact. 3) State that the LIVE browser smoke ("what's a good gen 7 team around Alolan Ninetales?" with Champions ON → chip flips to Gen 7, basis reads gen-7) + the judged eval are human follow-ups. Report gaps as findings.`,
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function byId(id) {
  return PHASES.find((p) => p.id === id)
}

// Deterministic Kahn topological sort; ties broken by PHASES array order.
function topoOrder(phases) {
  const ids = phases.map((p) => p.id)
  const indeg = {}
  const adj = {}
  for (const p of phases) {
    indeg[p.id] = 0
    adj[p.id] = []
  }
  for (const p of phases) {
    for (const d of p.depends_on || []) {
      adj[d].push(p.id)
      indeg[p.id]++
    }
  }
  const order = []
  let queue = phases.filter((p) => indeg[p.id] === 0).map((p) => p.id)
  queue.sort((a, b) => ids.indexOf(a) - ids.indexOf(b))
  while (queue.length) {
    const id = queue.shift()
    order.push(id)
    for (const n of adj[id]) {
      indeg[n]--
      if (indeg[n] === 0) queue.push(n)
    }
    queue.sort((a, b) => ids.indexOf(a) - ids.indexOf(b))
  }
  return order
}

function gateOf(ph) {
  return `${STATIC} && ${ph.gateTest}`
}

function header(ph) {
  return `${COMMON}

=== PHASE ${ph.id.toUpperCase()} — ${ph.name} ===
Read these implementation-plan sections first: ${(ph.docs || []).join(', ')}
Manifest test_focus: ${ph.test_focus}
OWNS (new files you create): ${ph.owns.length ? ph.owns.join(', ') : '(none — this phase only edits shared files)'}
SHARED (pre-existing files — edit SURGICALLY/ADDITIVELY): ${ph.shared.length ? ph.shared.join(', ') : '(none)'}
${ph.uiTestNote ? `UI TEST-PLACEMENT: the jsdom Vitest project scans \`src/components/**/*.test.tsx\` + \`test/**/*.test.tsx\` — NOT \`src/app/**\`. Put component tests under \`src/components/controls/\`; they render fixtures only and never import db/repos.` : ''}`
}

function verifyPrompt(ph) {
  const needsDocker = ph.project === 'node'
  return `You are the BUILD VERIFIER for phase ${ph.id.toUpperCase()} (${ph.name}).
Run EXACTLY this command (it can take minutes — call Bash with timeout 600000):

    ${gateOf(ph)} ; echo "OAK_EXIT=$?"

Capture combined stdout+stderr. ${needsDocker ? DOCKER_CLAUSE : 'This is the jsdom project — NO Docker is needed.'}
Determine pass/fail from the OAK_EXIT line (0 = pass). If it FAILED, extract the most relevant errors — lines with "error TS", "error:", "FAIL", "✖", "failed", "Expected", "Received", "Cannot find", "is not assignable", "Type error", "ESLint" plus a little surrounding context — and return up to ~120 lines as errorTail (trim noise; keep the actionable errors). If it PASSED, errorTail is "".
Do NOT modify any files. Do NOT try to fix anything. Return {passed, errorTail, summary}.`
}

function canRepair(tries) {
  if (tries >= MAX_REPAIR) return false
  if (budget.total && budget.remaining() < REPAIR_FLOOR) return false
  return true
}

async function runImplementers(ph) {
  if (ph.fanout) {
    if (ph.pre) {
      await agent(
        `${header(ph)}

YOUR FILE: ${ph.pre.files}
SPEC: ${ph.pre.detail}

Create ONLY this file. It must compile standalone and is the shared seam the fan-out depends on. Do not run the gate.`,
        { label: `${ph.id}:impl:${ph.pre.label}`, phase: ph.name, schema: IMPL_SCHEMA },
      )
    }
    const intro = `${header(ph)}`
    await parallel(
      ph.fanout.map((sub) => () =>
        agent(
          `${intro}

YOUR FILE(S): ${sub.files}
SPEC: ${sub.detail}

Create/edit ONLY these file(s) (plus their colocated test where the spec asks). Match the conventions and the plan's exact signatures/shapes. Do NOT touch other sub-tasks' files. Do not run the gate.`,
          { label: `${ph.id}:impl:${sub.label}`, phase: ph.name, schema: IMPL_SCHEMA },
        ),
      ),
    )
    if (ph.post) {
      await agent(`${header(ph)}

${ph.post}`, { label: `${ph.id}:impl:integrate`, phase: ph.name, schema: IMPL_SCHEMA })
    }
  } else {
    await agent(`${header(ph)}

${ph.task}`, { label: `${ph.id}:impl`, phase: ph.name, schema: IMPL_SCHEMA })
  }
}

async function buildPhase(ph) {
  log(`▶ ${ph.name} — implementing`)
  await runImplementers(ph)

  let verdict = await agent(verifyPrompt(ph), { label: `${ph.id}:verify`, phase: ph.name, schema: VERIFY_SCHEMA })
  let tries = 0
  while ((!verdict || !verdict.passed) && canRepair(tries)) {
    tries++
    const errs = (verdict && verdict.errorTail) || 'gate produced no structured output (treat as failed)'
    log(`✗ ${ph.name} gate failed — repair attempt ${tries}/${MAX_REPAIR}`)
    await agent(
      `${header(ph)}

The gate for this phase FAILED. Gate command:
    ${gateOf(ph)}
Error tail:
-----
${errs}
-----
FIX this phase's files in place (Read then Edit/Write) so the gate passes, WITHOUT breaking other files or existing behavior. Common Oak fixes:
- TS: add/repair types & exports; import shared types from their pure module (\`@/data/formats\`, \`@/agent/types\`); never \`any\`-cast around a real shape mismatch.
- Drizzle/DB: \`.mapWith(Number)\` on count/computed columns; \`ilike\` (not \`like\`); repos \`import "server-only"\` + the \`@/data/db\` singleton; oracle tests use \`vi.mock("server-only")\` + createPgSchema + installAsSingleton.
- PARITY: a domain-semantic change must be in BOTH domain.ts AND domain-grok.ts; if a prompt test fails on drift, fix the BODY, not just the test.
- Purity: keep \`formats.ts\`/\`schemas.ts\`/\`sse-types.ts\`/\`src/lib/scope/*\` free of server-only/env/SDK imports.
- jsdom component tests: must NOT import db/repos/runtime; render fixtures only.
Do NOT run the gate command yourself (you MAY run \`npm run typecheck\` to self-check). Return {filesWritten (the ones you changed), notes}.`,
      { label: `${ph.id}:repair:${tries}`, phase: ph.name, schema: IMPL_SCHEMA },
    )
    verdict = await agent(verifyPrompt(ph), { label: `${ph.id}:verify:${tries}`, phase: ph.name, schema: VERIFY_SCHEMA })
  }

  const passedAfterGate = !!(verdict && verdict.passed)

  // Optional adversarial security/correctness review (one repair pass on blocking issues).
  let review = null
  if (ph.securityReview && passedAfterGate) {
    log(`🔒 ${ph.name} — security/parity review`)
    review = await agent(
      `${header(ph)}

SECURITY / CORRECTNESS REVIEW. Inspect the changed files (\`cd ${ROOT} && git diff --stat\` then read them). Focus: ${ph.securityReview}
Report ONLY real, exploitable or correctness-affecting issues (no style nits). Return {issues, summary}.`,
      { label: `${ph.id}:secreview`, phase: ph.name, schema: REVIEW_SCHEMA, effort: 'high' },
    )
    const blocking = review && review.issues ? review.issues.filter((i) => i.severity === 'critical' || i.severity === 'high') : []
    if (blocking.length) {
      log(`🔒 ${ph.name} — ${blocking.length} blocking issue(s); applying fix`)
      await agent(
        `${header(ph)}

A review of this phase found issues that must be fixed:
${blocking.map((i) => `- [${i.severity}] ${i.file}: ${i.detail}`).join('\n')}
Fix them in place without breaking the gate or existing behavior. Return {filesWritten, notes}.`,
        { label: `${ph.id}:secfix`, phase: ph.name, schema: IMPL_SCHEMA },
      )
      verdict = await agent(verifyPrompt(ph), { label: `${ph.id}:verify:sec`, phase: ph.name, schema: VERIFY_SCHEMA })
    }
  }

  const finalPassed = !!(verdict && verdict.passed)
  log(`${finalPassed ? '✓' : '⚠'} ${ph.name} — ${finalPassed ? 'gate green' : `gate NOT green after ${tries} repair attempt(s)`}`)
  return {
    id: ph.id,
    name: ph.name,
    passed: finalPassed,
    repairs: tries,
    summary: (verdict && verdict.summary) || '',
    reviewIssues: review && review.issues ? review.issues.length : 0,
  }
}

async function commitPhase(ph) {
  const v = await agent(
    `Commit the completed, gate-green phase ${ph.id.toUpperCase()} (${ph.name}) of the generation-scope build, INSIDE the worktree.
Run (Bash timeout 120000, append \`; echo "OAK_EXIT=$?"\`):
    cd ${ROOT} && git add -A && git commit -m "feat(gen-scope): ${ph.name} [${ph.id.toUpperCase()}]" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
If \`git commit\` reports "nothing to commit", that's fine (passed=true). Do NOT modify any source files, do NOT push. Return {passed (commit succeeded or nothing to commit), errorTail, summary}.`,
    { label: `${ph.id}:commit`, phase: ph.name, schema: VERIFY_SCHEMA },
  )
  return !!(v && v.passed)
}

async function runCheckpoint(cp) {
  log(`◆ checkpoint ${cp.name} — gate + adversarial verification`)
  const verdict = await agent(
    `${COMMON}

=== INTEGRATION CHECKPOINT: ${cp.name} ===
This runs AFTER phase(s) ${cp.after.join(', ')}. It is BOTH a broad gate AND an adversarial proof of one claim. Do NOT modify files.

CLAIM TO VERIFY: ${cp.claim}

STEPS:
${cp.verify}

When running a command, use Bash with timeout 600000 and append \`; echo "OAK_EXIT=$?"\`. ${cp.needsDocker ? DOCKER_CLAUSE : ''}
Return {gatePassed, claimVerified, findings, errorTail, summary}.`,
    { label: `checkpoint:${cp.name}`, phase: `checkpoint:${cp.name}`, schema: CHECKPOINT_SCHEMA, effort: 'high' },
  )
  const ok = !!(verdict && verdict.gatePassed && verdict.claimVerified)
  log(`${ok ? '✓' : '⚠'} checkpoint ${cp.name} — ${ok ? 'verified' : 'NOT fully verified (see findings)'}`)
  return {
    name: cp.name,
    after: cp.after,
    gatePassed: !!(verdict && verdict.gatePassed),
    claimVerified: !!(verdict && verdict.claimVerified),
    findings: (verdict && verdict.findings) || [],
    summary: (verdict && verdict.summary) || '',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Drive the DAG — single shared worktree → STRICTLY SEQUENTIAL topo order.
//   Intra-phase fan-out (disjoint files, gate after the join) is where
//   parallelism lives. HALT-ON-RED: stop the moment a depended-on phase stays
//   red after repairs (later phases would only cascade failures). Each green
//   phase is committed on agent/gen-scope so nothing is lost and the run resumes.
// ─────────────────────────────────────────────────────────────────────────────
const ORDER = topoOrder(PHASES)
const phasesArg = ARGS.phases
const want = !phasesArg || phasesArg === 'all' ? null : Array.isArray(phasesArg) ? phasesArg : [phasesArg]
const selected = (id) => !want || want.includes(id)
const runIds = ORDER.filter(selected)

log(`Building Oak generation-scope — ${want ? `subset: ${want.join(', ')}` : 'full DAG p1–p7'} · root ${ROOT}`)
log(`Topological order (from depends_on): ${ORDER.join(' → ')}`)
if (want) log(`Subset build: unselected dependencies are assumed already present on disk from a prior run.`)

const results = []
const checkpointResults = []
const done = new Set()
let halted = false

for (const id of runIds) {
  const ph = byId(id)
  phase(`${ph.id.toUpperCase()} ${ph.name}`)

  const r = await buildPhase(ph)
  results.push(r)
  done.add(id)

  if (!r.passed) {
    log(`⛔ ${ph.name} did NOT reach a green gate after repairs — HALTING (later phases depend on it). Prior green phases are committed on agent/gen-scope; resume with resumeFromRunId after fixing.`)
    halted = true
    break
  }

  const committed = await commitPhase(ph)
  if (!committed) log(`⚠ ${ph.name} gate is green but the phase commit did not report success — changes remain in the worktree working tree.`)

  const cp = CHECKPOINTS[id]
  if (cp && cp.after.every((a) => done.has(a))) {
    const cpr = await runCheckpoint(cp)
    checkpointResults.push(cpr)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Finalize — feature-invariant guard + (on a clean full run) auto-merge
// ─────────────────────────────────────────────────────────────────────────────
phase('Finalize')

const green = results.filter((r) => r && r.passed).map((r) => r.id)
const red = results.filter((r) => r && !r.passed).map((r) => r.id)
const fullRun = !want
// Per-phase gates run TARGETED vitest subsets; the checkpoints run the FULL `npm test`.
// Auto-merge must gate on BOTH — a green per-phase gate can still hide a cross-cutting
// full-suite failure (e.g. a stale pre-existing test the feature's semantics superseded).
const badCheckpoints = checkpointResults.filter((c) => !c.gatePassed || !c.claimVerified).map((c) => c.name)
const allGreenFull = fullRun && !halted && red.length === 0 && green.length === PHASES.length
const checkpointsClean = badCheckpoints.length === 0

let guard = null
if (fullRun && !halted) {
  guard = await agent(
    `${COMMON}

=== FEATURE-INVARIANT GUARD (generation-scope) ===
Unlike a frozen-contract build, this feature INTENTIONALLY edits \`src/agent/prompts/domain.ts\`, \`domain-grok.ts\`, and \`src/agent/schemas.ts\`. So DO NOT assert "agent/ is untouched". Instead verify THESE four invariants over the branch diff. Inspect with \`cd ${ROOT} && git diff --name-only develop...HEAD ; echo "OAK_EXIT=$?"\` and read/grep files as needed (timeout 120000). Do NOT modify anything.
1. FROZEN NAMES — \`is_gen9_native\` and \`source_generation\` and every tool name (files under \`src/agent/tools/\`) are NOT renamed (their identifiers still appear unchanged in schema.ts / build-pokedex.ts / the tools).
2. PARITY — BOTH \`src/agent/prompts/domain.ts\` AND \`src/agent/prompts/domain-grok.ts\` appear in the changed-files list (both, or neither); \`src/agent/prompts/champions.ts\` does NOT.
3. PURITY — \`src/data/formats.ts\`, \`src/agent/schemas.ts\`, \`src/lib/sse/sse-types.ts\`, \`src/lib/scope/detect-scope.ts\`, \`src/lib/scope/scope-label.ts\` contain NO \`server-only\` / \`@/env\` / SDK (\`@anthropic\`, \`openai\`) import.
4. SCOPE NOT LLM-VISIBLE — no tool JSON schema (files under \`src/agent/tools/\` or the tool-input schemas in \`schemas.ts\`) gained a \`format\`/\`mode\`/\`scope\` input field.
Return { ok (all four hold), violations, summary }.`,
    { label: 'finalize:invariant-guard', phase: 'Finalize', schema: GUARD_SCHEMA },
  )
  if (guard && !guard.ok) log(`⛔ INVARIANT VIOLATION(S): ${(guard.violations || []).map((v) => v.invariant).join(', ')}`)
  else log(`✓ feature-invariant guard clean — frozen names, parity, purity, scope-not-LLM-visible all hold`)
}

let merge = null
const mergeEligible = allGreenFull && checkpointsClean && guard && guard.ok
if (mergeEligible) {
  merge = await agent(
    `=== AUTO-MERGE agent/gen-scope → develop ===
All 7 phase gates are green and the feature-invariant guard is clean. Merge the branch into the shared \`develop\` integration branch per CLAUDE.md, then remove the worktree. Operate in the MAIN checkout at ${MAIN} (NOT the worktree ${ROOT}). Run each, capturing output, Bash timeout 300000, appending \`; echo "OAK_EXIT=$?"\`:
  cd ${MAIN} && git checkout develop
  cd ${MAIN} && git pull --ff-only 2>/dev/null || true
  cd ${MAIN} && git merge --no-ff agent/gen-scope -m "Merge agent/gen-scope: generation scope — multi-gen data + server-side scope resolution + scope chip"
If the merge reports CONFLICTS: run \`cd ${MAIN} && git merge --abort\`, set passed=false, and put the conflicting file list in errorTail (a human resolves it — do NOT force anything). If the merge SUCCEEDS: run \`cd ${MAIN} && git worktree remove ${ROOT}\` then \`cd ${MAIN} && git branch -d agent/gen-scope\` (best-effort; if branch-delete fails because it isn't fully merged, leave it and note it). Do NOT re-ingest the DB (that is a deferred human step). Return {passed (merged cleanly), errorTail, summary}.`,
    { label: 'finalize:auto-merge', phase: 'Finalize', schema: VERIFY_SCHEMA },
  )
  log(merge && merge.passed ? `✓ merged agent/gen-scope → develop; worktree removed` : `⚠ auto-merge did NOT complete cleanly — resolve manually (see errorTail)`)
} else if (fullRun) {
  log(`↷ auto-merge SKIPPED — ${halted ? 'run halted on a red gate' : red.length ? `red gates: ${red.join(', ')}` : badCheckpoints.length ? `checkpoint(s) not clean: ${badCheckpoints.join(', ')}` : guard && !guard.ok ? 'invariant violation' : 'not a clean full run'}. Branch left on agent/gen-scope in the worktree for a human to finish.`)
}

log(`Gates green: ${green.join(', ') || 'none'}`)
if (red.length) log(`Gates NOT green: ${red.join(', ')}`)
for (const c of checkpointResults) log(`Checkpoint ${c.name}: gate=${c.gatePassed ? 'pass' : 'fail'} claim=${c.claimVerified ? 'verified' : 'NOT verified'}${c.findings.length ? ` (${c.findings.length} finding(s))` : ''}`)

const deferred = [
  'RE-INGEST the dev/prod DB so the four new formats stop reading as index_unavailable: `cd web && npm run docker:ingest` locally; `fly ssh` + ingest in prod. (You chose auto-merge WITHOUT auto-ingest — this is required before the feature answers older-gen questions from real data.)',
  'LIVE smoke (needs Docker + DB): `docker:ingest` then `docker:psql` → `select format, count(*) from pokemon group by 1;` — expect SIX formats with sane counts (gen-5 ≈ 650, gen-7 ≈ 800+).',
  'BROWSER smoke: `npm run docker:dev`, ask "what\'s a good gen 7 team around Alolan Ninetales?" with the Champions toggle ON — confirm the chip flips to Gen 7 and the answer basis reads gen-7.',
  'JUDGED eval (needs live XAI_API_KEY + ANTHROPIC_API_KEY): `npm run eval` incl. the new gen-7 team-analysis golden case.',
  'If `npm run build` was soft-failed for a missing key in the sandbox, re-run `cd web && npm run build` where env is configured.',
]
log(`DEFERRED human follow-ups: ${deferred.length} item(s) — see the return object.`)

return {
  root: ROOT,
  selected: want || 'all',
  order: ORDER,
  ran: runIds,
  halted,
  results,
  greenGates: green,
  redGates: red,
  checkpoints: checkpointResults,
  invariantGuard: guard,
  merged: !!(merge && merge.passed),
  merge,
  deferred,
  summary:
    'Generation-scope build: multi-gen data (gen-5..gen-8 formats, gen-provider, ingest), scope-aware prompts (gen-info parity across domain.ts + domain-grok.ts), runtime/schemas/tools widening, the deterministic server-side scope resolver + route wiring (message>sticky>seed, never-LLM-visible), the scope SSE event + UI chip, and docs/eval — each phase gated by real typecheck/lint/vitest with a bounded repair loop, 3 integration checkpoints, a feature-invariant guard, and (on a clean full run) auto-merge to develop. Re-ingest + live/browser/judged smokes are deferred human follow-ups.',
}
