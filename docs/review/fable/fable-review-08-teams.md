# 08 · Teams feature & teams-assistant agent

[← back to index](fable-review.md) · **Date:** 2026-07-02 · **Commit:** 17adece · **Auditor:** Claude Fable 5

**Scope:** `web/src/server/teams/**` (validate-team, import-export, active-team), `web/src/app/api/teams/**` (CRUD, `[id]`, duplicate, export, import, assistant), `web/src/agent/teams-assistant/**` (hooks, scoped dispatch, patch semantics), `web/src/data/teams/team-schema.ts`, teams components (logic pass).

**Area health:** AuthZ scoping is **correct and consistent** across every team route (ownership check before mutation, 404-not-403 isolation), and no `dangerouslySetInnerHTML` exists in the teams components (React escaping covers in-app rendering). The theme is **missing input bounds and a legality gate that only guards one of two save paths**: unsanitized member fields let a user forge shared export text, the import route has no size cap, and the hard-legality gate on `save_team` is absent from the REST/editor path. All Medium — bounded, but each is a real, ordinary-API-reachable gap.

**Findings in this area:** 8 (Medium 4 · Low 3 · Info 1)

## Findings

### TEAM-08 · Medium · `save_team` validates against the turn's format but persists with the proposal's frozen format

- **Dimension:** correctness (+ data integrity)
- **Location:** `web/src/agent/tools/save-team.tool.ts:60,77-98` · related: `web/src/app/api/chat/route.ts:415-428` (unfiltered proposal walk-back), `schemas.ts:699-705`
- **What's wrong:** `save_team` takes the team from `ctx.proposedTeam ?? input.team` (line 60), validates its members against the **current turn's** format (`formatForMode(ctx.mode)`, line 79), but persists it with `team.format` (line 94) — the format field **frozen on the proposal object**, not the format just validated against. There is no check that the two match. `ctx.proposedTeam` is built by the chat route walking backward through the *entire* stored history for the most recent schema-valid `proposed_team`, with no filter that its format equals the turn's resolved scope.
- **How it fails:** A user builds/approves a Champions team (proposal `format=champions`). Later in the same conversation the scope switches to scarlet-violet (chip pick, sticky resume, or an in-message keyword) and the user says "save it," walking back to that stale proposal. `save_team` re-validates the members against scarlet-violet's much looser rules (SV's roster is a superset of Champions' curated one; different EV semantics), so the hard-legality check that would run under Champions is skipped — yet the team is stored with `format: 'champions'` and is later loadable as a Champions team (`resolveActiveTeam` gates on `team.format === formatForMode(mode)`), having never been legality-checked against Champions in this save.
- **Why it matters:** Erodes the invariant every other Teams module relies on — `team.format` is supposed to mean "validated/intended for this ruleset." A team can be stored under a format it was never actually checked against, silently misrepresenting its own legality. **Severity note:** the backup reviewer rated this High; Fable adjusted to **Medium** — the mechanism is confirmed, but reachable harm requires a mid-conversation scope switch *plus* approval of a stale cross-scope proposal, a narrower condition than a common path.
- **Recommendation:** Reconcile the two format sources — either persist with `formatForMode(ctx.mode)` instead of `team.format` at `save-team.tool.ts:94`, or reject a walked-back proposal whose `.format` ≠ `formatForMode(ctx.mode)` (in the tool or in the route's proposal walk-back).
- **Confidence:** high (mechanism) · **Verified:** yes — Fable read `save-team.tool.ts` (validates `formatForMode(ctx.mode)`, persists `team.format`) and confirmed the route's walk-back has no format filter.

### TEAM-01 · Medium · Unsanitized species/nickname fields allow Showdown-paste injection on export

- **Dimension:** security (injection)
- **Location:** `web/src/server/teams/import-export.ts:330-351` · related: `team-schema.ts:44-70`, `teams/route.ts:89-96`, `teams/[id]/route.ts:88-95`, `@pkmn/sets` `exportSet` (`node_modules/@pkmn/sets/build/index.js:115-122`)
- **What's wrong:** `teamMemberSchema` puts no length/charset restriction on `species`/`ability`/`item`/`nickname` (only `team.name` gets a 120-char route cap). `memberToSet` passes any off-index slug through `humanize()` (which doesn't strip control chars) into `@pkmn/sets`' `exportSet`, which concatenates `s.name + ' (' + species + ')'` with zero escaping.
- **How it fails:** A signed-in user PUTs a member whose `species`/`nickname` embeds newlines + fabricated Showdown directive lines (the save succeeds unconditionally — see TEAM-03). They then `GET /api/teams/{id}/export` and share the text (normal competitive-Pokémon behavior; Oak's own `PasteImportDialog` re-imports such text). The recipient — a human, real Showdown, or Oak's importer — parses fabricated extra lines/blocks as legitimate.
- **Why it matters:** Exported text is meant to be shared and trusted. This is text/social-engineering injection (not code exec or auth bypass), so bounded, but fully reachable via ordinary API calls. The same missing bound also has no `.max()` on these fields, so a client can store arbitrarily large strings (unbounded per-field storage growth) that `enrichActiveTeam` later echoes verbatim into the account's own `get_team`/`list_teams` tool output — a self-directed injection vector into that user's future agent context. It's the same "two validation paths that drift" gap as TEAM-03: the Showdown-import path enforces resolve-or-clarify (unresolved names → null), but the raw CRUD API persists any string verbatim.
- **Recommendation:** At the `teamMemberSchema` level (the single source of truth for every write path), add `.max(N)` length caps and reject newline/CR in `species`/`ability`/`item`/`nature`/`tera_type`/`nickname` (mirroring the 120-char cap the route already gives `team.name`); optionally route CRUD member writes through the same index-resolution step the import path uses. Defense-in-depth: strip control chars in `humanize()`.
- **Confidence:** high

### TEAM-02 · Medium · `POST /api/teams/import` has no size cap; all blocks parsed before the 6-set truncation

- **Dimension:** security (DoS)
- **Location:** `web/src/app/api/teams/import/route.ts:80-97` · related: `team-paste.ts:55-82`, `PasteImportDialog.tsx:135-143`
- **What's wrong:** Unlike `/api/chat` and `/api/teams/assistant` (which has an explicit `MAX_REQUEST_BYTES=256KB` check), the import route reads `body.paste` with no content-length pre-check and no length validation. `parseShowdown` splits on blank lines and calls `Sets.importSet` on **every** block, truncating to 6 only at the end.
- **How it fails:** A signed-in user POSTs a multi-MB paste of thousands of blank-line blocks; the vendored parser runs on all of them before 6 are kept — unbounded CPU per request, gated only by being signed in. Compounds with [EDGE-01](fable-review-04-http-edge.md#edge-01)/[EDGE-02](fable-review-04-http-edge.md#edge-02) (no rate limit).
- **Why it matters:** A repeatable, low-cost CPU-burn lever that could degrade the shared process for other users.
- **Recommendation:** Add a Content-Length pre-check (mirror the assistant route) and a `paste.length` cap before `importPaste`; short-circuit `parseShowdown` once `MAX_SETS` valid sets are found.
- **Confidence:** high

### TEAM-03 · Medium · The hard-legality gate is enforced on `save_team` but bypassed by the REST API and the editor

- **Dimension:** architecture (two validation paths that drift)
- **Location:** `web/src/agent/tools/save-team.tool.ts:66-89` · related: `teams/route.ts:102-109`, `teams/[id]/route.ts:97-109`, `team-schema.ts:120-142`
- **What's wrong:** `save_team` (the chat path) filters `validateTeam(...)` by `isHardViolation` and refuses to persist an illegal team (`{saved:false, reason:"illegal_team"}`). `POST /api/teams` and `PUT /api/teams/[id]` — used by the `/teams` editor and any direct caller — call `createTeam`/`updateTeam` **unconditionally** and only return validation as informational output.
- **How it fails:** A user saves an illegal roster (e.g. species-clause violation) via the editor — 200 OK. Asking the chat agent to save the identical members is refused as `illegal_team`. The `HARD_VIOLATION_CODES` docstring asserts "a save carrying any of them is refused" system-wide, describing only one of the two paths.
- **Why it matters:** Textbook "two validation paths that can drift." May be an intentional UX choice (editor allows drafts), but the REST surface — the primary way teams get built — has no legality backstop, contradicting the docstring.
- **Recommendation:** Either document the hard gate as deliberately conversational-only, or add the same `isHardViolation` filter (or a shared helper) to the POST/PUT handlers.
- **Confidence:** high

### TEAM-04 · Low · `applyTeamPatch`: same-slot set + null ops resolve order-independently (removal always wins)

- **Dimension:** correctness
- **Location:** `web/src/agent/teams-assistant/schemas.ts:90-108`
- **What's wrong:** Two passes — pass 1 applies non-null member ops, pass 2 unconditionally nulls every slot that had a `member:null` op, overwriting pass 1. A patch with both `{slot:N,member:null}` and `{slot:N,member:X}` (either order) always ends with slot N removed.
- **How it fails:** `[{slot:1,member:null},{slot:1,member:X}]` (remove-then-re-add intent) silently discards the re-add. Used both server-side (gate) and client-side (Apply), so consistently-but-silently wrong in both.
- **Why it matters:** Low — needs a same-slot duplicate-op patch, an untested edge case.
- **Recommendation:** Resolve slot ops in one pass, last-op-wins in array order. Add a test for the same-slot dual-op case.
- **Confidence:** medium

### TEAM-05 · Low · EV total cap hard-coded to 508, not the games' 510

- **Dimension:** correctness
- **Location:** `web/src/server/teams/validate-team.ts:56-60` · related: `team-schema.ts:17,28,92`
- **What's wrong:** `evCaps()` returns `{total:508, perStat:252}` for mainline formats; the real competitive EV total cap is 510.
- **How it fails:** A legal 509/510-total spread (e.g. 252/252/6, a standard spread) gets a false `ev_total_exceeded` warning.
- **Why it matters:** Advisory-only (never blocks a save), so a cosmetic false positive — but a factual rule error that misfires on common legal spreads.
- **Recommendation:** Change `total:508`→`510` and update the docstrings, unless the 2-point margin is deliberate (then document why).
- **Confidence:** medium

### TEAM-06 · Low · The unmapped-tool progress-label fallback can re-leak internal tool names

- **Dimension:** maintainability
- **Location:** `web/src/agent/runtime.ts:206-208` · related: `:184-203`, `TeamsAssistantPanel.tsx:291-292`
- **What's wrong:** Commit `1b2d12c` fixed the model naming tools in prose. A second vector remains: `progressLabel(tool)` (used for the `tool_activity` SSE label rendered directly to users) falls back to `` `Running ${tool}...` `` for any tool missing from `PROGRESS_LABELS`. All 17 are covered today, but the fallback is unsafe.
- **How it fails:** A future 18th tool added without a `PROGRESS_LABELS` entry emits `Running new_tool_name...` verbatim in the chat ticker and builder panel — no compile-time coverage check catches it.
- **Why it matters:** The codebase just spent a fix commit on not leaking machinery names; this silently reintroduces the class on the next tool addition.
- **Recommendation:** Change the fallback to a generic `"Working..."`, and/or add a test asserting every `ToolDef.name` (main + builder) has a `PROGRESS_LABELS` entry.
- **Confidence:** high

### TEAM-07 · Info · Client applies an assistant `team_patch` to live state that may have diverged from the server-validated snapshot

- **Dimension:** correctness
- **Location:** `web/src/components/teams/TeamEditor.tsx:113-127` · related: `teams-assistant/runtime-hooks.ts:66-82`
- **What's wrong:** The gate validates the patch against the request-time `body.draft.members` snapshot; the client applies it to whatever the current state is at Apply-click.
- **How it fails:** User sends draft D0, edits to D1 while waiting, then applies a D0-validated patch to D1 — a result the server never checked.
- **Why it matters:** Bounded — the whole flow is advisory and persistence re-validates on read. Worst case is a stale warning badge, not corruption.
- **Recommendation:** If tightened later, disable/queue Apply while a request is in flight, or re-validate client-side before applying.
- **Confidence:** low

## Also worth knowing

The import parser itself is not a ReDoS risk — the `slugify` regexes are linear character-classes and the actual parse is delegated to `@pkmn/sets`. `team-repo.ts` transactionality (which would compound TEAM-03 if create/update/duplicate aren't atomic) is audited in [area 01](fable-review-01-data-ingest.md), which found the multi-write flows correctly single-transaction.
