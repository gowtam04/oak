/**
 * `/api/teams/[id]` — read / replace / delete one saved team
 * (docs/features/champions-first/architecture/api-design.md; CF-TEAM-US-5,
 * CF-TEAM-AC-5.2, CF-TEAM-AC-5.3, CF-DATA-BR-13, CF-DATA-BR-14).
 *
 *   GET    → 200 { team, validation, archived? }  living editor, or archived
 *                                                 read-only payload
 *   PUT/PATCH → 200 { team, validation }          living replace; archived →
 *                                                 **409 `team_archived`**
 *   DELETE → 200 { ok: true }                     living or archived (permanent)
 *
 * Isolation (BR-T2 / CF-AUTH-AC-2.1): a team owned by another account is
 * indistinguishable from a missing one — all verbs return **404**, never 403.
 * Guests get **401**. PUT is also the "apply proposed team onto an existing
 * team" path (AC-6.3, AC-7.1); validation is warn-but-allow. There is no
 * rebuild-as-Champions action on archived rows.
 */

import { json, jsonError, readJsonObject } from "@/app/api/auth/_lib/http";
import { CHAMPIONS_FORMAT, type Format } from "@/data/formats";
import { teamMembersSchema, type TeamMember } from "@/data/teams/team-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NAME_LEN = 120;

type Ctx = { params: Promise<{ id: string }> };

const UNAUTHORIZED = () =>
  jsonError(401, "unauthorized", "You must be signed in.");
const NOT_FOUND = () => jsonError(404, "not_found", "Team not found.");
const TEAM_ARCHIVED = () =>
  jsonError(409, "team_archived", "Archived teams are view and delete only.");

async function currentAccount() {
  const { getCurrentAccount } = await import("@/server/auth/current-user");
  return getCurrentAccount();
}

// ---------------------------------------------------------------------------
// GET — full team + computed warnings (the editor view, AC-5.4)
// ---------------------------------------------------------------------------

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();
  const { id } = await ctx.params;

  const { getTeam, isArchivedTeam } = await import("@/data/repos/team-repo");
  const team = await getTeam(account.id, id);
  if (team === null) return NOT_FOUND();

  const { db } = await import("@/data/db");
  const { validateTeam } = await import("@/server/teams/validate-team");
  const validation = await validateTeam(team.members, team.format as Format, db);
  const archived = isArchivedTeam(team.format);

  return json(200, { team, validation, ...(archived ? { archived: true } : {}) });
}

// ---------------------------------------------------------------------------
// PUT — replace name and/or members (warn-but-allow)
// ---------------------------------------------------------------------------

export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();
  const { id } = await ctx.params;

  const { getTeam } = await import("@/data/repos/team-repo");
  const existing = await getTeam(account.id, id);
  if (existing === null) return NOT_FOUND();
  if (existing.format !== CHAMPIONS_FORMAT) return TEAM_ARCHIVED();

  const body = await readJsonObject(req);
  if (body === null) {
    return jsonError(400, "invalid_request", "Request body must be a JSON object.");
  }

  const hasName = body.name !== undefined;
  const hasMembers = body.members !== undefined;
  const hasWin =
    body.win_condition !== undefined || body.winCondition !== undefined;
  if (!hasName && !hasMembers && !hasWin) {
    return jsonError(
      400,
      "invalid_request",
      "Provide at least one of { name, members, win_condition }.",
    );
  }

  let name: string | undefined;
  if (hasName) {
    if (typeof body.name !== "string") {
      return jsonError(400, "invalid_request", "name must be a string.");
    }
    name = body.name.trim();
    if (name.length === 0 || name.length > MAX_NAME_LEN) {
      return jsonError(400, "invalid_name", `name must be 1–${MAX_NAME_LEN} characters.`);
    }
  }

  let members: TeamMember[] | undefined;
  if (hasMembers) {
    const parsed = teamMembersSchema.safeParse(body.members);
    if (!parsed.success) {
      return jsonError(400, "invalid_members", "members failed validation.");
    }
    members = parsed.data;
  }

  let winCondition: string | null | undefined;
  if (hasWin) {
    const raw = body.win_condition ?? body.winCondition;
    if (raw === null) {
      winCondition = null;
    } else if (typeof raw === "string") {
      winCondition = raw.trim().slice(0, 280);
    } else {
      return jsonError(400, "invalid_request", "win_condition must be a string or null.");
    }
  }

  const { updateTeam } = await import("@/data/repos/team-repo");
  const team = await updateTeam({
    accountId: account.id,
    id,
    name,
    members,
    winCondition,
    now: Date.now(),
  });
  if (team === null) return NOT_FOUND();

  const { db } = await import("@/data/db");
  const { validateTeam } = await import("@/server/teams/validate-team");
  const validation = await validateTeam(team.members, CHAMPIONS_FORMAT, db);

  return json(200, { team, validation });
}

/** PATCH is the same living-only replace; archived → 409 `team_archived`. */
export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  return PUT(req, ctx);
}

// ---------------------------------------------------------------------------
// DELETE — permanent (TEAM-US-4); archived teams may be deleted (CF-TEAM-AC-5.2)
// ---------------------------------------------------------------------------

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();
  const { id } = await ctx.params;

  const { getTeam, deleteTeam } = await import("@/data/repos/team-repo");
  // Ownership check up front so another account's id (or an already-gone team)
  // returns 404 (isolation, AC-4.3) rather than a silent no-op posing as success.
  const team = await getTeam(account.id, id);
  if (team === null) return NOT_FOUND();

  await deleteTeam(account.id, id);
  return json(200, { ok: true });
}
