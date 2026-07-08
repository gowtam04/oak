/**
 * team-analysis-client — the typed `fetch` helper over `POST /api/teams/analyze`.
 *
 * The team editor's only call into the analysis endpoint. Mirrors entity-client:
 * it NEVER throws — a transport fault, a non-2xx (e.g. a 400 for a malformed
 * body, a 429 rate-limit), or a body that fails the shared contract all fold to
 * `null`, which the panel surfaces as its "couldn't analyze" (retry) state. A 200
 * `unavailable` envelope is a VALID result (it parses) and is returned as-is.
 *
 * Public endpoint, so `credentials: "same-origin"` is enough (no Bearer). An
 * optional `AbortSignal` lets the caller cancel a stale in-flight request when
 * the draft changes (an aborted fetch throws → folds to `null`, discarded by the
 * caller's generation guard).
 */

import type { Format } from "@/data/formats";
import type { TeamMembers } from "@/data/teams/team-schema";
import {
  teamAnalysisResponseSchema,
  type TeamAnalysisResponse,
} from "@/lib/teams/team-analysis";

/**
 * Analyze `members` for `format`. Returns the validated envelope, or `null` on
 * any transport / HTTP / contract failure (including an aborted request).
 */
export async function fetchTeamAnalysis(
  format: Format,
  members: TeamMembers,
  signal?: AbortSignal,
): Promise<TeamAnalysisResponse | null> {
  try {
    const res = await fetch("/api/teams/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ format, members }),
      signal,
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const parsed = teamAnalysisResponseSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
