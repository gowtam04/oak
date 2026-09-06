/**
 * `POST`/`DELETE /api/admin/spend/denylist` — operator denylist writes
 * (spend-controls architecture § API Design; SC-US-1, SC-US-2, SC-AC-1.3,
 * SC-AC-2.1, SC-AC-2.2, SC-BR-6, SC-BR-12).
 *
 * Thin HTTP adapter: `requireAdminRequest` runs FIRST (401/403), then email
 * validation, then 409 `admin_exempt` if the (normalized) target is on
 * `ADMIN_EMAILS`, then spend-repo add/remove. DELETE is idempotent (200 even
 * if the email is absent) and accepts the email in the JSON body or as a
 * query param.
 *
 * Guard + repo are reached via DYNAMIC import so `next build`'s page-data
 * collection never eagerly evaluates the env/db-touching chain.
 */

import { json, jsonError, readJsonObject } from "@/app/api/auth/_lib/http";
import type { AdminSpendState } from "@/lib/admin/admin-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Trim + lowercase — the denylist identity (SC-BR-2). */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Cheap syntactic check — a single `local@domain.tld` shape with no spaces.
 * Matches the auth-service shape so obviously-malformed input 400s (SC-US-1).
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * True iff `email` (already normalized) is on `ADMIN_EMAILS`. Read at call
 * time so tests can re-stub the allowlist with `vi.stubEnv`. Same split /
 * trim / lowercase as `isAdmin`.
 */
function isAllowlistedAdminEmail(email: string): boolean {
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return false;
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)
    .includes(email);
}

async function loadSpend(): Promise<AdminSpendState> {
  const { getCaps, getDenylist } = await import("@/data/repos/spend-repo");
  const [caps, denylist] = await Promise.all([getCaps(), getDenylist()]);
  return {
    signedCap: caps.signedCap,
    guestCap: caps.guestCap,
    denylist,
  };
}

export async function POST(req: Request): Promise<Response> {
  const { requireAdminRequest } = await import("@/app/api/admin/_lib/guard");
  const guard = await requireAdminRequest(req);
  if ("response" in guard) return guard.response;

  const raw = await readJsonObject(req);
  if (typeof raw?.email !== "string") {
    return jsonError(400, "invalid_request", "Body must be { email }.");
  }
  const email = normalizeEmail(raw.email);
  if (email === "" || !isValidEmail(email)) {
    return jsonError(
      400,
      "invalid_request",
      "Enter a valid email address.",
    );
  }
  if (isAllowlistedAdminEmail(email)) {
    return jsonError(
      409,
      "admin_exempt",
      "Allowlisted admin emails cannot be denylisted.",
    );
  }

  const { addDenylistEmail } = await import("@/data/repos/spend-repo");
  await addDenylistEmail(email, guard.account.email);

  const spend = await loadSpend();
  return json(200, { ok: true, spend });
}

export async function DELETE(req: Request): Promise<Response> {
  const { requireAdminRequest } = await import("@/app/api/admin/_lib/guard");
  const guard = await requireAdminRequest(req);
  if ("response" in guard) return guard.response;

  const url = new URL(req.url);
  const raw = await readJsonObject(req);
  const fromBody = typeof raw?.email === "string" ? raw.email : "";
  const fromQuery = url.searchParams.get("email") ?? "";
  const email = normalizeEmail(fromBody || fromQuery);
  if (email === "") {
    return jsonError(
      400,
      "invalid_request",
      "Provide an email (JSON body or ?email=) to remove.",
    );
  }

  const { removeDenylistEmail } = await import("@/data/repos/spend-repo");
  await removeDenylistEmail(email);

  const spend = await loadSpend();
  return json(200, { ok: true, spend });
}
