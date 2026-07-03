# 07 · Web frontend (React components & client logic)

[← back to index](fable-review.md) · **Date:** 2026-07-02 · **Commit:** 17adece · **Auditor:** Claude Fable 5

**Scope:** `web/src/components/**` (excluding admin — [area 03](fable-review-03-admin-privacy.md) — and teams — [area 08](fable-review-08-teams.md)), `web/src/app/page.tsx`, `layout.tsx`, `privacy/page.tsx`, `web/src/lib/hooks/**`, `web/src/lib/api/**`.

**Area health:** The markdown-rendering path — the obvious XSS surface, since it renders model-generated prose — is **deliberately and correctly hardened** (react-markdown 10 with no `rehype-raw` and its default-safe `urlTransform`), and the SSE client's reconnect/abort/cleanup logic is thorough. The one **High** is a gap in that otherwise-careful defense: a *different* URL-bearing field (citation `endpoint_url`) skips the hardened renderer and interpolates a model-authored string straight into an `<a href>`. A sibling `<img src>` gap and a god-component note round it out.

**Findings in this area:** 3 (High 1 · Low 2)

## Findings

### FE-01 · High · Citation `endpoint_url` renders as a raw `<a href>` with no protocol sanitization — `javascript:` XSS

- **Dimension:** security (XSS)
- **Location:** `web/src/components/answer-card/SourceList.tsx:64-74` · related: `schemas.ts:606-612` (`endpoint_url: z.string().optional()` — no `.url()`/protocol constraint), `web/src/components/artifact/ArtifactSources.tsx` (reuses `SourceList`)
- **What's wrong:** `Markdown.tsx` is hardened, but `SourceList` bypasses it for citations: it interpolates `citation.endpoint_url` directly into `<a href={citation.endpoint_url}>` with zero sanitization. `endpoint_url` is a plain optional string in Zod (no `.url()`, no protocol check) and is **model-composed** as part of `submit_answer` output — the same class of attacker-influenceable content the app hardened the markdown path against.
- **How it fails:** A user message (or content pasted from an untrusted source that the user is told to paste into Oak) steers the model to emit a citation with `endpoint_url: javascript:fetch('/api/auth/me')…`. React does **not** block `javascript:` hrefs (dev-only warning), so the link renders. On click, the URI executes in the current document — and because browsers run `javascript:` hrefs in the *existing* tab, `target="_blank" rel="noopener noreferrer"` provides no protection. Result: same-origin script execution with the victim's session-cookie authority.
- **Why it matters:** A hole in a deliberately-hardened defense, on a path touched by every answer with sources (and reused for every entity-artifact panel). Because `endpoint_url` is genuinely model-composed, it's reachable via ordinary prompt-injection channels. **Honest caveat on likelihood:** exploitation requires *both* steering a structured field to an exact `javascript:` payload *and* a victim click — a reasonable reviewer might rate this Medium. It stays High because the impact is full session-authority script execution and the fix is trivial.
- **Recommendation:** Run `endpoint_url` through a protocol allow-list before rendering (reuse react-markdown's `defaultUrlTransform`, or only render the `<a>` when the URL is `http(s)://`). Tighten `citationSchema.endpoint_url` to `z.string().url()` + protocol check so bad values fail Zod at the runtime boundary. Apply the same to `sprite_url`/`artwork_url` (see FE-02).
- **Confidence:** high · **Verified:** yes — Fable read `SourceList.tsx:64` (`href={citation.endpoint_url}`, unsanitized) and `schemas.ts:610` (`z.string().optional()`, no URL/protocol guard).

### FE-02 · Low · Model-authored `sprite_url` strings used directly as `<img src>` with no scheme validation

- **Dimension:** security
- **Location:** `web/src/components/answer-card/SpriteCard.tsx:38-45` · related: `SpriteImg.tsx:41`, `schemas.ts:212,248,634` (`sprite_url: z.string()`)
- **What's wrong:** `sprite_url`/`artwork_url` are plain `z.string()` (no `.url()`), part of the model's composed output, passed straight into `<img src={...}>`.
- **How it fails:** Browsers don't execute `javascript:` as `<img src>`, and treat `data:image/svg+xml` via `<img>` as non-scripting, so the realistic surface is much smaller than FE-01 — a defense-in-depth gap, not a demonstrated bypass.
- **Why it matters:** Same missing-URL-validation root cause as FE-01; becomes exploitable if a future SVG/DOM sprite path is added.
- **Recommendation:** Apply the same `.url()`/protocol allow-list to `sprite_url`/`artwork_url` when fixing FE-01.
- **Confidence:** medium

### FE-03 · Low · `page.tsx` is a god component bundling six independent concerns

- **Dimension:** architecture (+ maintainability)
- **Location:** `web/src/app/page.tsx:59-606`
- **What's wrong:** `Home` (606 lines, the repo's churniest file at 26 changes) owns SSE turn/session state, scope reconciliation, sidebar collapse + localStorage + responsive breakpoint, auth identity + guest-thread import, saved-team auto-open, and two near-duplicate outside-click/Escape handlers — all as sibling hooks beyond the two already-extracted ones.
- **How it fails:** Not a bug today, but every future change (frequent, per churn) risks a cross-concern regression, since a reviewer must hold all six concerns in mind to change one safely.
- **Why it matters:** High churn × low cohesion is where the next bug is born — this is the clearest instance of that pattern in the frontend.
- **Recommendation:** Extract `useResolvedScope`, `useSidebarState`, and a shared `useDismissableMenu(ref)` (unifying the duplicate Escape handlers). Cuts the file ~⅓ with no behavior change.
- **Confidence:** high

## Also worth knowing

Confirmed solid: `Markdown.tsx` (react-markdown 10.1.0 + remark-gfm, no `rehype-raw`, default-safe `urlTransform`); the SSE client (screen-off recovery, single-retry cap, abort checks before every state update, `reader.releaseLock()` in `finally` — no leaked reader); image previews use `data:` URLs, and the one real `createObjectURL` is revoked in both `onload` and `onerror`; the artifact viewer discards stale async responses via a monotonic id ref. The only other `dangerouslySetInnerHTML` is `layout.tsx`'s static no-flash-theme script (a fixed constant, not user data). The verify-response token that this XSS could steal is filed as [AUTH-02](fable-review-02-authn-authz.md#auth-02).
