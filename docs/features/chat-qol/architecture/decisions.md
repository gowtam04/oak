# Chat QoL — Architecture Decisions

## ADR-1 — Stay in the existing Next.js monolith

- **Decision:** All APIs, pages, and persistence live in `web/`. Natives remain HTTP/SSE clients.
- **Alternatives:** modular-monolith paperwork; extract a share service.
- **Why:** Hobby budget, one Fly machine, matches every prior Oak feature.
- **Tradeoff:** Public share views share the chat machine. Acceptable: snapshots are JSON reads, no model turn.

## ADR-2 — Replace-on-success, not supersede rows

- **Decision:** On a successful retry/edit, delete the last user+assistant rows and insert the new pair under the same `seq` values, inside the existing conversation lock. Guests rewrite the last session-store pair.
- **Alternatives:** `superseded_at` flag; client-only hide.
- **Why:** Matches REC-BR-2 (“exactly one current answer”). Shares are independent snapshots, so deleting the live pair is safe.
- **Tradeoff:** No regenerate history. Product did not ask for it.

## ADR-3 — Undo is Stop plus a 3s client timer

- **Decision:** No new undo endpoint. The 3-second bubble calls the existing `POST /api/chat/turns/:id/stop` and restores composer state locally (text + images still in memory).
- **Why:** Stopped turns are already discarded and not persisted (REC-BR-4, BR-H2).
- **Tradeoff:** Rate limiter still decrements on the original POST (existing behavior). Do not add a second limiter. Undo is not cheaper or more expensive than Stop.

## ADR-4 — Recovery is a request flag, not a second POST

- **Decision:** `ChatRequestBody.recovery?: "retry" | "edit"`. The turn is a normal `runTurn`. Persist calls `replaceLastPair` instead of `appendTurnPair` when `recovery` is set and the turn succeeds.
- **Validation:** Last pair must exist (`user` then `assistant`); else 409 `nothing_to_replace`. In-flight turn still 409 `turn_in_progress`.
- **Retry text:** Client resends the last user text (and remaining images). Server does not reload the user message from DB — guests have no structured DB row. Edit sends the new text.
- **Voice:** Client sends the transcript as `message`; new turn is text (REC-BR-6).

## ADR-5 — Mentions are UUIDs on the body + ctx.boundTeams

- **Decision:** `mentioned_team_ids?: string[]` (max 6, unique). Server resolves each with `getTeam(accountId, id)`. Any miss → **400 `unbound_mention`** before `startTurn`. Bind `AgentContext.boundTeams: BoundTeam[]`.
- **Model visibility:** An **ephemeral** (not prefix-cached) system/developer segment lists `id`, `name`, `format` for bound teams and tells the model to call existing `get_team`. **No 21st tool.**
- **Alternatives:** re-append `get_bound_teams`; parse `@name` only.
- **Why:** Requirements forbade name-matching; adding a tool busts the tools-array cache.
- **Display:** Composer shows `@Name`. Wire message may keep `@Name`; IDs travel in the sibling field. Dead mention is a client-highlighted 400.

## ADR-6 — Public shares are Postgres snapshots, noindex, nanoid

- **Decision:** `shared_answer` row. Public page `GET /a/[id]` (App Router) renders the stored question + `OakAnswer` via the existing answer-card tree. `robots: noindex`. `Cache-Control: private, no-store` so revoke is immediate. OG title/description from question excerpt + default existing OG image (no per-share image render).
- **Id:** `nanoid(21)`.
- **Revoke:** set `revoked_at`. Unknown/revoked → dedicated unavailable page (not the app shell).
- **Conversation delete:** leave the row (SHARE-BR-3). **Account delete:** delete rows (CQ-OQ-1).
- **Why not live reads:** SHARE-BR-6; hobby; no tool loop.

## ADR-7 — PDF via pdfkit, not Puppeteer

- **Decision:** Export endpoint builds Markdown (source of truth) and a simple text/table PDF with `pdfkit`. No Chromium.
- **Why:** Hobby memory. Product asked for a simple PDF, not a screenshot of the answer card.
- **Tradeoff:** PDF is readable, not pixel-identical to the card.

## ADR-8 — Chip pick persist is PUT /api/scope

- **Decision:** Immediate persist, no turn required. Body `{ format, conversation_id?: string | null }`.
  - Signed-in + `conversation_id`: `updateConversationFormat` + `updateLastUsedScope` + MRU upsert.
  - Signed-in + no conversation (empty new chat): last_used_scope + MRU only.
  - Guest: `setSessionScope` (session/thread). No MRU.
- **MRU also upserts** on every completed sent turn’s resolved format (existing chat route, fire-and-forget).
- **`GET /api/auth/me`** adds `lastUsedScopes: Format[]` (MRU order) for signed-in clients. Old clients ignore it.

## ADR-9 — Human copy and chips are client-side projections

- **Decision:** Pure functions, three-client lockstep (same pattern as `oakAnswerToAgentMarkdown`).
  - Human copy: prose + fact table + user-facing caveats + Showdown paste if `proposed_team`.
  - Chips: derive from structured answer + turn context. Caps: 1 scope, 3 Dex, 1 team. No new `OakAnswer` field (CHIP-BR-3).
- **Why:** No model call, no extra API, matches COPY-BR-1.

## ADR-10 — Slashes and palette are client routers

- **Decision:** Leading-token parse on send (`/new`, `/team`, `/dex`, `/usage` if that client has the page). Handled slash does not POST `/api/chat`. Unknown slash (including `/calc`, `/compare`, `/usage` without a page) POSTs as normal text.
- **Palette:** web-only overlay. Data: in-memory conversation list + existing public `GET /api/entity` + existing teams list + `/meta` link.

## ADR-11 — Shared-by-me lives on Account

- **Decision:** CQ-OQ-4 → Account tab (web) / Account screen (native). List live shares + revoke. Reachable without the original thread.

## ADR-12 — Open in Oak import is createTeam

- **Decision:** `POST /api/shares/:id/import-team` copies `proposed_team` into a **new** team on the viewer’s account (guest 401). Does not open the owner’s conversation. CTA without a proposed team is a client link to `/` (or native empty chat).

## ADR-13 — Public page may offer human copy

- **Decision:** CQ-OQ-5 → allow Copy as human text on the public card. No Share/Pin/Fork/Retry/Edit.

## ADR-14 — Fork title

- **Decision:** CQ-OQ-6 → `"{sourceTitle} (fork)"` truncated to 120.

## ADR-15 — Web shortcut chords

Document in Account / `?` overlay. Do not steal ordinary composer typing except these:

| Action | macOS | others |
|---|---|---|
| Palette | ⌘K | Ctrl+K |
| New chat | ⌘⇧O | Ctrl+Shift+O |
| Focus composer | ⌘⇧J | Ctrl+Shift+J |
| Stop | ⌘. | Ctrl+. |
| History search | ⌘⇧F | Ctrl+Shift+F |
| Scope picker | ⌘⇧S | Ctrl+Shift+S |
| Pin/unpin conversation | ⌘⇧P | Ctrl+Shift+P |

(NAV-US-2, CQ-OQ-2.)

## ADR-16 — Rate limits unchanged

Completed retry/edit are normal POSTs and count. Undo/Stop do not persist. Do not build a “successful ask” counter in this pack.
