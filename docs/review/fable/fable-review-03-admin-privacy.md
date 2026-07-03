# 03 · Admin panel & data privacy

[← back to index](fable-review.md) · **Date:** 2026-07-02 · **Commit:** 17adece · **Auditor:** Claude Fable 5

**Scope:** `web/src/app/admin/**`, `web/src/app/api/admin/**`, `web/src/server/admin/**`, `web/src/server/auth/admin.ts` (its *use* here), the cross-account read repos (`admin-analytics-repo`, `admin-content-repo`, `champions-items-repo`), `usage-repo` recording paths, `web/src/lib/admin/**`, `web/src/components/admin/**`, and the recording call sites in the chat + auth routes.

**Area health:** The gating is **airtight** — all 13 `/api/admin/*` handlers call `requireAdminRequest` before touching a repo, the server-component layout gate never renders admin HTML to non-admins, all admin SQL is parameterized (no string-built identifiers, even in the UNION query), and the non-blocking recording contract holds at every call site. The privacy exposure is the shared account-deletion gap ([AUTH-01](fable-review-02-authn-authz.md#auth-01)), which this area found independently and which is compounded by indefinite retention of guest content. Two doc-vs-code drifts round it out.

**Findings in this area:** 5 (High 1 · Medium 1 · Low 2 · Info 1)

## Findings

### ADM-01 · High · Account deletion leaves `turn_record`/`auth_event` rows readable by the operator forever

- **Dimension:** security (data protection)
- **Location:** `web/src/data/repos/accounts-repo.ts:290-318` · related: `usage-repo.ts:81-141`, `web/src/app/api/admin/turns/route.ts`, `admin/turns/[id]/route.ts`
- **What's wrong:** This is the same defect as [AUTH-01](fable-review-02-authn-authz.md#auth-01), seen from the admin side: after `deleteAccount`, the admin turns explorer (`GET /api/admin/turns`, `/api/admin/turns/[id]`) still returns the deleted user's rows. `accountEmail` becomes `null` via the LEFT JOIN, but `promptText`/`answerText`/`answerJson` are untouched, so the operator can still read a deleted user's full conversation history.
- **Why it matters:** Retention is by-design **indefinite** (no prune job), and this now includes guest prompts/answers that used to be ephemeral. The account-deletion feature promises the opposite. See AUTH-01 for the full write-up and fix.
- **Recommendation:** Cascade-delete or anonymize `turn_record` and `auth_event` in the `deleteAccount` transaction; if indefinite retention is intentional, update the route doc comment and the privacy disclosure (`operator-access-disclosure.ts`) to say so.
- **Confidence:** high · **Verified:** yes (see AUTH-01). Cross-filed here because the admin read path is where the retained data surfaces.

### ADM-02 · Medium · `GET /api/admin/accounts` scans the whole account table + a full cross-account aggregate on every request

- **Dimension:** architecture (scalability)
- **Location:** `web/src/data/repos/admin-content-repo.ts:576-607` · related: `:396-529`
- **What's wrong:** `listAccounts` runs a `SELECT` over `account` with **no `.limit()`**, then `activityForAccounts` does an unbounded `turn_record` aggregate grouped by `(account_id, model)` via `inArray` over every loaded account, plus full conversation/team counts — all before pagination happens in JS. The code comment acknowledges the O(scan) tradeoff.
- **How it fails:** Every hit to `/api/admin/accounts` (including the `sort=turns|cost|errors` heavy-user view) does O(all accounts) work and scans the full `turn_record` account/model groups regardless of page size.
- **Why it matters:** The one admin surface that doesn't paginate at the SQL layer. Admin-gated so not attacker-reachable, but an operator refreshing this on a large user base drives heavy DB load.
- **Recommendation:** Push the `q` filter and a real `LIMIT` into SQL for the base list; consider a pre-aggregated per-account summary instead of recomputing lifetime aggregates per page load.
- **Confidence:** high

### ADM-03 · Low · Champions-item toggle is a real write, contradicting CLAUDE.md's "mutates nothing" claim

- **Dimension:** maintainability (doc drift)
- **Location:** `web/src/data/repos/champions-items-repo.ts:105-177` · related: `web/src/app/api/admin/champions-items/route.ts:44-80`
- **What's wrong:** The repo is honest (documents itself as the first write in the admin surface), but CLAUDE.md's admin-panel section states the panel "mutates nothing" and that the only writes are the two append-only tables. `setChampionsItemAvailability` performs genuine DELETE + upsert against `champions_item_exclusion` via `POST /api/admin/champions-items`.
- **Why it matters:** CLAUDE.md is the canonical onboarding doc and asserts its instructions override defaults; a stale invariant here misleads future reasoning about the admin mutation surface.
- **Recommendation:** Update CLAUDE.md to name the champions-item curation table as a third, deliberate write path.
- **Confidence:** high

### ADM-04 · Low · `MODEL_PRICING` is a hard-coded placeholder that can silently misprice every cost figure

- **Dimension:** maintainability
- **Location:** `web/src/server/admin/pricing.ts:17-49`
- **What's wrong:** Per-1M-token prices are labeled placeholders in the file header, with no drift-detection.
- **How it fails:** If a provider changes pricing and the file isn't hand-edited, every cost figure across Overview/Cost/Accounts/per-turn silently reports a stale estimate, with no staleness indicator beyond the generic `estimated:true`.
- **Why it matters:** Self-documented limitation, low risk by design, but cost-based decisions could rely on materially wrong numbers.
- **Recommendation:** Add a `lastVerifiedAt` marker per model price so staleness is visible.
- **Confidence:** high

### ADM-05 · Info · `auth_event.detail` stores raw upstream email-transport error text indefinitely

- **Dimension:** security
- **Location:** `web/src/server/auth/email/resend-transport.ts:152-166` · related: `auth-service.ts:176-186`
- **What's wrong:** On a non-2xx Resend response, `sendOtpEmail` throws an Error embedding the raw response body; `auth-service.ts` stores `err.message` into `auth_event.detail`, retained indefinitely with no scrubbing.
- **Why it matters:** No concrete leak today — admin repos only `COUNT` the `detail` column, never `SELECT` it. Forward-looking hygiene: raw upstream error bodies are exactly what quietly gets surfaced in a future debug view without re-checking safety.
- **Recommendation:** If `detail` is ever surfaced in a UI, confirm Resend error bodies never carry sensitive data; consider truncating/redacting before storage.
- **Confidence:** low

## Also worth knowing

Positive confirmations worth recording: every `/api/admin/*` route guards first with `requireAdminRequest`; `admin/layout.tsx` never renders `AdminShell`/children for a non-admin; all analytics/content SQL uses Drizzle tagged-template `sql` or the query builder with no string-concatenated identifiers (including the complex `listAllConversations` UNION); `turn_record` has indexes backing the analytics/errors/cost routes; and recording is fire-and-forget at all three call sites (chat rate-limit branch, chat success path, auth emits) — never awaited on the user's critical path.
