/**
 * `DELETE /api/shares/:id` — owner revoke (SHARE-US-3, SHARE-BR-3, AUTH-BR-6).
 *
 * Sets `revoked_at`. Permanent; the public URL 404s. Non-owner / unknown id
 * → 404 (no existence leak). Guest → 401.
 */

import {
  UNAUTHORIZED,
  NOT_FOUND,
  currentAccount,
  shareRepo,
} from "../_lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(
  _req: Request,
  ctx: Ctx,
): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();
  const { id } = await ctx.params;

  const repo = await shareRepo();
  const ok = await repo.revokeShare(account.id, id);
  if (!ok) return NOT_FOUND();
  return new Response(null, { status: 204 });
}
