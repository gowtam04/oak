/**
 * TeamWarnings — renders a flat list of advisory `TeamWarning`s (BR-T5/BR-T6).
 *
 * Pure presentational: it never recomputes validity (that is the server's
 * `validateTeam`, surfaced through the route's `validation` field). The Teams
 * editor splits the team's warnings into per-slot groups (shown inside each
 * {@link TeamMemberPanel}) and the team-level remainder (clauses); this
 * component renders whichever subset it is handed. A clean list (`[]`) renders
 * nothing so the editor stays quiet for a valid team.
 *
 * Warnings are advisory only — they never block a save/import (BR-T4/BR-T6); the
 * UI shows them as a non-fatal `status`, never an error that gates an action.
 */

import type { TeamWarning } from "@/lib/teams-client";

export interface TeamWarningsProps {
  /** The warnings to render (already filtered to the relevant scope). */
  warnings: TeamWarning[];
  /** Optional heading (e.g. "Team legality") shown above the list. */
  title?: string;
  /** Override the wrapper test id (defaults to "team-warnings"). */
  testid?: string;
}

export default function TeamWarnings({
  warnings,
  title,
  testid,
}: TeamWarningsProps) {
  if (warnings.length === 0) return null;
  return (
    <div
      className="team-warnings"
      data-testid={testid ?? "team-warnings"}
      role="status"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-1)",
      }}
    >
      {title && (
        <span
          className="team-warnings__title"
          style={{
            font: "700 12px/1.4 var(--font-body)",
            color: "var(--text-strong)",
          }}
        >
          {title}
        </span>
      )}
      <ul
        className="team-warnings__list"
        style={{ margin: 0, paddingLeft: "var(--space-4)" }}
      >
        {warnings.map((w, i) => (
          <li
            key={`${w.code}-${w.slot ?? "team"}-${w.field ?? i}`}
            className={`team-warning team-warning--${w.code}`}
            data-testid="team-warning"
            data-code={w.code}
            style={{
              font: "500 12px/1.5 var(--font-body)",
              color: "var(--text-muted)",
            }}
          >
            {w.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
