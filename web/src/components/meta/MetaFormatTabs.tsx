/**
 * MetaFormatTabs — the format-switcher row atop `/meta/[format]` (Gen 9 OU
 * today; the B-5 meta-format axis is config-driven, so more ladders show up
 * here as more entries without a component change). Server-safe: no hooks,
 * no "use client" — mirrors `ReferenceHeader`'s plain-`<a>` section nav since
 * this is crawlable static-ish content, not client interaction. v1 renders a
 * single tab; the row layout still holds so a second format is a data change.
 */

export interface MetaFormatTab {
  id: string;
  shortLabel: string;
  href: string;
  current: boolean;
}

export interface MetaFormatTabsProps {
  tabs: MetaFormatTab[];
}

export default function MetaFormatTabs({ tabs }: MetaFormatTabsProps) {
  if (tabs.length === 0) return null;

  return (
    <nav
      className="ref-meta-tabs"
      aria-label="Metagame format"
      data-testid="meta-format-tabs"
    >
      {tabs.map((tab) => (
        <a
          key={tab.id}
          href={tab.href}
          className="ref-meta-tabs__tab"
          aria-current={tab.current ? "page" : undefined}
          data-testid={`meta-format-tab-${tab.id}`}
        >
          {tab.shortLabel}
        </a>
      ))}
    </nav>
  );
}
