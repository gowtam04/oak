# 05 · Agent runtime & LLM providers (the AI layer)

[← back to index](fable-review.md) · **Date:** 2026-07-02 · **Commit:** 17adece · **Auditor:** Claude Fable 5

**Scope:** `web/src/agent/runtime.ts` (the tool-loop), `web/src/agent/providers/**` (types, factory, models, grok/anthropic/openai providers), and how server-controlled `AgentContext` fields (mode, model, images, activeTeam, onTurnComplete) flow.

**Area health:** The loop is **well-defended on the threats that matter most for an LLM agent** — `submit_answer` is Zod-validated with a bounded re-emit budget, MAX_ITERATIONS is enforced, in-domain failures never throw, images are consume-on-turn (never persisted, verified on the error/abort paths), and there's no cross-request module state leak. The findings are consistency gaps where two of three providers got a fix the third didn't (Anthropic parallel-tool-calls, output-token budget), plus a cost-shape observation and a security-relevant invariant that rests on comment convention rather than code.

**Findings in this area:** 6 (Medium 3 · Low 3)

## Findings

### AI-01 · Medium · Parallel tool calls aren't disabled for the Anthropic provider, so `save_team` can double-insert on a retried `submit_answer`

- **Dimension:** correctness
- **Location:** `web/src/agent/providers/anthropic-provider.ts:118-135` · related: `factory.ts:57-78`, `runtime.ts:1154-1263`, `save-team.tool.ts:47-80`
- **What's wrong:** Grok and GPT-5.5 configs set `parallelToolCalls:false` ("so submit_answer can't be returned alongside a data tool"). The Anthropic config has no such knob and `streamTurn` sets `tool_choice:auto` with no `disable_parallel_tool_use`. The runtime processes each call in a batch independently, and `save_team` does an unconditional `createTeam` INSERT with no idempotency key.
- **How it fails:** With `ACTIVE_MODEL=claude`, a user asks to build-and-save a team in one message. If Claude emits `save_team` + `submit_answer` in parallel and `submit_answer`'s `proposed_team` fails the legality gate, the loop rejects the answer and re-prompts — but `save_team` already inserted. A resend inserts a second row.
- **Why it matters:** Duplicate persisted teams with no server-side detection — the exact bug the authors fixed for two of three providers and missed for the third.
- **Recommendation:** Set `disable_parallel_tool_use:true` for Anthropic to match, or make the runtime short-circuit a second `save_team` once `ctx.savedTeam` is set within a turn (idempotent "already saved").
- **Confidence:** medium

### AI-02 · Medium · Claude's output-token budget is hardcoded at 16000, while Grok/GPT-5.5 were explicitly raised to 32000

- **Dimension:** correctness
- **Location:** `web/src/agent/providers/anthropic-provider.ts:121` · related: `constants.ts:8-13`, `factory.ts:63-77`
- **What's wrong:** `MAX_TOKENS=16000` is the shared default; `factory.ts` overrides it to 32000 for gpt-5.5 and grok-4.3 with a comment noting reasoning + a full candidate list can exceed 16k and truncate `submit_answer` into invalid JSON. `AnthropicProviderConfig` has no `maxOutputTokens` field, so Claude passes `MAX_TOKENS` unconditionally.
- **How it fails:** The same truncation risk applies to Claude — and worse, since its adaptive thinking shares the same `max_tokens` budget, leaving less room before the answer truncates.
- **Why it matters:** A team-build or long-candidate answer on Claude risks an invalid-JSON `submit_answer`, burning the retry budget and potentially downgrading a good answer to synthesized `insufficient_data` — purely a config gap.
- **Recommendation:** Add `maxOutputTokens` to `AnthropicProviderConfig` and set it to 32000 via `MODEL_CONFIG.claude`.
- **Confidence:** high

### AI-03 · Medium · Every iteration resends the whole growing transcript with only one cache breakpoint

- **Dimension:** architecture (scalability)
- **Location:** `web/src/agent/runtime.ts:1122` · related: `grok-provider.ts:158-196,388-395`, `anthropic-provider.ts:102-135`
- **What's wrong:** `transcript.push(final.assistantContentToEcho)` appends the full prior turn's content (for Grok, the whole output array including reasoning) onto a transcript resent in full every iteration (all providers stateless per-turn). Anthropic caching only breakpoints the system segments; the growing mid-turn tail is never cached.
- **How it fails:** `MAX_ITERATIONS` was raised 14→20 for team-build turns making 6+ tool calls, and Grok runs `reasoning:high` (verbose every iteration). By iteration *k* the payload includes ~*k* iterations of echoed reasoning + tool results, largely uncached, so tokens/latency grow worse than linearly.
- **Why it matters:** For exactly the learnset-heavy team-build turns this cap was raised to support, cost and latency scale worse than the iteration count implies, with no visibility in the per-turn trace.
- **Recommendation:** Chain a stateful conversation/`previous_response_id` where available, or add an Anthropic cache breakpoint on the last transcript element each iteration; at minimum log turns whose input-token count grows superlinearly.
- **Confidence:** medium

### AI-04 · Low · The "dispatch must only cover `hooks.tools`" sandbox invariant is comment-only

- **Dimension:** architecture (+ security)
- **Location:** `web/src/agent/runtime.ts:770-818` · related: `:1236`, `teams-assistant/tools.ts:1-16`
- **What's wrong:** The `AnswerRunHooks.dispatch` doc says it MUST cover only tools in `hooks.tools` (a wider dispatch would execute hallucinated calls to un-offered tools), but nothing in `runWithProvider` checks `call.name` against `hooks.tools` before calling `hooks.dispatch`. The guarantee holds today only because both hook implementations hand-pair their tools/dispatch.
- **How it fails:** A future third `AnswerRunHooks`, or an edit that updates `tools` without mirroring `dispatch`, silently reopens the hallucinated-tool exposure. No test enforces the invariant.
- **Why it matters:** This is the sandbox boundary between the general chat agent and the narrower embedded team-builder; its correctness rests on manual discipline with no backstop.
- **Recommendation:** Add a runtime assertion rejecting/logging any `call.name` not in `hooks.tools` before dispatch, or a generic hooks-contract test.
- **Confidence:** high

### AI-05 · Low · Tool-dispatch throws (data faults and genuine bugs) fold into one undifferentiated `tool_error`

- **Dimension:** maintainability (observability)
- **Location:** `web/src/agent/runtime.ts:1232-1257`
- **What's wrong:** The dispatch catch converts any throw — a transport/DB fault or an unexpected `TypeError` from a code bug — uniformly to `{ error:"tool_error", detail }`, logged into `toolTrace` identically to an ordinary miss. This is the runtime backstop for the repo-layer gap in [TOOL-01](fable-review-06-tools-formulas.md#tool-01).
- **How it fails:** A genuine tool bug surfaces exactly like an expected condition (e.g. `index_unavailable`), so operators get no differentiated signal for a real regression.
- **Why it matters:** Correct for the never-throw contract, but the lack of a marker means logs/admin can't cheaply distinguish a bug from a data miss.
- **Recommendation:** Tag the `toolTrace` entry (or log louder) when the caught error isn't one of the documented structured-miss shapes.
- **Confidence:** medium

### AI-06 · Low · Grok/OpenAI providers build a fresh SDK client every turn (unlike Anthropic)

- **Dimension:** architecture
- **Location:** `web/src/agent/providers/grok-provider.ts:121-126` · related: `openai-compatible-provider.ts:110-113`, `anthropic-provider.ts:61-69`
- **What's wrong:** `AnthropicProvider` memoizes one client on the module; `GrokProvider`/`OpenAICompatibleProvider` build a new `OpenAI` client in their constructor, and `providerFor()` runs fresh every turn — so Grok, the default, gets a new SDK client per request.
- **How it fails:** Under load, every turn pays client-construction cost (and possibly a fresh connection pool, depending on the SDK/undici defaults — unconfirmed statically).
- **Why it matters:** Hot-path inefficiency for the primary model, not a functional bug.
- **Recommendation:** Memoize the underlying OpenAI client per `(apiKey, baseURL)` like Anthropic; keep only a lightweight per-turn wrapper.
- **Confidence:** medium

## Also worth knowing

Two cross-area notes the reviewer flagged without chasing: (1) `answer_markdown` streams to the client as soon as `submit_answer` *begins*, before validation — if a submission is later rejected, the streamed prose can differ from the finalized answer; reconciling that is the SSE route's job (`answer_start` resets the client buffer, so it's handled). (2) `save_team`'s no-dedup persistence is the tools-layer half of AI-01, audited in [area 06](fable-review-06-tools-formulas.md).
