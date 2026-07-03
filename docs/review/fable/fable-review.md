# Codebase Review — Oak

**Date:** 2026-07-02 · **Commit:** 17adece (branch `develop`) · **Auditor:** Claude Fable 5
**Scope:** the whole repository — the Next.js app in `web/` (agent runtime, providers, tools, prompts, data/ingest, auth, admin, teams, HTTP edge, frontend, tests/eval), the native `ios/` Swift client, and repo-level config/deploy. Excluded: generated files (`web/data/pokebot.sqlite`, `drizzle/meta/`, `ios/build/`, xcodeproj), vendored `node_modules` (read only to confirm library behavior), and live dependency-CVE scanning (blocked by the read-only constraint).

## Executive summary

Oak is a **well-architected codebase with a small number of sharp, localized defects** rather than pervasive rot. The seams that matter most for a multi-user LLM product are deliberately defended: account scoping is consistently enforced (the full IDOR trace came back clean), the markdown renderer is hardened against model-generated content, the SSE tool-loop validates model output and never throws in-domain, admin routes are uniformly gated, and no secrets are committed. The serious findings cluster in two places: the **ingest write path** (a documented CLI flag causes real data loss, and the multi-table write isn't atomic) and **denial-of-service surfaces at the HTTP edge** (a bypassable body-size cap and unthrottled public routes on a single-instance deploy). A distinct third theme is **privacy**: account deletion silently fails to remove two tables of personal chat content and email, contradicting its own "real deletion" contract. The single most important thing to do next is fix the ingest delete scoping (`DATA-01`) — it is one `WHERE` clause away and it is the only Critical. The standout strength is the discipline around the AI layer and data access: prompt parity, the never-throw tool contract, Zod-as-single-source-of-truth, and account-scoped repos are all real and consistently applied.

**Overall health:** Solid, thoughtfully-built core; fix the ingest write path and the two DoS surfaces before leaning on this at scale, and close the account-deletion privacy gap.

**Findings at a glance:**

| Severity | Security | Correctness | Architecture | Maintainability | Total |
|----------|---------:|------------:|-------------:|----------------:|------:|
| Critical |        0 |           1 |            0 |               0 |     1 |
| High     |        4 |           1 |            0 |               0 |     5 |
| Medium   |        8 |           8 |            4 |               2 |    22 |
| Low      |        4 |          10 |            6 |               5 |    25 |
| Info     |        2 |           3 |            4 |               2 |    11 |
| **Total**|       18 |          23 |           14 |               9 |    64 |

## Top risks — act on these first

1. **[CRITICAL] Partial-format ingest wipes all six data scopes** — the documented `npm run ingest -- --formats=X` truncates every format's tables and reinserts only `X`; the other five scopes go dark until a full re-ingest. One `WHERE` clause. → [`fable-review-01-data-ingest.md#data-01`](fable-review-01-data-ingest.md#data-01)
2. **[HIGH] Account deletion retains chat content + email forever** — `deleteAccount` never purges `turn_record`/`auth_event`, so a deleted user's full prompts, answers, and email stay operator-readable indefinitely, breaking the stated (Apple 5.1.1(v)) real-deletion guarantee. Found independently by two areas. → [`fable-review-02-authn-authz.md#auth-01`](fable-review-02-authn-authz.md#auth-01)
3. **[HIGH] Public read routes have no rate limit and share a 10-connection pool** — any anonymous client can saturate the pool via `/api/entity|search|sprites|learnset` and starve chat/auth/admin on the same pool. → [`fable-review-04-http-edge.md#edge-02`](fable-review-04-http-edge.md#edge-02)
4. **[HIGH] Body-size guard bypassable via chunked encoding; import route caps nothing** — a `Transfer-Encoding: chunked` request skips the Content-Length check and buffers uncapped; `/api/conversations/import` has no turn-count cap. Process-memory DoS on a single-instance app. → [`fable-review-04-http-edge.md#edge-01`](fable-review-04-http-edge.md#edge-01)
5. **[HIGH] Ingest write is five non-atomic transactions** — a crash or a concurrent read mid-ingest sees a cross-table-inconsistent index that fails *silently*; the completion marker lies. Fixed together with #1 by one atomic, format-scoped transaction. → [`fable-review-01-data-ingest.md#data-02`](fable-review-01-data-ingest.md#data-02)
6. **[HIGH] `javascript:` XSS via unsanitized citation `endpoint_url`** — a model-composed URL field skips the hardened markdown renderer and lands in `<a href>`; a `javascript:` payload executes with session authority on click. Reachable via prompt injection; trivial fix. → [`fable-review-07-web-frontend.md#fe-01`](fable-review-07-web-frontend.md#fe-01)

## Review areas

| # | Area | File | Crit | High | Med | Low | Health |
|--:|------|------|-----:|-----:|----:|----:|--------|
| 01 | Data layer: schema, repos, ingest | [link](fable-review-01-data-ingest.md) | 1 | 1 | 1 | 1 | ingest write needs work |
| 02 | Authn, sessions & account scoping | [link](fable-review-02-authn-authz.md) | 0 | 1 | 1 | 2 | scoping solid; deletion gap |
| 03 | Admin panel & data privacy | [link](fable-review-03-admin-privacy.md) | 0 | 1 | 1 | 2 | gating airtight; retention gap |
| 04 | HTTP edge: chat, uploads, limits | [link](fable-review-04-http-edge.md) | 0 | 2 | 1 | 2 | DoS surfaces to close |
| 05 | Agent runtime & LLM providers | [link](fable-review-05-ai-runtime.md) | 0 | 0 | 3 | 3 | solid; provider consistency gaps |
| 06 | Agent tools & battle-math | [link](fable-review-06-tools-formulas.md) | 0 | 0 | 4 | 3 | mostly solid; input bounds |
| 07 | Web frontend | [link](fable-review-07-web-frontend.md) | 0 | 1 | 0 | 2 | hardened core; one XSS gap |
| 08 | Teams & teams-assistant | [link](fable-review-08-teams.md) | 0 | 0 | 4 | 3 | scoped well; input bounds |
| 09 | System prompts & parity | [link](fable-review-09-prompts-parity.md) | 0 | 0 | 3 | 2 | parity strong; wrapper mismatch |
| 10 | iOS app | [link](fable-review-10-ios-app.md) | 0 | 0 | 2 | 1 | well-built; 2 wiring fixes |
| 11 | Secrets, config, deploy, deps | [link](fable-review-11-config-deps.md) | 0 | 0 | 1 | 2 | clean; missing header/CI layer |
| 12 | Testing & eval | [link](fable-review-12-testing.md) | 0 | 0 | 1 | 2 | good coverage; no CI trigger |

Totals: **1 Critical · 5 High · 22 Medium · 25 Low · 11 Info = 64.** (The Info-level findings are itemized in each area file and not repeated in this table's severity columns beyond the counts above.)

## System-level assessment

**Architecture & boundaries — clean where it counts, with two eroded seams.** The dependency direction is disciplined: the agent runtime knows only the tool layer, tools call repos, repos are the sole Postgres readers, `@pkmn` is confined to `gen-provider.ts`, and Zod is a genuine single source of truth feeding runtime validation, TS types, and every provider's JSON Schema. Two seams have eroded. First, the **prompt style layer** is assumed to be provider-tuning-only and domain-agnostic, but `style-openai.ts` hardcodes the main agent's tool name and field set — so reusing it for the teams-assistant (a different schema) breaks that agent on GPT-5.5 (`PRM-01`). Second, the **agent-sandbox boundary** (a scoped hook must only dispatch tools it offered) is real and security-relevant but enforced by comment convention, not code (`AI-04`). Both are latent today because only one configuration exercises them; both will bite the next person who touches them.

**Cross-cutting patterns — one root cause keeps surfacing in three areas.** *Incomplete input bounding* is the most repeated theme: unescaped LIKE wildcards appear in `pokedex-repo`/`reference-cache` (`TOOL-02`, `DATA-04`) even though `conversation-repo` already has the correct `likePattern()` helper; array-size caps are missing on the workhorse `query_pokedex` tool (`TOOL-03`) and the import route (`TEAM-02`, `EDGE-01`) even though `/api/chat` and `/api/teams/assistant` both cap; and the "never throw in-domain" contract is only half-implemented in repos (`TOOL-01`) because try/catch wraps the first DB call but not the rest. The fix pattern already exists in the codebase in each case — it just hasn't been applied uniformly. A second cross-cutting pattern is *fix-applied-to-N-of-3*: the Anthropic provider missed the parallel-tool-call disable and the raised output-token budget that Grok and GPT-5.5 both got (`AI-01`, `AI-02`). A third is *provider/scope contract drift reaching the edges*: iOS still speaks the pre-generation-scope contract (`IOS-03`), and the Grok vs Markdown prompt bodies have one real behavioral asymmetry (`PRM-02`).

**Tech-debt hotspots — where churn meets complexity.** Recon's churn data points squarely at the two files that also carry real findings. `src/app/api/chat/route.ts` (18 changes, one of the churniest) is the home of both DoS findings and the scope-persistence race (`EDGE-01`, `EDGE-03`) — it does a lot, and each addition has widened its surface. `src/app/page.tsx` (26 changes, the single churniest file) is a 606-line god component bundling six concerns (`FE-03`); high churn × low cohesion is precisely where the next frontend regression will be born. `src/agent/runtime.ts` (15 changes) and `schemas.ts` (12 changes) are large and churny but hold up better — their findings are Low/Medium consistency issues, not structural. The ingest path, notably, is *not* churny, which is likely why its Critical went unnoticed: it's rarely touched and has no test exercising the `--formats=` subset.

**Testing & safety net — strong shape, no trigger, one entrenched defect.** Coverage genuinely reaches the risky modules (auth routes, admin gating, providers, runtime edge cases, image-upload), the eval judge fails closed, and there are no disabled tests. But nothing runs automatically (`TEST-01`) — on a repo where multiple agents merge into a shared branch, the entire suite is one skipped `npm test` away from letting a regression through. And in one case a passing test actively *entrenches* a defect: the account-deletion cascade test asserts the behavior as written, so it green-lights the incomplete deletion of `AUTH-01`. Adding CI and a couple of missing tests (Champions stat math `TOOL-04`, the ingest format-subset guard for `DATA-01`) would convert a good-looking safety net into a load-bearing one.

## Coverage & method

- **How it was run:** The repo was carved into 12 review areas derived from its actual domain and risk surface (an LLM agent product with multi-user auth, an admin/analytics panel, a teams feature with untrusted import, a native client, and an offline data-ingest pipeline). One Sonnet review agent audited each area against a shared four-dimension rubric and returned structured findings. The teams area was reviewed twice (a backup run launched during a transient API rate limit completed independently); merging the two surfaced one finding the first pass missed — `TEAM-08`, a validate-against-one-format / persist-with-another mismatch in `save_team` — which Fable verified and included at Medium. Fable (the orchestrator) triaged and deduplicated, then **personally re-read and verified the Critical and all five High findings** against the source (`DATA-01`, `DATA-02`, `AUTH-01`/`ADM-01`, `EDGE-01`, `EDGE-02`, `FE-01`). Two severities were adjusted down from the reviewers' ratings on honest impact×likelihood grounds and are flagged in-place: `PRM-01`/`PRM-02` (High→Medium, gated on a non-default model) and `TEST-01` (High→Medium, single-operator manual-deploy). Two findings were deduplicated across areas: account-deletion (`AUTH-01`=`ADM-01`) and no-CI (`TEST-01`=`CFG-02`).
- **Recon snapshot:** 710 source files, ~150k LOC. TypeScript (~64k `.ts`, ~26k `.tsx`) in `web/`, Swift (~17k) in `ios/`. 212 test/spec files. 197 commits over ~1 week, single contributor. Churn hotspots: `page.tsx` (26), `chat/route.ts` (18), `globals.css` (18), `runtime.ts` (15), `schemas.ts` (12), `champions.ts` (12).
- **Out of scope / not reviewed:** Generated/vendored files were skipped (noted where relevant). **Live dependency-CVE scanning was not performed** (the read-only constraint blocks `npm audit`/network) — an agent with network access should close this; the manifest read found no obviously-abandoned or typosquat-shaped packages, but that is not a substitute for a CVE scan. `docs/` content, CSS/styling quality, and the `.excalidraw` diagrams were not audited. Two recon premises were corrected during the audit: `web/data/pokebot.sqlite` is untracked local debris (not committed), and no committed secrets exist in the tracked tree.
