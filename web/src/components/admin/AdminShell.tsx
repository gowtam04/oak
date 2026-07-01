"use client";

/**
 * AdminShell — the client-side chrome the server `admin/layout.tsx` wraps every
 * admin page in (Component Design §5: "layout … renders the nav shell … + a
 * global date-range picker"). It owns two things the screens share:
 *
 *   1. The NAV SHELL — the brand header + {@link AdminNav} tabs, with the active
 *      tab derived from `usePathname()` (resolved here, passed down as a prop so
 *      AdminNav itself stays router-free and fixture-renderable).
 *   2. The GLOBAL DATE-RANGE PROVIDER — the canonical {@link Range} state
 *      (seeded from {@link defaultRange}, the last-7-days/`day` default,
 *      ADMIN-BR-8) plus its setter, exposed to every screen through
 *      {@link useAdminRange}. The shared {@link DateRangePicker} is the single
 *      control that mutates it; analytics pages (Phase 7/8) read `range` and key
 *      their `/api/admin/*` fetches off it, so the whole panel scopes to one
 *      window (ADMIN-BR-8).
 *
 * The layout gate (`admin-gate.ts`) has already run server-side by the time this
 * mounts, so this component is concerned only with chrome + shared state, never
 * authorization.
 *
 * Refs:
 *   - docs/features/admin-panel/architecture/design.md
 *       § Component Design › 5, § Implementation Phases Phase 6, AD-1, AD-5,
 *       § API Design (`Range` / `from`,`to`,`bucket` common params; ADMIN-BR-8).
 *   - requirements.md ADMIN-US-1, ADMIN-BR-8.
 *
 * CLIENT-SAFE: imports only client-safe wire types + sibling client primitives;
 * never touches db/repos/runtime (jsdom component-test rule).
 */

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import type { Range } from "@/lib/admin/admin-types";

import AdminNav from "./AdminNav";
import DateRangePicker, { defaultRange } from "./DateRangePicker";

/** The shape shared through context: the current window and its setter. */
export interface AdminRangeContextValue {
  range: Range;
  setRange: (next: Range) => void;
}

/**
 * Null sentinel default lets {@link useAdminRange} detect a consumer used
 * outside the provider and fail loudly (a programming error), rather than
 * silently handing back a stale/zeroed window.
 */
const AdminRangeContext = createContext<AdminRangeContextValue | null>(null);

/**
 * Read the global admin date-range. MUST be called from within an
 * {@link AdminShell} (the provider); throws otherwise so a misplaced screen is
 * caught immediately instead of rendering against a phantom window.
 */
export function useAdminRange(): AdminRangeContextValue {
  const ctx = useContext(AdminRangeContext);
  if (ctx === null) {
    throw new Error("useAdminRange must be used within <AdminShell>");
  }
  return ctx;
}

export interface AdminShellProps {
  children: ReactNode;
  /**
   * Optional seed window — overrides {@link defaultRange} for the initial
   * state. Used by tests for determinism; production omits it.
   */
  initialRange?: Range;
}

export default function AdminShell({ children, initialRange }: AdminShellProps) {
  const pathname = usePathname() ?? "/admin";
  const [range, setRange] = useState<Range>(() => initialRange ?? defaultRange());

  const ctxValue = useMemo<AdminRangeContextValue>(
    () => ({ range, setRange }),
    [range],
  );

  return (
    <AdminRangeContext.Provider value={ctxValue}>
      <div className="admin-shell" data-testid="admin-shell">
        <header className="admin-shell__header" data-testid="admin-header">
          <div className="admin-shell__bar">
            <span className="admin-shell__brand" data-testid="admin-brand">
              <span className="admin-shell__logo" aria-hidden="true" />
              Oak Admin
            </span>
            <AdminNav pathname={pathname} />
          </div>
          <div className="admin-shell__controls">
            <DateRangePicker value={range} onChange={setRange} />
          </div>
        </header>
        <main className="admin-shell__main" data-testid="admin-main">
          {children}
        </main>
      </div>
    </AdminRangeContext.Provider>
  );
}
