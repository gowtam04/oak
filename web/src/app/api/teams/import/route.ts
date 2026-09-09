/**
 * `POST /api/teams/import` — Showdown paste → a living Champions team
 * (docs/features/champions-first/architecture/api-design.md; CF-TEAM-US-3,
 * CF-TEAM-AC-3.1–3.4, CF-DATA-BR-9, ADR-7).
 *
 *   POST body { paste, name? } → 200 { team, validation, notes: ImportNote[] }
 *   `format` is optional and ignored; the row is always `champions`.
 *
 * Never aborts wholesale: `importPaste` resolves what it can against the
 * Champions index, keeps off-roster names as stored text, and surfaces notes.
 * Tera is dropped; EV numbers are stored as Stat Points; 66/32 over-cap is
 * warn-but-allow. Validation is warn-but-allow.
 *
 * WAVE-2 carry-over: `@pkmn` does NOT clamp EVs, so `importPaste` can return a
 * member with an EV/IV > 255, which would fail `teamMembersSchema` (max 255) on
 * write/read. We CLAMP those into the schema range here so the import is a safe
 * **200** (never a 500); `validateTeam` then owns the Stat Point cap warnings
 * (66 total / 32 per stat). `importPaste` itself emits no cap warnings. Living
 * import forces level 50 (ADR-7); an out-of-range paste value must not fail the
 * schema and wipe the whole import (U1).
 *
 * Guests → **401**.
 */

import { json, jsonError, readJsonObject } from "@/app/api/auth/_lib/http";
import { CHAMPIONS_FORMAT } from "@/data/formats";
import { teamMembersSchema, type TeamMember } from "@/data/teams/team-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TEAM_NAME = "Imported team";

const UNAUTHORIZED = () =>
  jsonError(401, "unauthorized", "You must be signed in.");

async function currentAccount() {
  const { getCurrentAccount } = await import("@/server/auth/current-user");
  return getCurrentAccount();
}

/** Clamp a single stat value into the schema-legal range (0..255). */
function clampStat(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(255, Math.trunc(v)));
}

/**
 * Clamp `level` into the schema-legal range (1..100) so an out-of-range paste
 * value (e.g. `Level: 150` / `Level: 0`) can't fail `teamMembersSchema` and nuke
 * the whole import. Living import already forces 50 (ADR-7); this is a belt-
 * and-suspenders guard. Non-finite falls back to 50.
 */
function clampLevel(v: number): number {
  if (!Number.isFinite(v)) return 50;
  return Math.max(1, Math.min(100, Math.trunc(v)));
}

/**
 * Bring a member's EV/IV spreads into the schema range so the team can be
 * persisted/round-tripped. `@pkmn` may hand back out-of-range values; we never
 * reject the import for them (validateTeam flags the competitive caps).
 */
function clampMember(m: TeamMember): TeamMember {
  const clampSpread = (s: TeamMember["evs"]) => ({
    hp: clampStat(s.hp),
    atk: clampStat(s.atk),
    def: clampStat(s.def),
    spa: clampStat(s.spa),
    spd: clampStat(s.spd),
    spe: clampStat(s.spe),
  });
  return {
    ...m,
    evs: clampSpread(m.evs),
    ivs: clampSpread(m.ivs),
    level: clampLevel(m.level),
  };
}

export async function POST(req: Request): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();

  const body = await readJsonObject(req);
  if (body === null) {
    return jsonError(400, "invalid_request", "Request body must be a JSON object.");
  }

  if (typeof body.paste !== "string") {
    return jsonError(400, "invalid_request", "`paste` (Showdown text) is required.");
  }
  const paste = body.paste;

  let name = DEFAULT_TEAM_NAME;
  if (typeof body.name === "string") {
    const trimmed = body.name.trim();
    if (trimmed.length > 0) name = trimmed;
  }

  const { db } = await import("@/data/db");
  const { importPaste } = await import("@/server/teams/import-export");
  const { createTeam } = await import("@/data/repos/team-repo");
  const { validateTeam } = await import("@/server/teams/validate-team");

  const { members: rawMembers, notes } = await importPaste(
    paste,
    CHAMPIONS_FORMAT,
    db,
  );

  // Clamp out-of-range EV/IVs into the schema range so persistence never throws
  // (carry-over). `safeParse` is a belt-and-suspenders guard: if anything still
  // fails the schema, drop to an empty team rather than 500 the import.
  const clamped = rawMembers.map(clampMember);
  const parsed = teamMembersSchema.safeParse(clamped);
  const members: TeamMember[] = parsed.success ? parsed.data : [];

  const team = await createTeam({
    accountId: account.id,
    format: CHAMPIONS_FORMAT,
    name,
    members,
    now: Date.now(),
  });
  const validation = await validateTeam(team.members, CHAMPIONS_FORMAT, db);

  return json(200, { team, validation, notes });
}
