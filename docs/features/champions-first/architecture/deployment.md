# Champions-first — Deployment

Budget Tier: **startup** — every choice is existing Fly infra or a reduction.

## Build & Test Commands

Run from `web/` unless noted. Keep identical in the Build Manifest.

| Command | Value |
|---------|--------|
| test | `cd web && npm test` |
| test_one | `cd web && npx vitest run <file>` |
| typecheck | `cd web && npm run typecheck` |
| build | `cd web && npm run build` |
| lint | `cd web && npm run lint` |
| ingest | `cd web && npm run ingest -- --formats=champions` |
| migrate | `cd web && npm run db:migrate` |
| ios_typecheck | `cd ios && xcodegen generate && xcodebuild test -scheme OakApp -only-testing:OakAppTests -destination 'platform=iOS Simulator,name=iPhone 17'` |
| android_typecheck | `cd android && export JAVA_HOME=/opt/homebrew/opt/openjdk@17 && ./gradlew --no-daemon :app:compileDebugKotlin` |
| android_test | `cd android && ./gradlew --no-daemon :app:testDebugUnitTest` |

`npm test` still needs Docker (Testcontainers Postgres + Redis). typecheck/lint/jsdom do not.

## Hosting / Runtime

- Choice: existing Fly app `oak-gowtam` (single Node machine)
- Why it fits: no new service
- Notes: tool-list change is a deploy; prompt cache will miss once then refill

## Database Hosting

- Choice: existing Fly Postgres
- Why it fits: cutover **shrinks** data
- Notes: run migration 0023 then `ingest --formats=champions` on prod. Backup before DROP. Wiki corpus is intentionally destroyed (CF-OPS-AC-1.2).

## Background Jobs / Queues

- Choice: **none new**. Retire `npm run sync:meta` from the monthly ops runbook (Smogon gone). Ingest remains a manual/CLI process for Champions-only.
- Why it fits: startup; live usage is request-time + in-process TTL

## Object Storage

- Choice: none new

## Caching

- Choice: existing Redis for sessions/rate-limit/OTP; **in-process** usage TTL (24h index / 6h per species)
- Why it fits: ADR-5, no extra Redis keys or machines

## Observability

- Choice: existing pino logs
- Notes: log usage `upstream_unavailable`; log ignored `scope_seed` at debug only (avoid noise)

## Secrets Management

- Choice: existing env. No new secrets. `CHAMPIONSBATTLEDATA_BASE_URL` already present.

## Environments & CI/CD

- Environments: existing prod + local Docker
- CI: typecheck, lint, `npm test` (node+jsdom), iOS unit, Android unit as today
- Deploy: `cd web && fly deploy` after migrate+ingest. Native store listings: CF-INT-BR-10 (copy in same change; TestFlight/Play binary when those clients ship)

## Rough Monthly Cost Estimate

Bucket: **$50** (unchanged order of magnitude; likely slightly **down**)

| Item | ~$/mo |
|------|-------|
| Fly machine | existing |
| Postgres | existing, smaller |
| Redis | existing |
| LLM tokens | **down** (smaller prompt prefix, fewer tools) |
| **Total bucket** | **$50** |

No new cost. Do not add a usage worker or cache machine.
