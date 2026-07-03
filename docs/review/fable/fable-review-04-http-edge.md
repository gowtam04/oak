# 04 · HTTP edge: chat SSE route, uploads, rate limiting, public API

[← back to index](fable-review.md) · **Date:** 2026-07-02 · **Commit:** 17adece · **Auditor:** Claude Fable 5

**Scope:** `web/src/app/api/chat/route.ts`, `web/src/server/image-upload.ts`, `rate-limit.ts`, `session-store.ts`, `bounded-store.ts`, `client-ip.ts`, `web/src/lib/sse/**`, `web/src/lib/scope/**`, and the public/misc routes `api/entity`, `api/search`, `api/sprites`, `api/learnset`, `api/health`, `api/conversations/import`.

**Area health:** The chat route itself is **carefully built** — guarded single-path SSE writes, correct client-disconnect abort propagation into the provider fetch (a Stop press actually cancels the upstream request), exactly-one-terminal-answer, heartbeat keep-alive, and a five-tier scope precedence that matches the spec. The two **Highs** are both denial-of-service surfaces: the body-size guard is bypassable, and the public read routes have no throttle. Prior hardening (X-Forwarded-For spoofing, unbounded in-memory stores via `BoundedStore`) is already in place.

**Findings in this area:** 5 (High 2 · Medium 1 · Low 2)

## Findings

### EDGE-01 · High · Request-body size guard is bypassable via chunked encoding; import route caps nothing

- **Dimension:** security (DoS)
- **Location:** `web/src/app/api/chat/route.ts:216-219` · related: `web/src/app/api/conversations/import/route.ts` (`validateTurns`), `web/src/app/api/auth/_lib/http.ts:66-77`
- **What's wrong:** The chat route's only pre-buffer guard is `Number(req.headers.get("content-length"))` — it only rejects when the client *declares* an oversized length. A request with `Transfer-Encoding: chunked` (no Content-Length) makes `Number(null)` → `NaN`, `Number.isFinite(NaN)` → `false`, so the guard is skipped and `await req.json()` buffers the whole body uncapped. Separately, `/api/conversations/import`'s `validateTurns` iterates and pushes every turn with **no length cap** before per-turn Zod validation and a single insert transaction.
- **How it fails:** An unauthenticated client POSTs to `/api/chat` with chunked encoding and a hundreds-of-MB streamed body; the 16 MiB guard never fires and the body is buffered before `parseBody`/`validateImages` run. Concurrent such requests drive memory pressure past what the single Fly machine absorbs. Independently, a signed-in user POSTs `/api/conversations/import` with a 500k-entry `turns` array — long CPU-bound validation plus a huge single transaction/row-lock window.
- **Why it matters:** Exactly the bypass class the guard's own comment claims to prevent ("reject … BEFORE buffering"). On a single-instance app (guest state + rate limits in-process), a memory/CPU spike risks the whole process, and a forced restart wipes all in-memory guest sessions and rate-limit state.
- **Recommendation:** Wrap body reading in a byte-counting reader that aborts once a hard cap is exceeded *while streaming*, independent of Content-Length, for both routes. Cap `turns.length` (e.g. a few thousand) and reject early before per-turn validation.
- **Confidence:** high · **Verified:** yes — Fable confirmed `validateTurns` has no count cap; the `Number(null)→NaN` skip is standard JS semantics. (Residual: whether Fly's edge proxy imposes its own body cap in front of the app is unverified — worth confirming with the deploy owner.)

### EDGE-02 · High · Public read-only GET endpoints have zero rate limiting and share the 10-connection pool

- **Dimension:** security (DoS)
- **Location:** `web/src/app/api/entity/route.ts` · related: `api/search/route.ts`, `api/sprites/route.ts`, `api/learnset/route.ts`, `web/src/data/db.ts:65`
- **What's wrong:** `/api/entity`, `/api/search`, `/api/sprites`, `/api/learnset` are all unauthenticated GET routes and none call `checkRateLimit` or any throttle. Each opens a DB round-trip against the single memoized pool, which uses node-postgres's default of 10 connections (no `max` — see [DATA-06](fable-review-01-data-ingest.md#data-06)). `/api/entity` additionally has no length cap on its `q` param (only `search` caps at `MAX_Q=64`).
- **How it fails:** An anonymous client fires many concurrent requests (trivial — no auth/CAPTCHA/limit). Each holds a pool connection for its query; with ~10 slots shared process-wide, a modest burst saturates the pool and queues/times-out unrelated work on the *same* pool — signed-in chat history, admin reads, auth session lookups — degrading the whole app for everyone.
- **Why it matters:** Unlike `/api/chat`, which bounds abuse with an input cap + tiered limit before doing work, these routes do real DB I/O per request with no gate. Pool exhaustion is a low-effort DoS reachable by any anonymous client on a single-instance deploy.
- **Recommendation:** Add a per-IP rate limit (reuse `checkRateLimit`/`clientIp` with a dedicated config) to the four routes; cap `/api/entity`'s `q`; reconsider the pool `max` and add query timeouts so one caller can't starve every route.
- **Confidence:** high · **Verified:** yes — Fable confirmed no `checkRateLimit` in the four routes and no `q` cap in `entity`.

### EDGE-03 · Medium · A transient DB failure while persisting a scope switch silently reverts the conversation's sticky scope

- **Dimension:** correctness
- **Location:** `web/src/app/api/chat/route.ts:492-518` · related: `:404-465`
- **What's wrong:** When a signed-in user switches scope (`format !== stickyFormat`), the route sends the new `scope` SSE event and answers under the new format, but persists via `void repo.updateConversationFormat(...).catch(log)` — fire-and-forget, logged-only. The next turn re-reads `conv.format`, still the old value if the write failed.
- **How it fails:** User says "in Scarlet and Violet, is X good?" mid-Champions; the turn answers correctly and the chip flips to Gen 9. If the update transiently fails, the next unrelated message re-resolves from the stale stored value and silently flips back to Champions — no signal, no retry.
- **Why it matters:** Breaks the resumed-conversation sticky-scope guarantee (BR-H6/GS-D3) on any single write failure, silently. Narrower condition (requires a transient failure), so Medium.
- **Recommendation:** The current turn's answer is already correct; fix the persistence gap — bounded retry, or fold the format update into `appendTurnPair`'s existing `for update`-locked write instead of a separate fire-and-forget call.
- **Confidence:** medium

### EDGE-04 · Low · `BoundedStore.set()` evicts its own just-written entry when `ttlMs` is 0

- **Dimension:** correctness
- **Location:** `web/src/server/bounded-store.ts:100-120`
- **What's wrong:** The doc says "the just-inserted entry is never swept" and the constructor accepts `ttlMs === 0`, but the sweep is `if (now - entry.lastAccess < this.ttlMs) break; delete`. For the fresh entry `now - lastAccess === 0`; with `ttlMs === 0`, `0 < 0` is false, so it deletes the entry it just inserted.
- **How it fails:** Any caller constructing `BoundedStore({ ttlMs: 0 })` gets a store that is permanently empty. Dormant today — the two live callers use 600s/7200s.
- **Why it matters:** Latent landmine in a shared primitive that breaks confusingly (store appears to never retain anything).
- **Recommendation:** Reject `ttlMs === 0` in the constructor, or fix the sweep to skip the just-inserted key by identity.
- **Confidence:** high

### EDGE-05 · Low · A few 2–3 letter scope-detector tokens are plausible false positives

- **Dimension:** correctness
- **Location:** `web/src/lib/scope/detect-scope.ts:113,139,156,162`
- **What's wrong:** `\bsv\b`, `\bpla\b`, `\bxy\b`, `\bbw\b` fire on short standalone tokens with only a word-boundary guard. Deliberate ("precision over recall") but generic enough to appear in non-Pokémon phrasing.
- **How it fails:** Given Oak now accepts images and reasons generally, "is this photo in bw?" or "what's the xy value here" could match and silently override the sticky scope to gen-5/gen-6 for that turn.
- **Why it matters:** Bounded — single turn, recoverable next message, and the tradeoff is tested.
- **Recommendation:** Require an adjacent Pokémon-domain cue for these short tokens, or demote them below the per-format keyword tiers.
- **Confidence:** low

## Also worth knowing

Confirmed clean: the SSE abort chain reaches the provider `responses.create({ signal })` (Stop actually cancels upstream tokens); `/api/sprites` reads only DB-stored sprite URLs from ingest (no SSRF/proxy-by-name); and guest `session_id` guessing is infeasible (122-bit UUID, POST-body only). The `session_id`-keyed guest store hijack-if-leaked concern is filed under [AUTH-03](fable-review-02-authn-authz.md#auth-03).
