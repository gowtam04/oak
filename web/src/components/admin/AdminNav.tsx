/**
 * AdminNav — the admin panel's primary navigation, one tab per top-level
 * `/admin` surface (Component Design §5: "tabs: Overview, Usage, Cost, Errors,
 * Accounts, Conversations, Teams"; ADMIN-US-1).
 *
 * A pure, presentational primitive: it takes the current pathname as a prop and
 * renders plain `<a>` anchors (NOT `next/link`) so it has ZERO dependency on the
 * App Router context — that keeps it trivially fixture-renderable under the jsdom
 * component project (which has no router/db/repos; CLAUDE.md component-test rule).
 * The owning {@link AdminShell} resolves the pathname (via `usePathname`) and
 * threads it down here, so the active-tab decision stays a pure function of
 * (tabs × pathname) — see {@link isTabActive}.
 *
 * Refs:
 *   - docs/features/admin-panel/architecture/design.md
 *       § Component Design › 5 (nav shell tabs), § Implementation Phases Phase 6
 *       (nav render), AD-1 (in-app /admin route group), AD-5 (gated shell).
 *   - requirements.md ADMIN-US-1.
 *
 * CLIENT-SAFE: structural props only; no db/repos/runtime/router imports.
 */

/** One navigation tab: its visible label and the `/admin` path it links to. */
export interface AdminNavTab {
  label: string;
  href: string;
}

/**
 * The seven top-level admin tabs, in the order fixed by the design
 * (Overview, Usage, Cost, Errors, Accounts, Conversations, Teams). Overview is
 * the index route (`/admin`); every other tab is a child segment.
 */
export const ADMIN_NAV_TABS: readonly AdminNavTab[] = [
  { label: "Overview", href: "/admin" },
  { label: "Usage", href: "/admin/usage" },
  { label: "Cost", href: "/admin/cost" },
  { label: "Errors", href: "/admin/errors" },
  { label: "Accounts", href: "/admin/accounts" },
  { label: "Conversations", href: "/admin/conversations" },
  { label: "Teams", href: "/admin/teams" },
];

/**
 * True when `href` is the active tab for the current `pathname`.
 *
 * Overview (`/admin`) matches ONLY an exact `/admin` — it must not light up for
 * every child route, since "/admin" is a prefix of all of them. Every other tab
 * matches its own path or any descendant (e.g. the Usage tab stays active on the
 * `/admin/usage/[id]` drill-down).
 */
export function isTabActive(href: string, pathname: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface AdminNavProps {
  /** The current route path, used to highlight the active tab. */
  pathname: string;
}

export default function AdminNav({ pathname }: AdminNavProps) {
  return (
    <nav className="admin-nav" data-testid="admin-nav" aria-label="Admin sections">
      {ADMIN_NAV_TABS.map((tab) => {
        const active = isTabActive(tab.href, pathname);
        return (
          <a
            key={tab.href}
            href={tab.href}
            className={`admin-nav__tab${active ? " admin-nav__tab--active" : ""}`}
            data-testid={`admin-nav-tab-${tab.label.toLowerCase()}`}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </a>
        );
      })}
    </nav>
  );
}
