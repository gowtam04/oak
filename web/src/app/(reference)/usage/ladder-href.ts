import type { UsageLadder } from "@/server/champions-usage/ladder";

/** Doubles is the default URL (no query); Singles is `?ladder=singles`. */
export function usageHref(slug: string | undefined, ladder: UsageLadder): string {
  const base = slug ? `/usage/${encodeURIComponent(slug)}` : "/usage";
  return ladder === "singles" ? `${base}?ladder=singles` : base;
}

export function ladderTabs(active: UsageLadder, slug?: string) {
  return [
    {
      id: "doubles",
      shortLabel: "Doubles",
      href: usageHref(slug, "doubles"),
      current: active === "doubles",
    },
    {
      id: "singles",
      shortLabel: "Singles",
      href: usageHref(slug, "singles"),
      current: active === "singles",
    },
  ];
}

export function formatFetchedAt(ms: number): string {
  try {
    return new Date(ms).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
  } catch {
    return String(ms);
  }
}
