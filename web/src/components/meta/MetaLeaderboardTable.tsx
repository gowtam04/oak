/**
 * MetaLeaderboardTable — the `/meta/[format]` ranked usage table: rank, a
 * sprite (server-joined `spriteUrl`, animated-Showdown-guess fallback, a
 * neutral placeholder when neither resolves — B-5 species don't all have art
 * in the `scarlet-violet` index), name (linked to its Pokédex entry when a
 * slug resolved, plain text otherwise), a proportional usage bar (width % of
 * the highest `usagePct` in THIS table, unlike `StatsTable`'s fixed 255
 * ceiling — a leaderboard's scale is relative to its own top row, not an
 * absolute max), and a month-over-month delta cell.
 */

import SpriteImg from "@/components/SpriteImg";
import { guessOakMediaSpriteUrl } from "@/lib/sprites";

export interface MetaLeaderboardRow {
  rank: number;
  name: string;
  href: string | null;
  usagePct: number;
  deltaPct: number | null;
  /** The species slug — used only to compute the Showdown-guess sprite fallback. */
  species: string;
  /** The `scarlet-violet` `pokemon` row's sprite, or null when none resolves. */
  spriteUrl: string | null;
}

export interface MetaLeaderboardTableProps {
  rows: MetaLeaderboardRow[];
}

/** `--fill` custom property, mirroring `StatsTable`'s bound-width pattern. */
type CssVars = React.CSSProperties & Record<`--${string}`, string>;

function DeltaCell({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null || deltaPct === 0) {
    return <span className="ref-meta-table__delta">—</span>;
  }
  const up = deltaPct > 0;
  const sign = up ? "+" : "−";
  const magnitude = Math.abs(deltaPct).toFixed(1);
  return (
    <span
      className={
        "ref-meta-table__delta " +
        (up
          ? "ref-meta-table__delta--up"
          : "ref-meta-table__delta--down")
      }
    >
      {up ? "▲" : "▼"} {sign}
      {magnitude}
    </span>
  );
}

export default function MetaLeaderboardTable({
  rows,
}: MetaLeaderboardTableProps) {
  if (rows.length === 0) return null;

  const maxUsage = Math.max(...rows.map((r) => r.usagePct), 0.0001);

  return (
    <table className="ref-meta-table" data-testid="meta-leaderboard-table">
      <thead>
        <tr>
          <th scope="col" className="ilabel">
            Rank
          </th>
          <th scope="col" className="ilabel">
            Pokémon
          </th>
          <th scope="col" className="ilabel">
            Usage
          </th>
          <th scope="col" className="ilabel">
            Change
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const pct = Math.min(
            100,
            Math.max(0, (row.usagePct / maxUsage) * 100),
          );
          const fillStyle: CssVars = { "--fill": `${pct}%` };
          return (
            <tr
              key={row.rank}
              className="ref-meta-table__row"
              data-testid={`meta-leaderboard-row-${row.rank}`}
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
              <td className="ref-meta-table__usage-cell">
                <span className="ref-meta-table__bar-track">
                  <span
                    className="ref-meta-table__bar"
                    data-testid={`meta-leaderboard-bar-${row.rank}`}
                    // eslint-disable-next-line react/forbid-dom-props -- runtime-computed fill width, bound via the --fill custom property (same pattern as StatsTable's bar)
                    style={fillStyle}
                  />
                </span>
                <span className="ref-meta-table__usage-label mono-num">
                  {row.usagePct.toFixed(1)}%
                </span>
              </td>
              <td className="ref-meta-table__change-cell">
                <DeltaCell deltaPct={row.deltaPct} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
