/**
 * ReferenceHeader — the sticky enamel lid shared by every programmatic
 * reference page (/pokedex, /moves, /abilities, /items, /meta). Applies the
 * chat lid recipe (`.chat-page__header`): opaque coral gradient through the
 * safe area, Fredoka white wordmark + 32px mark, inset white-on-red pills,
 * and an "Open chat" inset lid pill. Destinations unchanged.
 *
 * Server-safe: no hooks, no "use client". The active-section highlight needs
 * the current route, so the nav is delegated to {@link ReferenceNav}, a small
 * client island that reads `usePathname`; the header stays server-rendered.
 * The wordmark + "Open chat" links use `next/link` because
 * `@next/next/no-html-link-for-pages` flags a bare `<a href="/">` now that the
 * root page exists.
 */

import Link from "next/link";

import OakWordmark from "@/components/brand/OakWordmark";
import ReferenceNav from "@/components/reference/ReferenceNav";

export default function ReferenceHeader() {
  return (
    <header className="ref-header" data-testid="reference-header">
      <div className="ref-header__inner">
        <Link href="/" className="ref-header__wordmark" aria-label="Oak — home">
          <OakWordmark />
        </Link>
        <ReferenceNav />
        <Link href="/" className="ref-header__chat-link">
          Open chat
        </Link>
      </div>
    </header>
  );
}
