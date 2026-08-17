/**
 * Ephemeral (not prefix-cached) system segment listing the teams the user
 * @mentioned on this turn. The model must call existing `get_team` — there is
 * no 21st tool. Omitted entirely when `boundTeams` is empty.
 */

import type { BoundTeam } from "@/agent/types";
import type { SystemSegment } from "@/agent/providers/types";

/** Build the uncached bound-teams segment. Caller omits it when `teams` is empty. */
export function boundTeamsSegment(teams: BoundTeam[]): SystemSegment {
  const rows = teams
    .map((t) => `- id: ${t.id}; name: ${t.name}; format: ${t.format}`)
    .join("\n");
  return {
    text:
      "Bound teams for this turn (user @mentions). These ids are already " +
      "resolved — do not guess from the display name. Call get_team with " +
      "each id to load full members and sets.\n" +
      rows,
  };
}
