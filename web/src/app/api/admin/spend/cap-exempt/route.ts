/**
 * `POST`/`DELETE /api/admin/spend/cap-exempt` — operator cap-exemption writes
 * (spend-controls architecture; SC-US-9, SC-BR-16).
 *
 * Thin HTTP adapter: `requireAdminRequest` runs FIRST (401/403), then email
 * validation, then spend-repo add/remove. Unlike the denylist, allowlisted
 * admin emails are **not** rejected here — they are already uncapped, so
 * adding them is redundant but harmless. DELETE is idempotent (200 even if
 * the email is absent) and accepts the email in the JSON body or as a query
 * param.
 *
 * Guard + repo are reached via DYNAMIC import so `next build`'s page-data
 * collection never eagerly evaluates the env/db-touching chain.
 */

import { json, jsonError, readJsonObject } from "@/app/api/auth/_lib/http";
import type { AdminSpendState } from "@/lib/admin/admin-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Trim + lowercase — the cap-exempt identity (SC-BR-16). */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Cheap syntactic check — a single `local@domain.tld` shape with no spaces.
 * Matches the denylist / auth-service shape so obviously-malformed input 400s.
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function loadSpend(): Promise<AdminSpendState> {
  const { getCaps, getDenylist, getCapExempt } = await import(
    "@/data/repos/spend-repo"
  );
  const [caps, denylist, capExempt] = await Promise.all([
    getCaps(),
    getDenylist(),
    getCapExempt(),
  ]);
  return {
    signedCap: caps.signedCap,
    guestCap: caps.guestCap,
    denylist,
    capExempt,
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

  const { addCapExemptEmail } = await import("@/data/repos/spend-repo");
  await addCapExemptEmail(email, guard.account.email);

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

  const { removeCapExemptEmail } = await import("@/data/repos/spend-repo");
  await removeCapExemptEmail(email);

  const spend = await loadSpend();
  return json(200, { ok: true, spend });
}
