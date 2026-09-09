/**
 * `POST /api/admin/spend/caps` — operator daily-cap write (spend-controls
 * architecture § API Design; SC-US-4, SC-AC-2.2, SC-AC-4.2, SC-AC-4.3).
 *
 * Thin HTTP adapter: `requireAdminRequest` runs FIRST (401 guest / 403
 * non-admin), then body validation (integers ≥ 1), then
 * `spend-repo.setCaps(caps, adminEmail)`. 200 returns the spend projection
 * (`getCaps` + `getDenylist` + `getCapExempt`).
 *
 * Guard + repo are reached via DYNAMIC import so `next build`'s page-data
 * collection never eagerly evaluates the env/db-touching chain.
 */

import { json, jsonError, readJsonObject } from "@/app/api/auth/_lib/http";
import type { AdminSpendState } from "@/lib/admin/admin-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** True iff `n` is a JSON number that is an integer ≥ 1 (SC-AC-4.3). */
function isPositiveInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1;
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
  const signedCap = raw?.signedCap;
  const guestCap = raw?.guestCap;
  if (!isPositiveInt(signedCap) || !isPositiveInt(guestCap)) {
    return jsonError(
      400,
      "invalid_request",
      "Body must be { signedCap, guestCap } with integers ≥ 1.",
    );
  }

  const { setCaps } = await import("@/data/repos/spend-repo");
  await setCaps({ signedCap, guestCap }, guard.account.email);

  const spend = await loadSpend();
  return json(200, spend);
}
