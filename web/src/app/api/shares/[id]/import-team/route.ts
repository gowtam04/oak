/**
 * `POST /api/shares/:id/import-team` — copy `proposed_team` onto the VIEWER
 * account (SHARE-US-5, SHARE-BR-7, AUTH-BR-3, ADR-12).
 *
 * Guest → 401. Revoked / unknown → 404. Snapshot with no proposal → 400
 * `no_proposed_team`. Never writes the owner's teams.
 */

import { json } from "@/app/api/auth/_lib/http";
import {
  UNAUTHORIZED,
  NOT_FOUND,
  currentAccount,
  shareError,
  shareRepo,
  teamRepo,
} from "../../_lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(
  _req: Request,
  ctx: Ctx,
): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();
  const { id } = await ctx.params;

  const shares = await shareRepo();
  const share = await shares.getLiveShare(id);
  if (share === null) return NOT_FOUND();

  const proposed = share.answer.proposed_team;
  if (!proposed) {
    return shareError(400, "no_proposed_team", "This share has no proposed team.");
  }

  const teams = await teamRepo();
  const team = await teams.createTeam({
    accountId: account.id,
    format: proposed.format,
    name: proposed.name,
    members: proposed.members,
    now: Date.now(),
  });
  return json(201, { team_id: team.id });
}
