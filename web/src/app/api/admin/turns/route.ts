/**
 * `GET /api/admin/turns` — the admin turns explorer: a searchable, filterable,
 * keyset-paginated list of recorded chat turns (summary projection, no heavy
 * JSON). This is the list half of the per-turn drill-down (ADMIN-US-5,
 * ADMIN-AC-5.1); the row's full breakdown lives at `GET /api/admin/turns/[id]`.
 *
 * Design refs:
 *   - docs/features/admin-panel/architecture/design.md
 *       § Component Design › 4 (Admin API — thin handler: guard → parse → repo → json)
 *       § API Design (common query params; `GET /api/admin/turns → TurnsListResponse`)
 *       § Technical Decisions AD-5 (the route guard is the real boundary),
 *         AD-7 (ilike search, keyset on (created_at,id)).
 *   - requirements.md ADMIN-US-5, ADMIN-AC-5.1, ADMIN-BR-1/2/4 (admin-only,
 *     read-only, owner cross-account read), ADMIN-BR-8 (date-range scoping).
 *
 * Shape (mirrors `/api/conversations` + the auth routes):
 *   - `runtime = "nodejs"` + `dynamic = "force-dynamic"` so this is never
 *     statically collected.
 *   - The admin guard AND the repo are reached via DYNAMIC import INSIDE the
 *     handler (CLAUDE.md "API ROUTES" rule) — a top-level import of an
 *     env/db-touching module re-introduces the `next build` env-throw. Only the
 *     pure `json` helper and erased `import type`s are imported at the top.
 *   - Gating first (ADMIN-AC-1.4): `requireAdminRequest` → 401 (no session) /
 *     403 (non-admin) / `{ account }`. A non-admin gets a bare error envelope and
 *     NO turn data (ADMIN-AC-1.2).
 *
 * Query params (all OPTIONAL, parsed LENIENTLY — bad/missing → sensible default,
 * never a 500): `from`/`to` (epoch ms; `to` exclusive, matching the analytics
 * `Range`), `model`, `mode`, `status`, `kind` (`guest`|`signed`), `accountId`,
 * `sessionId`, `q` (substring over prompt/answer), `limit` (default 50; the repo
 * clamps), `cursor` (keyset on `(created_at, id)`). Unlike the analytics routes
 * the explorer is NOT forced into a default window — an absent `from`/`to` lists
 * across all recorded turns, paged most-recent-first (the repo treats them as
 * fully optional). The returned `Paginated<TurnSummary>` IS the wire response.
 */

import { json } from "@/app/api/auth/_lib/http";

import type { TurnFilter, TurnKind, TurnsListResponse } from "@/lib/admin/admin-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;

/** A finite number param, or `undefined` (lenient: missing/NaN/∞ → undefined). */
function numParam(sp: URLSearchParams, name: string): number | undefined {
  const raw = sp.get(name);
  if (raw === null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** A trimmed non-empty string param, or `undefined`. */
function strParam(sp: URLSearchParams, name: string): string | undefined {
  const raw = sp.get(name)?.trim();
  return raw ? raw : undefined;
}

export async function GET(req: Request): Promise<Response> {
  const { requireAdminRequest } = await import("@/app/api/admin/_lib/guard");
  const auth = await requireAdminRequest(req);
  if ("response" in auth) return auth.response;

  const sp = new URL(req.url).searchParams;

  const kindRaw = strParam(sp, "kind");
  const kind: TurnKind | undefined =
    kindRaw === "guest" || kindRaw === "signed" ? kindRaw : undefined;

  const filter: TurnFilter = {
    from: numParam(sp, "from"),
    to: numParam(sp, "to"),
    model: strParam(sp, "model"),
    mode: strParam(sp, "mode"),
    status: strParam(sp, "status"),
    kind,
    accountId: strParam(sp, "accountId"),
    sessionId: strParam(sp, "sessionId"),
    q: strParam(sp, "q"),
    limit: numParam(sp, "limit") ?? DEFAULT_LIMIT,
    cursor: strParam(sp, "cursor"),
  };

  const { listTurns } = await import("@/data/repos/admin-content-repo");
  const page: TurnsListResponse = await listTurns(filter);
  return json(200, page);
}
