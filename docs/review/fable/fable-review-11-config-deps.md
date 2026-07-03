# 11 · Secrets, configuration, deployment & dependencies

[← back to index](fable-review.md) · **Date:** 2026-07-02 · **Commit:** 17adece · **Auditor:** Claude Fable 5

**Scope:** `web/src/env.ts`, `logger.ts`, `web/Dockerfile*`, `docker-compose.dev.yml`, `fly.toml`, `next.config.ts`, `migrate.mjs`, `web/scripts/**`, `web/package.json` + `package-lock.json`, a committed-secret sweep of the tracked tree, and security headers/CORS.

**Area health:** **No committed secrets and no leaking logs** — the secret-shape sweep came back empty, the only tracked env file is `.env.example` (placeholders), `.dockerignore` excludes `.env*`, and the logger only emits the fixed `TurnTrace` shape. The prod Docker image is hardened (non-root user, `npm ci`, no dev flags), env validation fails safe, and `next.config.ts` has no `ignoreBuildErrors` escape hatches. The two Mediums are both absence-of-a-layer: no security response headers, and no CI (the latter is deduped with [TEST-01](fable-review-12-testing.md#test-01)). Everything else is Low/Info hygiene.

**Findings in this area:** 6 (Medium 1 · Low 2 · Info 3)  · plus CFG-02 (no CI) merged into [TEST-01](fable-review-12-testing.md#test-01)

## Findings

### CFG-01 · Medium · No security response headers (CSP / X-Frame-Options / HSTS / Referrer-Policy)

- **Dimension:** security
- **Location:** `web/next.config.ts:1-23` (no `headers()` block; no `middleware.ts` anywhere)
- **What's wrong:** `next.config.ts` defines only `output` and `serverExternalPackages`; there's no `headers()` and no middleware. Next.js adds none of CSP/X-Frame-Options/HSTS/Referrer-Policy by default.
- **How it fails:** No header-level backstop against clickjacking or injected-script execution if any XSS-shaped bug appears — and one does exist ([FE-01](fable-review-07-web-frontend.md#fe-01)). A CSP would materially reduce FE-01's blast radius (blocking the `javascript:`-driven same-origin fetch/exfil).
- **Why it matters:** A public chat app rendering model-generated Markdown and accepting image uploads; a header layer is cheap insurance against exactly the class of bug FE-01 demonstrates.
- **Recommendation:** Add a `headers()` function (or thin middleware) setting CSP, `X-Frame-Options: DENY` / `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and HSTS (`fly.toml`'s `force_https` is a redirect, not the HSTS header).
- **Confidence:** high

### CFG-03 · Low · ESLint pinned to an end-of-life major (8.57.1)

- **Dimension:** security (supply chain)
- **Location:** `web/package.json:61`
- **What's wrong:** `eslint 8.57.1` is past EOL, pinned low because `eslint-config-next@15.5.19` and `typescript-eslint@7.18.0` still target ESLint 8's plugin API.
- **How it fails:** Dev-only tooling, never shipped into the runtime image — the realistic failure is just no further upstream security/bugfix patches.
- **Recommendation:** Track the `eslint-config-next` release adding ESLint 9 support and upgrade eslint + typescript-eslint together then. Not urgent.
- **Confidence:** high

### CFG-05 · Low · `Dockerfile.dev` runs the dev container as root

- **Dimension:** security
- **Location:** `web/Dockerfile.dev:1-22` · contrast: `web/Dockerfile:36-38,53` (prod drops to non-root `nextjs`)
- **What's wrong:** No `USER` directive, so the dev container runs as root, unlike the hardened prod image.
- **How it fails:** Local-dev-only — root-owned bind-mount artifacts, and any RCE-shaped dev-dependency bug runs as root in the container. Never deployed (`fly.toml` uses the prod Dockerfile).
- **Recommendation:** Optional: add a matching non-root `USER` for consistency.
- **Confidence:** high

### CFG-04 · Info · Inconsistent dependency version pinning (mixed exact vs caret)

- **Dimension:** maintainability
- **Location:** `web/package.json:34-42`
- **What's wrong:** Core deps are pinned exact (next, drizzle-orm, pino, zod, react), but `@pkmn/*`, `openai`, `pg`, `@testcontainers/postgresql`, `@types/pg` use caret ranges. Installs are still reproducible (`package-lock.json` + `npm ci`); it would only matter on a lockfile regeneration without diff review.
- **Recommendation:** Pin `@pkmn/*` and `pg` exactly to match the manifest convention (not urgent — the lockfile is the safety net).
- **Confidence:** high

### CFG-06 · Info · Single always-on Fly machine with no redundancy

- **Dimension:** architecture
- **Location:** `web/fly.toml:1-51`
- **What's wrong:** Exactly one machine (`min_machines_running=1`, single region `iad`), as the file's own comment notes. A host outage takes the app fully down until Fly restarts it, and a restart drops all in-memory guest sessions/rate-limit state.
- **Why it matters:** A deliberate, documented cost/complexity tradeoff for a single-operator app — flagged for awareness.
- **Recommendation:** No action unless uptime requirements change; then add machine redundancy and move session state out of process memory first.
- **Confidence:** high

### CFG-07 · Info · Weak default `DATABASE_URL` fallback credential (fails safe)

- **Dimension:** security
- **Location:** `web/src/env.ts:68-71`
- **What's wrong:** `DATABASE_URL` defaults to `postgres://oak:oak@localhost:5432/oak` when unset, unlike `AUTH_SECRET` which has an explicit prod-guard refinement.
- **How it fails:** If unset in prod, the app tries `localhost:5432` (no local Postgres) and fails loudly — fails safe. `migrate.mjs` (the release command) has no default and exits 1 first, aborting the deploy.
- **Recommendation:** Optional hardening: add a `NODE_ENV==="production"` refinement rejecting the localhost default, mirroring `AUTH_SECRET`.
- **Confidence:** medium

## Also worth knowing

Two recon premises did **not** hold and are corrected here: (1) `web/data/pokebot.sqlite` is **not** committed — `git ls-files` shows it untracked and `.gitignore` ignores `web/data/`; it's local working-directory debris (with live `-wal`/`-shm`), referenced by no tracked code, and excluded from the Docker build context. Not a committed-secret or dead-dependency risk. (2) No committed secrets exist anywhere in the tracked tree. **Coverage gap:** the read-only constraint prevented running `npm audit`/CVE lookups — an agent with network access should close that. The no-CI finding is filed as [TEST-01](fable-review-12-testing.md#test-01) (this area independently flagged it as CFG-02).
