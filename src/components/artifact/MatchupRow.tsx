/**
 * MatchupRow — a labeled row of clickable type badges, shared by the Pokémon
 * profile's combined defensive grid and the Type artifact's offensive/defensive
 * grids. Each badge drills into that type's artifact (AV-US-5). An empty list
 * renders a muted "—" so the row reads honestly rather than vanishing.
 */

"use client";

import TypeBadge from "@/components/TypeBadge";
import type { TypeName } from "@/agent/schemas";

import EntityLink from "./EntityLink";

export interface MatchupRowProps {
  label: string;
  types: string[];
  testid?: string;
}

export default function MatchupRow({
  label,
  types,
  testid,
}: MatchupRowProps): React.JSX.Element {
  return (
    <div className="matchup-row" data-testid={testid}>
      <span className="matchup-row__label">{label}</span>
      <span className="matchup-row__badges">
        {types.length === 0 ? (
          <span className="matchup-row__empty">—</span>
        ) : (
          types.map((t) => (
            <EntityLink key={t} kind="type" q={t} className="entity-link--type">
              <TypeBadge type={t as TypeName} />
            </EntityLink>
          ))
        )}
      </span>
    </div>
  );
}
