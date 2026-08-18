/**
 * nav-items — the single source of truth for the app rail's destinations
 * (`AppNav`, rendered on `/` and `/teams`; nav refactor Part 1 WP1).
 *
 * Modeled on `ADMIN_NAV_TABS`/`isTabActive`
 * (`src/components/admin/AdminNav.tsx`): a plain data array plus a pure
 * active-match predicate, so adding a future rail destination (e.g. the
 * backlog's `/calc` damage calculator) is a one-line addition here rather
 * than a change to `AppNav` itself.
 *
 * Two lists: `PRIMARY_NAV_ITEMS` are the app's own pages (top of the rail,
 * alongside "New chat"); `REFERENCE_NAV_ITEMS` are the SEO reference pages
 * (`/pokedex`, `/moves`, `/abilities`, `/items` — same four as
 * `ReferenceHeader`'s `NAV_ITEMS`), surfaced as a quiet footer group so the
 * app and the reference island finally link to each other.
 *
 * CLIENT-SAFE: plain data + a pure function, no db/repos/runtime/next imports.
 */

/** One rail destination: its visible label and the path it links to. */
export interface AppNavItem {
  label: string;
  href: string;
}

/** The app's own pages, rendered at the top of the rail. */
export const PRIMARY_NAV_ITEMS: readonly AppNavItem[] = [
  { label: "Teams", href: "/teams" },
  { label: "Calculator", href: "/calc" },
];

/** The programmatic reference pages, rendered as a quiet footer group. */
export const REFERENCE_NAV_ITEMS: readonly AppNavItem[] = [
  { label: "Pokédex", href: "/pokedex" },
  { label: "Moves", href: "/moves" },
  { label: "Abilities", href: "/abilities" },
  { label: "Items", href: "/items" },
];

/**
 * True when `href` is the active destination for the current `pathname`.
 *
 * `"/"` matches ONLY an exact `/` — it must not light up for every other
 * route, since `/` is technically a prefix of nothing here but is the one
 * path every other href could be confused with as a "home" default. Every
 * other href matches its own path or any descendant (e.g. a future
 * `/teams/[id]` drill-down keeps the Teams item active).
 */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
