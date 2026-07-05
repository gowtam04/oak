/**
 * ReferenceNav — the reference header's section nav (Pokédex / Moves /
 * Abilities / Items / Meta). A small client island split out of the otherwise
 * server-rendered {@link ReferenceHeader} for the sole purpose of reading the
 * current route (`usePathname`) and marking the matching link with
 * `aria-current="page"` — the header itself stays server-safe.
 *
 * The active link is matched by PATH PREFIX (`isSectionActive`), so a detail
 * route like `/pokedex/garchomp` keeps the Pokédex tab lit. Links stay plain
 * `<a>` (not `next/link`) — this is crawlable reference content and the anchors
 * must be present in the initial HTML.
 */

"use client";

import { usePathname } from "next/navigation";

/** The five reference sections, in nav order (Meta last, per the design). */
export const NAV_ITEMS = [
  { key: "pokedex", href: "/pokedex", label: "Pokédex" },
  { key: "moves", href: "/moves", label: "Moves" },
  { key: "abilities", href: "/abilities", label: "Abilities" },
  { key: "items", href: "/items", label: "Items" },
  { key: "meta", href: "/meta", label: "Meta" },
] as const;

/**
 * True when `href` is the active section for the current `pathname`: an exact
 * match or any descendant (so `/pokedex/garchomp` lights the `/pokedex` tab).
 */
export function isSectionActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function ReferenceNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="ref-header__nav" aria-label="Reference sections">
      {NAV_ITEMS.map((item) => {
        const active = isSectionActive(item.href, pathname);
        return (
          <a
            key={item.key}
            href={item.href}
            className="ref-header__link"
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
