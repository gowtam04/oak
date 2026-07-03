# 02 · Authentication, sessions & account scoping

[← back to index](fable-review.md) · **Date:** 2026-07-02 · **Commit:** 17adece · **Auditor:** Claude Fable 5

**Scope:** `web/src/server/auth/**` (auth-service, sessions, otp-throttle, current-user, admin, email), `web/src/app/api/auth/**`, and the account-scoping trace across every route under `web/src/app/api/conversations/**` and `web/src/app/api/teams/**` plus their repos (`conversation-repo`, `team-repo`, `accounts-repo`).

**Area health:** The core access-control model is **solid** — the full IDOR trace came back clean: every conversation/team repo method takes `accountId` and filters by it in the actual `WHERE` clause, not-owned resources uniformly 404 (never 403), OTP crypto is HMAC-SHA256 with timing-safe comparison, session tokens are 256-bit CSPRNG hashed at rest, cookies are HttpOnly/SameSite=Lax/Secure-in-prod, and the `ADMIN_EMAILS` allowlist fails safe to zero admins. The one serious issue is a **data-deletion guarantee that the code silently doesn't meet** (found independently by [area 03](fable-review-03-admin-privacy.md) too), plus a defense-in-depth erosion in the verify response.

**Findings in this area:** 4 (High 1 · Medium 1 · Low 2)

## Findings

### AUTH-01 · High · Account deletion does not purge `turn_record` / `auth_event` — contradicts the documented "real deletion" requirement

- **Dimension:** security (data protection) (+ correctness)
- **Location:** `web/src/data/repos/accounts-repo.ts:290-318` · related: `web/src/app/api/auth/account/route.ts`, `web/src/data/schema.ts:464-560` (turn_record + auth_event), requirement `M-BR-ACCT-6`
- **What's wrong:** `deleteAccount(accountId)` cascade-deletes `conversation_message`, `conversation`, `team`, `auth_session`, and `otp_code`, then the `account` row — but never touches `turn_record` or `auth_event`. Both were added later by the admin-panel feature; both carry a nullable `account_id` (schema.ts:472, 544). `turn_record` holds the full `prompt_text`/`answer_text`/`answer_json`; `auth_event` holds the user's plaintext email. There are no FK constraints, so the delete doesn't even error — `account_id` just becomes a dangling reference.
- **How it fails:** A signed-in user chats (every turn recorded verbatim via the chat route's `recordTurn`), then deletes their account expecting everything gone. Conversations and teams vanish, but every `turn_record` row (their full prompts and Oak's answers) and every `auth_event` row (their email) survive **indefinitely** — retention is by-design permanent, with no prune job — and remain operator-readable via `/api/admin/turns`.
- **Why it matters:** The feature's own doc comment promises deletion of "the signed-in account and ALL of its data," and requirement `M-BR-ACCT-6` frames it as Apple App Store Guideline 5.1.1(v) compliance ("real deletion… cascade-delete all data for account.id"). The code silently fails that contract for two tables of personal content, and the privacy disclosure never mentions the carve-out. This is a broken data-protection guarantee, not an incomplete feature.
- **Recommendation:** Add `turn_record` and `auth_event` deletes (or an anonymizing UPDATE nulling `account_id`/`email`/`prompt_text`/`answer_text`) to the `deleteAccount` transaction, in the same account-scoped style as the existing deletes. If retaining anonymized aggregates is deliberate, make that explicit in the requirement and the privacy copy.
- **Confidence:** high · **Verified:** yes — Fable read `deleteAccount` (no `turn_record`/`auth_event` statements) and confirmed both columns exist and are nullable. Found independently by areas 02 and 03.

### AUTH-02 · Medium · The raw session token is returned in the verify JSON body to all clients, undermining the HttpOnly cookie

- **Dimension:** security
- **Location:** `web/src/app/api/auth/verify/route.ts:50-67` · related: `web/src/lib/api/auth-client.ts:103-128`
- **What's wrong:** `POST /api/auth/verify` sets the HttpOnly session cookie **and** unconditionally returns the same raw 30-day token in the JSON body, for every caller — the route comment says this is purely for native-client parity ("Web is unaffected — it ignores the body token"). But the web client calls `res.json()`, so the token passes through the page's JS heap on every sign-in.
- **How it fails:** HttpOnly exists so client-side script can't read the token; duplicating it into a JS-readable body means any future XSS-capable bug (see [FE-01](fable-review-10-web-frontend.md#fe-01)), malicious extension, or compromised third-party script can steal a full-access token and impersonate the account for 30 days, bypassing HttpOnly entirely.
- **Why it matters:** Defense-in-depth erosion, not a demonstrated exploit today (no XSS in the markdown path). It becomes load-bearing the moment any XSS bug exists — and FE-01 is exactly such a bug.
- **Recommendation:** Only include `token`/`expiresAt` in the response for the native-client path, gated by an explicit client-declared platform signal (body field or header); leave the cookie path untouched.
- **Confidence:** medium

### AUTH-03 · Low · Guest conversation state is keyed solely by a client-supplied `session_id`

- **Dimension:** security
- **Location:** `web/src/server/session-store.ts:86-158` · related: `web/src/app/api/chat/route.ts:445-449`, `web/src/app/page.tsx:38-47`
- **What's wrong:** For a guest turn, `getHistory(session_id)` uses the `session_id` verbatim from the request body — no cookie, IP, or other binding ties it to the browser that created it. `makeId()` also has a non-CSPRNG fallback (`Date.now` + `Math.random`) when `crypto.randomUUID` is unavailable.
- **How it fails:** If a guest's `session_id` is observed (shared screen, proxy/log capture, devtools), a third party can replay it to inject into or exfiltrate (via "summarize prior turns") the victim's conversation.
- **Why it matters:** Narrow in practice — the primary path uses `crypto.randomUUID()` (122 bits, unguessable) and the id lives only in React state (never a URL/localStorage/link). Design docs treat guest sessions as ephemeral, so this may be accepted, but the hijack question is honestly answered "yes, if the id leaks."
- **Recommendation:** If guest history needs confidentiality, bind it to an HttpOnly cookie that must match `session_id` server-side. At minimum, drop the non-CSPRNG `makeId()` fallback.
- **Confidence:** medium

### AUTH-04 · Low · Unauthenticated OTP re-request can invalidate a victim's in-flight sign-in code

- **Dimension:** correctness
- **Location:** `web/src/data/repos/accounts-repo.ts:131-157` (`upsertOtpCode`) · related: `otp-throttle.ts:172-208`
- **What's wrong:** `requestCode` requires no proof of identity (deliberately, for non-enumeration) and `upsertOtpCode` unconditionally supersedes any prior code for that email.
- **How it fails:** An attacker who knows a victim's email requests a fresh code mid-login, silently superseding the code the victim is about to submit; the victim's submission fails with `invalid_or_expired`.
- **Why it matters:** A low-effort unauthenticated griefing/DoS against one user's login — never discloses the code or grants access. Bounded to ~5 disruptions/hour by the existing per-email cooldown/cap.
- **Recommendation:** Accept as a documented trade-off of the single-active-code design given the throttle bounds, or note it explicitly in the design doc.
- **Confidence:** high

## Also worth knowing

CSRF is adequately mitigated by SameSite=Lax on all state-changing routes. Sign-out/session revocation and the Bearer-vs-cookie parity both checked out. The client-IP derivation already correctly avoids `X-Forwarded-For` spoofing (a prior fix, finding S1). The `ADMIN_EMAILS` gate's *use* is audited in [area 03](fable-review-03-admin-privacy.md).
