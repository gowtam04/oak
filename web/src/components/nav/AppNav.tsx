"use client";

/**
 * AppNav — the app rail: Oak's one navigation surface, shared by the chat
 * page (`/`) and the teams page (`/teams`) (nav refactor Part 1 WP1).
 *
 * A pure, presentational primitive: it takes the current pathname as a prop
 * and renders plain `<a>` anchors for its own links (NOT `next/link`), the
 * same fixture-renderable, router-free contract `AdminNav` uses — so it has
 * zero dependency on App Router context. The one exception is the "New
 * chat" control's Link variant (see below), which needs `next/link`
 * specifically to dodge `@next/next/no-html-link-for-pages` on a bare
 * `<a href="/">` (precedent: `ReferenceHeader.tsx`).
 *
 * Three stacked regions, each its own landmark:
 *   - `<nav aria-label="Primary">` — "New chat" first, then `PRIMARY_NAV_ITEMS`
 *     (Teams, Calculator). "New chat" is a solid enamel poke-red / on-red
 *     40px radius-md control (`.app-nav__newchat`). It renders as a
 *     `<button>` when the caller passes `onNewChat` (the chat page already
 *     has a fresh-thread handler); otherwise it renders as a `next/link` to
 *     `/` (the teams page, where "starting a new chat" just means navigating
 *     home). Active rows use poke-red-soft + poke-red ink.
 *   - `.app-nav__slot` — an optional middle region for page-specific content
 *     (the chat page's `ConversationList` or guest sign-in hint). Omitted
 *     entirely when no `children` are given (e.g. on `/teams`), so no empty
 *     slot pushes the reference footer around.
 *   - `<nav aria-label="Reference">` — pinned to the bottom (`margin-top:
 *     auto` in CSS), the same four reference pages `ReferenceHeader` links,
 *     now reachable from inside the app itself, plus a Privacy link.
 *
 * `data-testid="new-chat"` lives here now (migrated off `ConversationList`,
 * which used to render its own copy) — there is exactly one New-chat
 * affordance on screen at a time.
 *
 * CLIENT-SAFE: structural props + `next/link` only; no db/repos/runtime
 * imports.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { PRIMARY_NAV_ITEMS, REFERENCE_NAV_ITEMS, isNavActive } from "./nav-items";

export interface AppNavProps {
  /** The current route path, used to highlight the active destination. */
  pathname: string;
  /** When given, "New chat" is a button that fires this instead of linking home. */
  onNewChat?: () => void;
  /** Page-specific content for the middle slot (history list, sign-in hint). */
  children?: ReactNode;
}

export default function AppNav({ pathname, onNewChat, children }: AppNavProps) {
  return (
    <div className="app-nav" data-testid="app-nav">
      <nav className="app-nav__primary" aria-label="Primary">
        {onNewChat ? (
          <button
            type="button"
            className="app-nav__newchat"
            data-testid="new-chat"
            onClick={onNewChat}
          >
            + New chat
          </button>
        ) : (
          <Link href="/" className="app-nav__newchat" data-testid="new-chat">
            + New chat
          </Link>
        )}
        {PRIMARY_NAV_ITEMS.map((item) => {
          const active = isNavActive(item.href, pathname);
          return (
            <a
              key={item.href}
              href={item.href}
              className={`app-nav__link${active ? " app-nav__link--active" : ""}`}
              data-testid={`app-nav-${item.label.toLowerCase()}`}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </a>
          );
        })}
      </nav>

      {children != null && <div className="app-nav__slot">{children}</div>}

      <nav className="app-nav__reference" aria-label="Reference">
        <div className="ilabel app-nav__ref-heading">Reference</div>
        {REFERENCE_NAV_ITEMS.map((item) => {
          const active = isNavActive(item.href, pathname);
          return (
            <a
              key={item.href}
              href={item.href}
              className="app-nav__ref-link"
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </a>
          );
        })}
        <a href="/privacy" className="app-nav__privacy">
          Privacy
        </a>
      </nav>
    </div>
  );
}
