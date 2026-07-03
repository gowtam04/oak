/**
 * UsageBlock — a compact live-Champions-usage summary for a `/pokedex/[slug]`
 * page: overall usage %, then top moves/items/teammates as percentage lists,
 * closing with the required attribution line. Best-effort data (the
 * assembler omits this block entirely on a fetch failure), so every field
 * here is rendered defensively (empty lists collapse, not blank sections).
 */

export interface UsageListEntry {
  name: string;
  pct: number;
}

export interface UsageBlockData {
  season?: string | null;
  usagePercent?: number | null;
  topMoves: UsageListEntry[];
  topItems: UsageListEntry[];
  topTeammates: UsageListEntry[];
  attribution: string;
}

export interface UsageBlockProps {
  usage: UsageBlockData;
}

function UsageList({
  title,
  entries,
}: {
  title: string;
  entries: UsageListEntry[];
}) {
  if (entries.length === 0) return null;
  return (
    <div className="ref-usage__group">
      <h4 className="ref-usage__group-title ilabel">{title}</h4>
      <ul className="ref-usage__list">
        {entries.map((e) => (
          <li key={e.name} className="ref-usage__item">
            <span className="ref-usage__name">{e.name}</span>
            <span className="ref-usage__pct mono-num">{e.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function UsageBlock({ usage }: UsageBlockProps) {
  return (
    <div className="ref-usage" data-testid="usage-block">
      {usage.season && <p className="ref-usage__season">{usage.season}</p>}
      {typeof usage.usagePercent === "number" && (
        <p className="ref-usage__percent mono-num">
          {usage.usagePercent}% usage
        </p>
      )}
      <UsageList title="Top moves" entries={usage.topMoves} />
      <UsageList title="Top items" entries={usage.topItems} />
      <UsageList title="Top teammates" entries={usage.topTeammates} />
      <p className="ref-usage__attribution">{usage.attribution}</p>
    </div>
  );
}
