/**
 * Resolve `mentioned_team_ids` to `{ id, name, format }` for this turn
 * (chat-qol ADR-5, MEN-US-1, MEN-BR-1..4, AUTH-BR-4).
 *
 * Mentions are server-bound via `getTeam(accountId, id)`, never name-matched.
 * Any miss (deleted, not owned, unknown) is
 * `{ ok:false, error:"unbound_mention", id }`. The route binds the ok result
 * onto `AgentContext.boundTeams` and the model loads members with existing
 * `get_team` — there is no 21st tool.
 *
 * Guests never reach this helper: the route 400s a non-empty mention list
 * before calling.
 */

import "server-only";

import type { BoundTeam } from "@/agent/types";
import type { Format } from "@/data/formats";
import { getTeam } from "@/data/repos/team-repo";

export type { BoundTeam };

export type ResolveBoundTeamsResult =
  | { ok: true; teams: BoundTeam[] }
  | { ok: false; error: "unbound_mention"; id: string };

export async function resolveBoundTeams(
  accountId: string,
  ids: string[],
): Promise<ResolveBoundTeamsResult> {
  const teams: BoundTeam[] = [];
  for (const id of ids) {
    const team = await getTeam(accountId, id);
    if (!team) {
      return { ok: false, error: "unbound_mention", id };
    }
    teams.push({
      id: team.id,
      name: team.name,
      format: team.format as Format,
    });
  }
  return { ok: true, teams };
}
