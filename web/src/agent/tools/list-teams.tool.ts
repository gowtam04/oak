/**
 * T16 — `list_teams` (the user's living Champions teams).
 *
 * Returns a cheap pick-list — each saved team's id, name, completeness, and the
 * display names of its Pokémon — so the model can match the user's words ("my
 * rain team", "the one with Garchomp") against names AND contents, then load the
 * chosen team with `get_team`. Living only (`format === "champions"`), even if
 * leftover `ctx.mode` is another game — archived / other-format teams are never
 * offered (CF-TEAM-AC-1.7, CF-TEAM-AC-5.3). A guest gets `{ signed_in: false }`.
 *
 * Never throws in-domain: a read fault degrades to an empty team list rather than
 * propagating.
 */

import type { ToolDef } from "@/agent/types";
import type { OakDb } from "@/data/db";
import {
  listTeamsInputSchema,
  toJsonSchema,
  type ListTeamsOutput,
  type TeamListEntry,
} from "@/agent/schemas";
import { CHAMPIONS_FORMAT } from "@/data/formats";
import { listTeams } from "@/data/repos/team-repo";
import { displayNamesFor } from "@/server/teams/active-team";

const description =
  "List the user's living Champions teams — each team's id, name, " +
  "how many Pokémon it has, whether it's incomplete, and the names of its " +
  "Pokémon. Takes no arguments. Returns { signed_in: false } for a guest, else " +
  "{ signed_in: true, teams: [...] } (an empty list means they have no saved " +
  "living teams). Archived teams from other games are not listed. Call this " +
  "when the user refers to a saved team (\"my team\", \"my rain team\", " +
  "\"this set\"): match their words against the team names AND Pokémon, then " +
  "call get_team with the matching team_id. If nothing matches, say so and " +
  "offer to build one; if two or more plausibly match, ask which.";

export const listTeamsTool: ToolDef = {
  name: "list_teams",
  description,
  inputSchema: toJsonSchema(listTeamsInputSchema),
  async run(_args, ctx): Promise<ListTeamsOutput> {
    // Guests have no saved teams (the route never binds accountId).
    if (!ctx.accountId) return { signed_in: false };
    try {
      const summaries = await listTeams(ctx.accountId);
      // One batched display-name read across every team's species (never throws;
      // falls back to the raw slug for an unknown species). Always Champions —
      // leftover ctx.mode must not surface archived other-game teams.
      const names = await displayNamesFor(
        summaries.flatMap((t) => t.species),
        CHAMPIONS_FORMAT,
        ctx.db as unknown as OakDb,
      );
      const teams: TeamListEntry[] = summaries.map((t) => ({
        team_id: t.id,
        name: t.name,
        member_count: t.memberCount,
        incomplete: t.incomplete,
        species: t.species.map((s) => names.get(`pokemon:${s}`) ?? s),
      }));
      return { signed_in: true, teams };
    } catch {
      // A read fault — behave as if the account has no teams rather than 500.
      return { signed_in: true, teams: [] };
    }
  },
};
