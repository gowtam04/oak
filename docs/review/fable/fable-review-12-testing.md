# 12 · Testing infrastructure & eval harness

[← back to index](fable-review.md) · **Date:** 2026-07-02 · **Commit:** 17adece · **Auditor:** Claude Fable 5

**Scope:** `web/vitest.config.ts`, `web/test/**` (Testcontainers global setup, fixtures), `web/eval/**` (run, deterministic, golden cases), and the test *conventions* across `web/src/**/*.test.ts(x)`.

**Area health:** The safety net's **shape is strong** — the risky modules the other areas flagged are genuinely covered (chat route, image-upload, all auth routes, admin gating tri-state, scope detection, all three providers via recorded-stream tests, runtime loop edge cases, account-deletion cascade), no `.skip`/`.todo` tests exist, and the eval judge fails *closed*. The dominant gap is not a bad test but a missing *trigger*: **nothing runs any of this automatically**. A judge-bias bypass and two convention-vs-enforcement notes round it out.

**Findings in this area:** 4 (Medium 1 · Low 2 · Info 1)

## Findings

### TEST-01 · Medium · No CI wired anywhere — every gate (typecheck/lint/test/deterministic-eval) is manual-only

- **Dimension:** maintainability
- **Location:** repo root (no `.github/workflows/`) · related: `ios/ci/ios.yml:1-6`, `web/package.json` (no `prepare`/husky). Independently flagged as CFG-02 in [area 11](fable-review-11-config-deps.md).
- **What's wrong:** There's no `.github/` directory, no pre-commit hook, no `prepare` script. The only CI-shaped file is `ios/ci/ios.yml`, whose own header says it isn't live (must be copied to `.github/workflows/`). Nothing runs `typecheck`/`lint`/`test`/deterministic-eval on push or PR.
- **How it fails:** CLAUDE.md's workflow has multiple agents merging feature branches into shared `develop` "after the relevant commands pass" — an entirely trust-based check. An agent can merge a branch where `npm test` (which needs a local Docker daemon, easy to skip past) never ran, and nothing catches it. All the Testcontainers/deterministic-eval investment only gates a run someone chooses to start locally.
- **Why it matters:** The biggest lever on the value of the whole test suite — a good harness gives zero regression protection if nothing forces it to run before code lands.
- **Recommendation:** Add `.github/workflows/web-ci.yml` running `typecheck`/`lint`/`npm test` in `web/` with a Postgres/Docker-in-Docker runner on PRs into `develop`/`main`; wire the parallel `ios/ci/ios.yml` for iOS.
- **Confidence:** high

> **Severity note:** the reviewer rated this High. Fable adjusted to **Medium** — the gap is real and this is a multi-agent-merge repo, but it's a single-operator project with a manual `fly deploy` (not auto-deploy on merge), which bounds the blast radius. Still the highest-leverage item in this area.

### TEST-02 · Low · The judged eval's anti-self-preference guard is bypassable via `--model` with no warning

- **Dimension:** correctness
- **Location:** `web/eval/run.ts:497-505` · related: `judge.ts:451-465` (judge always uses `env.ANTHROPIC_MODEL`)
- **What's wrong:** Comments justify keeping the judge on Claude "to avoid same-family self-preference," but `--model=<key>` selects only the agent model — passing `--model=claude-sonnet-5` leaves both agent and judge in the Claude family, and nothing warns.
- **How it fails:** A/B-ing a Claude-family agent build via `--model=claude-*` yields judged scores with the self-preference bias the code says it avoids, with no signal in the report.
- **Why it matters:** Not hypothetical — the project's own memory records a Sonnet 5 prod trial; validating that with `--model=claude-*` would carry an un-flagged self-grading bias in exactly the go/no-go direction.
- **Recommendation:** Detect when the agent model and `env.ANTHROPIC_MODEL` share a provider family and print a visible warning (or require `--allow-same-family`) in both report formats.
- **Confidence:** medium

### TEST-03 · Low · Postgres-singleton test isolation is a convention, not structurally enforced

- **Dimension:** architecture
- **Location:** `web/test/support/pg.ts:136-147`
- **What's wrong:** `installAsSingleton` requires callers to keep `@/data/db` / `@/agent/tools` / `@/agent/runtime` imports dynamic (inside `beforeAll`), enforced only by a prose "MUST" comment — nothing lints or type-checks it. Correct in all 3 files sampled of ~24.
- **How it fails:** A future `*.oracle.test.ts` that statically imports one of those modules at the top binds its tests to whatever schema is installed at import time — cross-file data bleed manifesting as order-dependent flakiness.
- **Why it matters:** Bounded (only new integration files that violate the convention); no existing violation found — a latent risk in the pattern.
- **Recommendation:** Add a runtime assertion in `installAsSingleton` (throw if `@/data/db` already resolved under a different schema), or an ESLint rule banning static top-level imports of those modules in `*.oracle.test.ts`/`*.integration.test.ts`.
- **Confidence:** low

### TEST-04 · Info · `smoke.test.ts` is a tautological placeholder

- **Dimension:** correctness
- **Location:** `web/test/smoke.test.ts:1-8`
- **What's wrong:** The body is `expect(1 + 1).toBe(2)` — asserts nothing about the app. Explicitly labeled a toolchain scaffold check, so not miscategorized as coverage.
- **Recommendation:** No action needed; optionally delete now that dozens of real tests exist.
- **Confidence:** high

## Also worth knowing

Coverage is genuinely strong and largely non-tautological: the chat route, image-upload (MIME sniff, byte caps, malformed base64), every auth route, admin gating (401/403/200 tri-state + `ADMIN_EMAILS`-empty + case-insensitivity), scope detection, all three providers (recorded-stream tests on injected fake clients — no test path constructs a real SDK client, so the dummy-key injection is a secondary guard), runtime loop edge cases, and the account-deletion cascade all have real assertions. One nuance worth flagging: the account-deletion test pins the cascade **as written**, so it green-lights the incomplete behavior in [AUTH-01](fable-review-02-authn-authz.md#auth-01) — a case where a passing test entrenches a defect rather than catching it. The eval judge fails closed (score 0 when it doesn't call `submit_judgment`), a deliberate improvement over a prior fail-open bug.
