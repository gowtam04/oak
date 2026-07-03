/**
 * StatsTable — a Pokémon's six base stats + BST, each with a numeric cell and
 * a proportional bar (width % of 255, the max a single base stat can reach)
 * colored by `statValueTier` — the SAME value-ramp rule the chat UI's stat
 * meters use (`components/artifact/stat-tier.ts`), so magnitude reads the
 * same on a reference page as in an answer card. A real `<table>` for
 * accessibility, not divs-as-rows.
 */

import { statValueTier } from "@/components/artifact/stat-tier";

/** The maximum value a single base stat can reach — the bar's 100% reference. */
const MAX_STAT_VALUE = 255;

export interface StatsTableProps {
  stats: { label: string; key: string; value: number }[];
  total: number;
}

/** `--fill` custom property + a plain CSSProperties, mirroring the artifact stat meter's pattern. */
type CssVars = React.CSSProperties & Record<`--${string}`, string>;

export default function StatsTable({ stats, total }: StatsTableProps) {
  return (
    <table className="ref-stats" data-testid="stats-table">
      <tbody>
        {stats.map((s) => {
          const tier = statValueTier(s.value);
          const pct = Math.min(
            100,
            Math.max(0, Math.round((s.value / MAX_STAT_VALUE) * 100)),
          );
          const fillStyle: CssVars = { "--fill": `${pct}%` };
          return (
            <tr key={s.key} className="ref-stats__row" data-testid={`stats-row-${s.key}`}>
              <th scope="row" className="ref-stats__label ilabel">
                {s.label}
              </th>
              <td className="ref-stats__value mono-num">{s.value}</td>
              <td className="ref-stats__bar-cell">
                <span className="ref-stats__bar-track">
                  <span
                    className={`ref-stats__bar ref-stats__bar--${tier}`}
                    // eslint-disable-next-line react/forbid-dom-props -- runtime-computed fill width, bound via the --fill custom property (same pattern as PokemonArtifact's stat-meter)
                    style={fillStyle}
                  />
                </span>
              </td>
            </tr>
          );
        })}
        <tr className="ref-stats__row ref-stats__row--total" data-testid="stats-row-total">
          <th scope="row" className="ref-stats__label ilabel">
            BST
          </th>
          <td className="ref-stats__value mono-num" colSpan={2}>
            {total}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
