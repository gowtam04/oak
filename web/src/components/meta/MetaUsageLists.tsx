/**
 * MetaUsageLists — titled percentage-list sections for a `/meta/[format]/[slug]`
 * drill-in (top moves / items / abilities / teammates / spreads). Visually
 * modeled on `UsageBlock`'s per-category list, but shape-agnostic: callers
 * preformat each entry's `valueLabel` ("87.3%", "score 3.42") so this
 * component never assumes a percentage — B-5's counters section reports a
 * score, not a usage share.
 */

export interface MetaUsageEntry {
  name: string;
  href: string | null;
  valueLabel: string;
}

export interface MetaUsageSection {
  title: string;
  entries: MetaUsageEntry[];
}

export interface MetaUsageListsProps {
  sections: MetaUsageSection[];
}

function Section({ title, entries }: MetaUsageSection) {
  if (entries.length === 0) return null;
  return (
    <div className="ref-meta-lists__section">
      <h4 className="ref-meta-lists__title ilabel">{title}</h4>
      <ul className="ref-meta-lists__list">
        {entries.map((entry) => (
          <li key={entry.name} className="ref-meta-lists__item">
            {entry.href ? (
              <a className="ref-meta-lists__name" href={entry.href}>
                {entry.name}
              </a>
            ) : (
              <span className="ref-meta-lists__name">{entry.name}</span>
            )}
            <span className="ref-meta-lists__value mono-num">
              {entry.valueLabel}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function MetaUsageLists({ sections }: MetaUsageListsProps) {
  const nonEmpty = sections.filter((s) => s.entries.length > 0);
  if (nonEmpty.length === 0) return null;

  return (
    <div className="ref-meta-lists" data-testid="meta-usage-lists">
      {nonEmpty.map((section) => (
        <Section
          key={section.title}
          title={section.title}
          entries={section.entries}
        />
      ))}
    </div>
  );
}
