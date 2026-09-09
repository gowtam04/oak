/**
 * Live Champions usage leaderboard table. Rank + name always; usage % only
 * when the source published one (no invented 0, no fake Change column).
 */

import SpriteImg from "@/components/SpriteImg";
import { guessOakMediaSpriteUrl } from "@/lib/sprites";

export interface UsageLeaderboardTableRow {
  rank: number;
  name: string;
  href: string | null;
  usagePct?: number;
  species: string;
  spriteUrl: string | null;
}

/** `--fill` custom property, mirroring StatsTable / MetaLeaderboardTable. */
type CssVars = React.CSSProperties & Record<`--${string}`, string>;

export default function UsageLeaderboardTable({
  rows,
}: {
  rows: UsageLeaderboardTableRow[];
}) {
  if (rows.length === 0) return null;

  const hasUsage = rows.some((r) => typeof r.usagePct === "number");
  const maxUsage = Math.max(
    ...rows.map((r) => (typeof r.usagePct === "number" ? r.usagePct : 0)),
    0.0001,
  );

  return (
    <table className="ref-meta-table" data-testid="usage-leaderboard-table">
      <thead>
        <tr>
          <th scope="col" className="ilabel">
            Rank
          </th>
          <th scope="col" className="ilabel">
            Pokémon
          </th>
          {hasUsage && (
            <th scope="col" className="ilabel">
              Usage
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const known = typeof row.usagePct === "number";
          const pct = known
            ? Math.min(100, Math.max(0, (row.usagePct! / maxUsage) * 100))
            : 0;
          const fillStyle: CssVars = { "--fill": `${pct}%` };
          return (
            <tr
              key={row.rank}
              className="ref-meta-table__row"
              data-testid={`usage-leaderboard-row-${row.rank}`}
            >
              <td className="ref-meta-table__rank mono-num">{row.rank}</td>
              <td className="ref-meta-table__name">
                <span className="ref-meta-table__name-inner">
                  {row.spriteUrl ? (
                    <SpriteImg
                      src={row.spriteUrl}
                      fallbackSrc={guessOakMediaSpriteUrl(row.species)}
                      alt={row.name}
                      width={32}
                      height={32}
                      className="ref-meta-table__sprite"
                    />
                  ) : (
                    <span
                      className="ref-meta-table__sprite-placeholder"
                      aria-hidden="true"
                    />
                  )}
                  {row.href ? (
                    <a href={row.href}>{row.name}</a>
                  ) : (
                    <span>{row.name}</span>
                  )}
                </span>
              </td>
              {hasUsage && (
                <td className="ref-meta-table__usage-cell">
                  {known ? (
                    <>
                      <span className="ref-meta-table__bar-track">
                        <span
                          className="ref-meta-table__bar"
                          data-testid={`usage-leaderboard-bar-${row.rank}`}
                          // eslint-disable-next-line react/forbid-dom-props -- runtime-computed fill width
                          style={fillStyle}
                        />
                      </span>
                      <span className="ref-meta-table__usage-label mono-num">
                        {row.usagePct!.toFixed(1)}%
                      </span>
                    </>
                  ) : (
                    <span className="ref-meta-table__usage-label mono-num">
                      —
                    </span>
                  )}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
