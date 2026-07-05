/**
 * ReferenceHeader — the sticky paper chrome shared by every programmatic
 * reference page (/pokedex, /moves, /abilities, /items, /meta). Mirrors the
 * chat page's header design language (`.chat-page__header` / `.chat-page__title`):
 * a warm `--bg` surface with a 2px `--poke-red` "thread" on top and a hairline
 * bottom, the Fredoka wordmark with its brand-mark chip, and an "Open chat" red
 * pill mirroring `.app-nav__newchat`. Red only appears as the thread, the active
 * nav pill, the CTA, and link hover — never as wallpaper (the old red band is
 * retired, per `docs/design/fable-ui-strategy-reference.md` §3).
 *
 * Server-safe: no hooks, no "use client". The active-section highlight needs
 * the current route, so the nav is delegated to {@link ReferenceNav}, a small
 * client island that reads `usePathname`; the header stays server-rendered.
 * The wordmark + "Open chat" links use `next/link` because
 * `@next/next/no-html-link-for-pages` flags a bare `<a href="/">` now that the
 * root page exists.
 */

import Link from "next/link";

import ReferenceNav from "@/components/reference/ReferenceNav";

export default function ReferenceHeader() {
  return (
    <header className="ref-header" data-testid="reference-header">
      <div className="ref-header__inner">
        <Link href="/" className="ref-header__wordmark" aria-label="Oak — home">
          Oak
        </Link>
        <ReferenceNav />
        <Link href="/" className="ref-header__chat-link">
          Open chat
        </Link>
      </div>
    </header>
  );
}
