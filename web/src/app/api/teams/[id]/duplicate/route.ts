/**
 * `POST /api/teams/[id]/duplicate` — clone a living team into a new, independent
 * copy (docs/features/champions-first/architecture/api-design.md; CF-TEAM-AC-5.3,
 * AC-4.2, BR-T2).
 *
 *   POST living → 200 { team, validation }  copy stays champions
 *   POST archived → **409 `team_archived`** (no rebuild-as-Champions)
 *
 * Clones the source members into a fresh team named `"<name> copy"`; the copy is
 * fully independent thereafter. Account-scoped: a missing / not-owned source →
 * **404** (never 403). Guests → **401**.
 */

import { json, jsonError } from "@/app/api/auth/_lib/http";
import { CHAMPIONS_FORMAT } from "@/data/formats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const UNAUTHORIZED = () =>
  jsonError(401, "unauthorized", "You must be signed in.");
const NOT_FOUND = () => jsonError(404, "not_found", "Team not found.");
const TEAM_ARCHIVED = () =>
  jsonError(409, "team_archived", "Archived teams cannot be duplicated.");

async function currentAccount() {
  const { getCurrentAccount } = await import("@/server/auth/current-user");
  return getCurrentAccount();
}

export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();
  const { id } = await ctx.params;

  const { duplicateTeam, getTeam } = await import("@/data/repos/team-repo");
  const source = await getTeam(account.id, id);
  if (source === null) return NOT_FOUND();
  if (source.format !== CHAMPIONS_FORMAT) return TEAM_ARCHIVED();

  const team = await duplicateTeam(account.id, id, Date.now());
  if (team === null) return NOT_FOUND();

  const { db } = await import("@/data/db");
  const { validateTeam } = await import("@/server/teams/validate-team");
  const validation = await validateTeam(team.members, CHAMPIONS_FORMAT, db);

  return json(200, { team, validation });
}
