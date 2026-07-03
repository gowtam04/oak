/**
 * ReferenceHeader — the red band shared by every programmatic reference page
 * (/pokedex, /moves, /abilities, /items). Mirrors the visual weight of the
 * /teams page's header band (`teams-page__band`), but with its own `ref-*`
 * classes since this chrome mounts in the `(reference)` route group's layout,
 * not the teams page. Server-safe: no hooks, no "use client". Section nav
 * links are plain `<a>` (crawlable static-ish content); the two links back to
 * `/` use `next/link` because `@next/next/no-html-link-for-pages` flags a
 * bare `<a href="/">` now that the root page already exists.
 */

import Link from "next/link";

export interface ReferenceHeaderProps {
  /** The section this page belongs to, for `aria-current="page"` on its nav link. */
  current?: "pokedex" | "moves" | "abilities" | "items";
}

const NAV_ITEMS = [
  { key: "pokedex", href: "/pokedex", label: "Pokédex" },
  { key: "moves", href: "/moves", label: "Moves" },
  { key: "abilities", href: "/abilities", label: "Abilities" },
  { key: "items", href: "/items", label: "Items" },
] as const;

export default function ReferenceHeader({ current }: ReferenceHeaderProps) {
  return (
    <header className="ref-header" data-testid="reference-header">
      <div className="ref-header__inner">
        <Link href="/" className="ref-header__wordmark" aria-label="Oak — home">
          Oak
        </Link>
        <nav className="ref-header__nav" aria-label="Reference sections">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.key}
              href={item.href}
              className="ref-header__link"
              aria-current={current === item.key ? "page" : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <Link href="/" className="ref-header__chat-link">
          Open chat
        </Link>
      </div>
    </header>
  );
}
