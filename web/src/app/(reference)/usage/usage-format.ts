/**
 * Usage snapshot chrome helpers — local fetched time + split attribution.
 * Pure; no server imports so unit tests stay cheap.
 */

export function formatUsageFetchedAtLocal(
  ms: number,
  timeZone?: string,
  locale?: string,
): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(new Date(ms));
  } catch {
    return String(ms);
  }
}

export interface UsageAttributionParts {
  source: string;
  legal: string | null;
}

/** `"championsbattledata.com — a community-maintained …"` → name + remainder. */
export function parseUsageAttribution(raw: string): UsageAttributionParts {
  const trimmed = raw.trim();
  if (!trimmed) return { source: trimmed, legal: null };
  for (const sep of [" — ", " – ", " - "] as const) {
    const idx = trimmed.indexOf(sep);
    if (idx <= 0) continue;
    const source = trimmed.slice(0, idx).trim();
    const legal = trimmed.slice(idx + sep.length).trim();
    if (source) return { source, legal: legal || null };
  }
  return { source: trimmed, legal: null };
}
