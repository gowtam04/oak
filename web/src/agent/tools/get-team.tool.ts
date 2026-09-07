/**
 * T12 — `get_team` (load ONE saved team by id).
 *
 * Loads the saved team identified by `team_id` — which the model obtained from a
 * prior `list_teams` call, never invented — account-scoped and living-only
 * (`resolveActiveTeam` with Champions), then returns it enriched with display
 * names + computed validity warnings (`enrichActiveTeam`). An unknown, not-
 * owned, or archived / other-format id yields `{ found: false }` (CF-TEAM-AC-5.3),
 * so the model has no way to read a roster outside the signed-in account's
 * living Champions teams.
 *
 * Never throws in-domain: a guest, a missing id, or any read fault while
 * resolving/enriching degrades to `{ found: false }`.
 */

import type { ToolDef } from "@/agent/types";
import type { OakDb } from "@/data/db";
import {
  getTeamInputSchema,
  toJsonSchema,
  type GetTeamOutput,
} from "@/agent/schemas";
import {
  enrichActiveTeam,
  resolveActiveTeam,
} from "@/server/teams/active-team";

const description =
  "Load one of the user's saved teams by id — its members (species, ability, " +
  "item, moves, nature, EVs/IVs, Tera type, level), their display names, and any " +
  "validity/legality warnings. Pass a `team_id` you got from `list_teams` (you " +
  "cannot guess one). Returns { found: false } if the id isn't one of this " +
  "user's living Champions teams (archived / other-game teams are not loaded). " +
  "Use this after list_teams to read the " +
  "team the user is asking about (\"my rain team\", \"this set\") and ground your " +
  "advice in it.";

export const getTeamTool: ToolDef = {
  name: "get_team",
  description,
  inputSchema: toJsonSchema(getTeamInputSchema),
  async run(rawArgs, ctx): Promise<GetTeamOutput> {
    const parsed = getTeamInputSchema.safeParse(rawArgs ?? {});
    if (!parsed.success) return { found: false };
    // Guests have no saved teams to read (the route never binds accountId).
    if (!ctx.accountId) return { found: false };
    try {
      // Living Champions only: leftover ctx.mode must not load archived
      // other-game teams, and must still load a living Champions id.
      const team = await resolveActiveTeam(
        ctx.accountId,
        parsed.data.team_id,
        "champions",
        ctx.db as unknown as OakDb,
      );
      if (!team) return { found: false };
      const enriched = await enrichActiveTeam(team, ctx.db as unknown as OakDb);
      return { found: true, team: enriched };
    } catch {
      // Any in-domain read fault → behave as if the team isn't found.
      return { found: false };
    }
  },
};
