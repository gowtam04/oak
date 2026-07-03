/**
 * MatchupChart — a Pokémon's defensive type matchups, one row per multiplier
 * bucket (4x, 2x, 0.5x, 0.25x, 0x), each rendering the reused `TypeBadge` per
 * type. A bucket with no types is omitted so the chart never shows an empty
 * "Immune to —" row.
 */

import TypeBadge from "@/components/TypeBadge";
import type { TypeName } from "@/agent/schemas";

export interface MatchupGroup {
  /** e.g. "Weak to (4x)", "Resists (0.5x)", "Immune to". */
  label: string;
  /** Display multiplier, e.g. "4x", "2x", "0.5x", "0.25x", "0x". */
  multiplier: string;
  /** Canonical type slugs in this bucket. */
  types: string[];
}

export interface MatchupChartProps {
  groups: MatchupGroup[];
}

export default function MatchupChart({ groups }: MatchupChartProps) {
  const nonEmpty = groups.filter((g) => g.types.length > 0);
  if (nonEmpty.length === 0) return null;

  return (
    <div className="ref-matchups" data-testid="matchup-chart">
      {nonEmpty.map((g) => (
        <div key={g.label} className="ref-matchups__row" data-testid={`matchup-row-${g.multiplier}`}>
          <span className="ref-matchups__label">{g.label}</span>
          <span className="ref-matchups__mult mono-num">{g.multiplier}</span>
          <span className="ref-matchups__badges">
            {g.types.map((t) => (
              <TypeBadge key={t} type={t as TypeName} />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
