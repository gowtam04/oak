/**
 * Doubles / Singles switcher for `/usage` (CF-USAGE-AC-1.2, CF-AS-2).
 * Server-safe plain anchors. Not MetaFormatTabs — that aria-label is
 * "Metagame format" (Smogon OU chrome).
 */

export interface UsageLadderTab {
  id: string;
  shortLabel: string;
  href: string;
  current: boolean;
}

export default function UsageLadderTabs({ tabs }: { tabs: UsageLadderTab[] }) {
  if (tabs.length === 0) return null;

  return (
    <nav
      className="ref-meta-tabs"
      aria-label="Usage ladder"
      data-testid="usage-ladder-tabs"
    >
      {tabs.map((tab) => (
        <a
          key={tab.id}
          href={tab.href}
          className="ref-meta-tabs__tab"
          aria-current={tab.current ? "page" : undefined}
          data-testid={`usage-ladder-tab-${tab.id}`}
        >
          {tab.shortLabel}
        </a>
      ))}
    </nav>
  );
}
