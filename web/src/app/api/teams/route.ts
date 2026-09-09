/**
 * `/api/teams` — list / create saved teams
 * (docs/features/champions-first/architecture/api-design.md; CF-TEAM-US-1,
 * CF-TEAM-AC-1.1, CF-TEAM-AC-1.7, CF-TEAM-AC-5.1, CF-DATA-BR-9).
 *
 *   GET  (default)              → 200 { teams } living (`format === "champions"`)
 *   GET  ?archived=1|true       → 200 { teams } archived (`format !== "champions"`)
 *   GET  ?format=champions      → 200 living list (old-client cutover)
 *   GET  ?format=<other>        → 400 `invalid_request`
 *   POST body { name?, members? } → 200 { team, validation }
 *        `format` optional and ignored; always stored `champions`.
 *
 * Identity (BR-T2 / CF-AUTH-AC-2.1): teams are signed-in only. Guests get
 * **401 `unauthorized`** everywhere; every read/write is scoped to the resolved
 * `account.id`. POST is also the "apply proposed team as new" path (AC-6.3) —
 * partial/empty members allowed (BR-T4), warn-but-allow validation returned
 * alongside the created team.
 *
 * Thin adapter: repos/services and `getCurrentAccount` are reached via DYNAMIC
 * import so `next build` never evaluates `@/env` at page-data collection (the
 * AUTH_SECRET prod guard) — mirrors the auth/chat/conversations routes.
 */

import { json, jsonError, readJsonObject } from "@/app/api/auth/_lib/http";
import { CHAMPIONS_FORMAT } from "@/data/formats";
import { teamMembersSchema, type TeamMember } from "@/data/teams/team-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Default name for a brand-new team (AC-1.2). */
const DEFAULT_TEAM_NAME = "Untitled team";
/** Upper bound for a user-supplied team name (auto-defaults are short). */
const MAX_NAME_LEN = 120;

const UNAUTHORIZED = () =>
  jsonError(401, "unauthorized", "You must be signed in.");

async function currentAccount() {
  const { getCurrentAccount } = await import("@/server/auth/current-user");
  return getCurrentAccount();
}

// ---------------------------------------------------------------------------
// GET — living Champions teams by default; ?archived=1 for the archive
// ---------------------------------------------------------------------------

function isArchivedQuery(value: string | null): boolean {
  if (value === null) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true";
}

export async function GET(req: Request): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();

  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  // Old clients may still send ?format=champions (treat as living). Any other
  // format picker is rejected so a gen filter cannot look like a living Dex.
  if (format !== null && format !== CHAMPIONS_FORMAT) {
    return jsonError(400, "invalid_request", "Unknown format.");
  }

  const { listTeams } = await import("@/data/repos/team-repo");
  // `?format=champions` wins over `?archived=1` so an old client that sends
  // both still gets the living list (not a mixed/ambiguous archive).
  const archived =
    format === CHAMPIONS_FORMAT
      ? false
      : isArchivedQuery(url.searchParams.get("archived"));
  const teams = await listTeams(account.id, { archived });
  return json(200, { teams });
}

// ---------------------------------------------------------------------------
// POST — create a team (also the "apply proposed team as new" path, AC-6.3)
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();

  const body = await readJsonObject(req);
  if (body === null) {
    return jsonError(400, "invalid_request", "Request body must be a JSON object.");
  }

  let name = DEFAULT_TEAM_NAME;
  if (body.name !== undefined) {
    if (typeof body.name !== "string") {
      return jsonError(400, "invalid_request", "name must be a string.");
    }
    const trimmed = body.name.trim();
    if (trimmed.length > MAX_NAME_LEN) {
      return jsonError(400, "invalid_name", `name must be ≤${MAX_NAME_LEN} characters.`);
    }
    if (trimmed.length > 0) name = trimmed;
  }

  let members: TeamMember[] = [];
  if (body.members !== undefined) {
    const parsed = teamMembersSchema.safeParse(body.members);
    if (!parsed.success) {
      return jsonError(400, "invalid_members", "members failed validation.");
    }
    members = parsed.data;
  }

  const { db } = await import("@/data/db");
  const { createTeam } = await import("@/data/repos/team-repo");
  const { validateTeam } = await import("@/server/teams/validate-team");

  const team = await createTeam({
    accountId: account.id,
    format: CHAMPIONS_FORMAT,
    name,
    members,
    now: Date.now(),
  });
  const validation = await validateTeam(team.members, CHAMPIONS_FORMAT, db);

  return json(200, { team, validation });
}
