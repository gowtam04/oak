# Oak — Technical Debt Audit

> Systematic tech-debt inventory across the whole repo: `web/` (Next.js monolith), `ios/`
> (SwiftUI client), `docs/`, and the git/deploy workflow itself.
> Audited **2026-07-02** on branch `develop` at commit `175ba9c`.
>
> Method: three parallel deep-dives (code-level debt; test/eval debt; architecture,
> infrastructure & docs debt) plus direct checks of dependencies (`npm outdated`,
> `npm audit`), git hygiene, and CI presence. Every finding cites its evidence.
>
> Companion doc: [`oak-implementation-assessment.md`](./oak-implementation-assessment.md)
> covers **correctness** findings; this doc covers **debt** — things that slow development
> or accumulate risk without being bugs today.

---

## 1. Executive summary

The application code itself is in unusually good shape: **zero** `@ts-ignore` /
`@ts-expect-error`, essentially zero `any` in production code (all 64 grep hits are
test-mock casts or English prose), **zero** skipped/disabled tests, only **one** genuine
TODO in the entire repo, 3 `console.*` calls in all of `web/src`, and clean migration
hygiene. Code debt is *not* the problem.

The debt is concentrated in **operational resilience and process**:

- **No CI of any kind** — every test in the repo is advisory; nothing gates merges to the
  shared `develop` branch that multiple agents work in parallel.
- **No Postgres backup/restore story** on unmanaged single-node Fly Postgres.
- **Unbounded `turn_record` growth** (full prompt/answer text, one row per turn, guest +
  signed-in, no prune job) on a 512 MB VM.
- **One badly stale architecture doc** (`docs/architecture/design.md`) that describes a
  different application.
- **One large structural code item**: the ~1,050-line hand-mirrored Grok prompt whose
  parity with `domain.ts`/`champions.ts` is enforced only by comments.

---

## 2. Prioritized register

Scored **Priority = (Impact + Risk) × (6 − Effort)**, each dimension 1–5.
Impact = how much it slows the team; Risk = what happens if unfixed; Effort inverted so
cheaper fixes rank higher.

| # | Item | Category | Impact | Risk | Effort | Score |
|---|------|----------|:------:|:----:|:------:|:-----:|
| 1 | No CI whatsoever | Infra / Test | 4 | 5 | 2 | **36** |
| 2 | No Postgres backup/restore story | Infra | 2 | 5 | 2 | **28** |
| 3 | Ingest not part of deploy + no ops runbook | Infra / Docs | 3 | 4 | 2 | **28** |
| 4 | Unbounded `turn_record` growth, no prune job | Architecture | 1 | 4 | 1 | **25** |
| 5 | Battle formulas lack direct unit tests | Test | 2 | 3 | 1 | **25** |
| 6 | `docs/architecture/design.md` describes a different app | Docs | 3 | 3 | 2 | **24** |
| 7 | No monitoring / alerting / error tracking | Infra | 2 | 4 | 2 | **24** |
| 8 | iOS "staging" URL is production | Code / Infra | 2 | 4 | 2 | **24** |
| 9 | Grok prompt duplication with manual parity | Code | 5 | 4 | 4 | **18** |
| 10 | Per-process in-memory stores (session, rate limit, OTP throttle) | Architecture | 2 | 3 | 3 | **15** |
| 11 | Dependency lag (eslint 8 EOL, typescript-eslint 7, Next 15, zod 3) | Dependency | 2 | 3 | 3 | **15** |
| 12 | God modules: `runtime.ts`, `admin-content-repo.ts` | Code | 2 | 2 | 3 | **12** |
| 13 | Placeholder `MODEL_PRICING` in the admin cost view | Code | 1 | 1 | 1 | **10** |

---

## 3. Findings

### 3.1 No CI (score 36)

There is **no `.github/` directory at the repo root**. The only workflow file,
`ios/ci/ios.yml`, is deliberately parked outside `.github/workflows/` — its own header
notes GitHub won't run it until copied in. Consequences:

- The entire web test estate (~130 test files, the deterministic eval subset in
  `web/eval/deterministic.ts`) and the 24 iOS unit-test files never run automatically on
  any push or PR. All coverage is advisory.
- This is especially costly here because the git workflow (CLAUDE.md) exists so
  **multiple agents work the repo in parallel** — the exact environment where an
  automated merge gate matters most.
- Testcontainers is **not** a blocker: GitHub's `ubuntu-latest` runners ship with Docker,
  so `npm test` runs as-is.
- When promoting `ios/ci/ios.yml`, fix its simulator pin: it targets `iPhone 16` while
  the rest of the iOS tooling (CLAUDE.md, `ios/README.md`) targets iPhone 17.

**Business justification:** every other remediation in this doc (dependency bumps, the
prompt refactor, formula tests) is far safer once merges are gated. CI is the multiplier.

### 3.2 No Postgres backup/restore story (score 28)

`web/fly.toml` points at **unmanaged single-node Fly Postgres**, which gets no automatic
managed backups. No backup, snapshot, or restore configuration or documentation exists
anywhere in the repo (grep for backup/restore/snapshot across `docs/` and `web/` returns
nothing operational). A lost volume means losing **all accounts, conversations, teams,
and analytics**. Cheap to fix — a scheduled `pg_dump` to object storage, or a move to Fly
Managed Postgres — and catastrophic not to.

### 3.3 Split-brain deploy: migrations auto-apply, ingest doesn't; no runbook (score 28)

The good half: `fly.toml [deploy] release_command = "node migrate.mjs"` applies committed
Drizzle migrations atomically before new traffic; a failed migration aborts the deploy.
The bad half: the **ingest that must follow any index-schema change is a manual,
out-of-band step** (`npm run ingest` against prod `DATABASE_URL`), and forgetting it makes
tools silently return `index_unavailable`. This coupling is documented only as a
CLAUDE.md gotcha.

More broadly there is **no ops runbook**: no deploy procedure doc, secrets inventory,
migration-rollback procedure, incident-response doc, or restore drill. README's Deploy
section is 8 lines. Operator knowledge lives in CLAUDE.md gotchas and memory.

### 3.4 Unbounded `turn_record` growth (score 25)

`turn_record` (added in `web/drizzle/0006_melted_loners.sql`) stores one row **per chat
turn, guest and signed-in**, including full `prompt_text` / `answer_text` / `answer_json`.
Retention is **indefinite by design** with no prune job (confirmed: no prune/TTL logic in
`web/src`). On a 512 MB VM with single-node Postgres this grows without bound. It is also
a privacy expansion — guest prompts that used to be ephemeral are now durable (disclosed
on the privacy page, but retention-unbounded). `auth_event` shares the no-prune property
but is small. A retention window + nightly prune is roughly a one-day fix.

### 3.5 Battle formulas lack direct unit tests (score 25)

`web/src/agent/formulas/` (`compute-stat`, `estimate-damage`, `natures`, `type-chart`) —
pure, deterministic, and flagged in CLAUDE.md as mobile-portable — has **no colocated
unit tests**; `natures.ts` and `type-chart.ts` have thin-to-no dedicated assertions.
Coverage is only indirect, via `web/test/tools-*.oracle.test.ts` and the deterministic
eval. This area **demonstrably regresses**: two of the five most recent commits on
`develop` at audit time were formula bug fixes (C2 per-step damage flooring). These are
the cheapest high-value tests in the repo.

### 3.6 `docs/architecture/design.md` is counterfactual (score 24)

The doc describes a different application:

- **Storage:** on-disk SQLite via better-sqlite3, Drizzle "SQLite dialect",
  `data/oak.sqlite`, `OAK_DB_PATH` — reality is Postgres / node-postgres.
- **Data source:** a throttled PokeAPI crawler + read-through cache
  (`src/data/pokeapi-client.ts`, `src/ingest/warm-cache.ts`, `POKEAPI_BASE_URL`,
  `reference_cache` table). **Those files do not exist**; the Build Manifest still lists
  `pokeapi-client.ts` as a deliverable. Reality is offline `@pkmn`.
- **Tenancy:** "personal, single-user" is a load-bearing premise driving "no auth", "no
  alerting", "secrets manager is overkill" — the app is multi-user with email/OTP
  accounts and an admin panel.
- **Model:** claims Sonnet is fixed by design; the default is Grok 4.3 behind a
  three-provider seam.

CLAUDE.md's one-line "trust the code" warning does not undo a ~1,000-line doc that would
lead a new contributor (or agent) to build the wrong thing. Mark it superseded
section-by-section or rewrite. Related, lower severity: `docs/agent-design/data-sources.md`
still frames PokeAPI as "the single upstream source" — deliberately frozen per CLAUDE.md,
but misleading to a fresh reader (PokeAPI survives only as the T14 `get_encounters`
snapshot). `docs/features/*` and `ios/README.md` are **current** — no action needed.

### 3.7 No monitoring / alerting (score 24)

Observability is pino → stdout plus one DB-free liveness check (`/api/health`, 30 s). No
readiness probe against the DB, no error tracking (Sentry or similar), no metrics, no
alerting. The first sign of a production incident is a user report.

### 3.8 iOS "staging" is production (score 24)

`ios/OakApp/Networking/BaseURL.swift:28` hardcodes staging to `https://oak-gowtam.fly.dev`
— the production host — with a `TODO(P1)` admitting it (the only genuine TODO in the
repo). Debug builds and the `OAK_E2E=1` UI-test suite therefore exercise production, and
(combined with §3.4) write junk `turn_record` rows into prod analytics.

### 3.9 Grok prompt duplication with manual parity (score 18 — biggest velocity item)

`web/src/agent/prompts/domain-grok.ts` (1,107 lines, containing both the standard and
Champions bodies) hand-mirrors `domain.ts` (521) + `champions.ts` (525) — ~1,050 lines of
parallel domain content restated in a different (XML-tagged) structure. Only
`CHAMPIONS_REGULATION` is actually shared via import; everything else is copy-maintained
prose. Parity is enforced by comments (`domain-grok.ts:14-16`, CLAUDE.md "PARITY
(non-negotiable) … that's on the author"). `domain-grok.test.ts` / `style.test.ts` pin
*structure* only; **there is no semantic cross-check**, `domain.ts` is imported by no
test at all, and the bodies have already diverged ~2× in size.

Every domain-semantics change costs double authoring on the product's most critical
surface, with silent-drift risk. Full fix: extract shared domain facts into structured
data both prompt builders consume. Cheap interim mitigation: a parity test asserting a
shared checklist of key facts / tool names / contract strings appears in **both** bodies.

Scores lower than its impact suggests only because Effort is high; it is the top item by
development-velocity cost.

### 3.10 Per-process in-memory state (score 15)

Three stores are process-local `Map`s: the guest session store
(`web/src/server/session-store.ts`), the rate limiter (`web/src/server/rate-limit.ts`),
and the OTP throttle (`web/src/server/auth/otp-throttle.ts` — four maps). Every
deploy/restart wipes guest conversations and, more importantly, **clears OTP abuse
cooldowns**; all three forbid multi-instance scaling (rate limits would multiply per
instance). This is a known, fenced trade-off for one always-on Fly machine
(`auto_stop_machines = "off"`, `min_machines_running = 1`, DB-free health check, swap as
OOM insurance) — a ceiling rather than a bug. Revisit only when scaling beyond one
machine; at that point move this state to Postgres or Redis.

At audit time there was **uncommitted work-in-progress on exactly this** (a
`bounded-store` refactor sitting dirty in the `oak-fix-c1` worktree on branch
`agent/fix-c1`) — per the repo's own workflow rules that work should be finished and
merged or discarded, not left stranded. Relatedly, `develop` was 11 commits ahead of
`main` with no promotion policy written down.

### 3.11 Dependency lag (score 15)

From `npm outdated` / `npm audit` (2026-07-02):

| Package | Current | Latest | Note |
|---|---|---|---|
| eslint | 8.57.1 | 9.x | v8 is end-of-life |
| typescript-eslint | 7.18.0 | 8.x | major behind; pairs with the eslint bump |
| next / eslint-config-next | 15.5.19 | 16.x | major behind; carries the only audit finding (moderate postcss advisory via next) |
| zod | 3.25.76 | 4.x | touches the schema-is-source-of-truth core (`schemas.ts`, `zod-to-json-schema`) — migrate deliberately |
| typescript | 5.9.3 | 6.x | low urgency |
| @anthropic-ai/sdk | 0.106.0 | 0.109.x | routine minor bump |

No high/critical vulnerabilities. Sequence the majors behind CI (§3.1):
eslint 9 → typescript-eslint 8 → Next 16 → zod 4.

### 3.12 God modules (score 12)

The two large non-test, non-prompt files: `web/src/agent/runtime.ts` (1,106 lines — the
core loop plus a hand-rolled streaming-JSON parser) and
`web/src/data/repos/admin-content-repo.ts` (1,039 lines). Both are well-tested and
cleanly sectioned; they are "hardest to change safely" rather than broken. Decompose
opportunistically when next touched — do not schedule dedicated work.

### 3.13 Placeholder `MODEL_PRICING` (score 10)

`web/src/server/admin/pricing.ts:15-22` self-labels its per-1M-token prices as
"reasonable PLACEHOLDERS … should be reconciled against the providers' current public
pricing". Cost responses do carry `estimated: true`, so risk is low. A ~30-minute fix.

### Explicitly healthy (no action)

- Code hygiene: no `@ts-ignore`, ~zero prod `any`, 1 TODO repo-wide, 36 localized
  `eslint-disable`s, consistent error vocabulary, no evidence of dead code.
- Tests: zero skipped tests; auth, admin routes, repos, providers, ingest, and the chat
  route all covered; iOS has solid fake-backed unit coverage.
- Migrations: 8 sequential Postgres migrations, idempotent, applied atomically on deploy.
- Dockerfile: clean multi-stage standalone build, non-root runtime.
- `docs/features/*` and `ios/README.md`: current and accurate.

---

## 4. Phased remediation plan

Designed to run alongside feature work; no phase blocks product development.

### Phase 1 — stop the bleeding (~2–3 days)

1. **CI for web** (§3.1): `.github/workflows/web.yml` running `typecheck`, `lint`, and
   `npm test` (Docker is available on `ubuntu-latest`) on push/PR to `develop`.
2. **Promote the iOS workflow** into `.github/workflows/` with the simulator pin fixed.
3. **Postgres backups** (§3.2): scheduled `pg_dump` (or Fly Managed Postgres) + one
   restore drill, documented.
4. **Resolve the stranded `agent/fix-c1` worktree** (§3.10): finish + merge, or discard.
5. **Real pricing numbers** (§3.13).

### Phase 2 — operational floor (~1 week)

6. **Retention policy + prune job** for `turn_record` / `auth_event` (§3.4); update the
   privacy disclosure to state the window.
7. **`docs/ops/runbook.md`** (§3.3): deploy → migrate → **ingest** procedure, secrets
   inventory, rollback, backup/restore, incident basics.
8. **Error tracking + one alert** (§3.7): Sentry (or similar) wired into the chat route's
   error path and a Fly health-check alert.
9. **Direct unit tests for all four formula modules** (§3.5), seeded with the C2/U1
   regression cases.
10. **Fly staging app**; point `BaseURL.staging` and the `OAK_E2E` suite at it (§3.8).

### Phase 3 — structural (ongoing / opportunistic)

11. **Prompt parity** (§3.9): first the cheap cross-prompt parity assertion test, then the
    shared-facts extraction so `domain.ts` and `domain-grok.ts` consume one source.
12. **Rewrite or formally supersede `docs/architecture/design.md`** (§3.6); add a stale
    banner to `docs/agent-design/data-sources.md`.
13. **Dependency majors behind CI** (§3.11): eslint 9 → typescript-eslint 8 → Next 16 →
    zod 4, one at a time, each gated by the Phase-1 CI.
14. **Decompose `runtime.ts` / `admin-content-repo.ts` only when next touched** (§3.12).
15. **Durable session/rate-limit/OTP state** (§3.10) only when multi-instance scaling is
    actually planned.

The through-line: **Phase 1's CI is the multiplier** — every later item is far safer once
merges are gated, which is why it outscores everything else despite the codebase's
excellent hygiene.
