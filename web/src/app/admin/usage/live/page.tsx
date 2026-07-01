/**
 * /admin/usage/live — the Live activity screen (ADMIN-US-7, ADMIN-AC-7.1,
 * ADMIN-BR-10). It lives under the `usage` segment so the "Usage" nav tab stays
 * active here (AdminNav's `isTabActive` matches `/admin/usage` descendants), and
 * the route at `/admin/usage/live` never collides with the `/admin/usage/[id]`
 * turn drill-down (turn ids are UUIDs; Next resolves the static `live` segment
 * before the dynamic `[id]`).
 *
 * Deliberately THIN: all behaviour — the ~10s poll of `GET /api/admin/live`, the
 * KPI/feed render, and the loading/error states — lives in the client
 * {@link LivePanel} component (which is what the jsdom component project can
 * test; `src/app/**` is not scanned). This page is a one-line integrator.
 *
 * No route-segment config (`dynamic`/`runtime`) is declared here — the parent
 * `admin/layout.tsx` already pins the segment to `dynamic = "force-dynamic"` +
 * `runtime = "nodejs"`, and the server-side admin gate runs in that layout
 * before this renders (AD-5). The same-origin httpOnly session cookie authorizes
 * the poll automatically (the API guard is the real boundary, ADMIN-AC-1.4).
 */

import LivePanel from "@/components/admin/LivePanel";

export default function AdminLivePage() {
  return <LivePanel />;
}
