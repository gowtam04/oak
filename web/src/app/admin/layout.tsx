/**
 * /admin layout — the server-component gate + chrome for the read-only admin
 * panel (Component Design §5; AD-1 in-app route group; AD-5 two-layer gating).
 *
 * Two responsibilities, kept deliberately thin:
 *   1. GATE (server-side, AD-5): `resolveAdminGate()` resolves the request's
 *      account and `redirect("/")`s any non-admin BEFORE rendering, so a
 *      non-admin never receives admin HTML (ADMIN-AC-1.2). This is defense in
 *      depth on top of the per-route `requireAdminRequest` guard, which is the
 *      actual data boundary (ADMIN-AC-1.4).
 *   2. CHROME: render the client {@link AdminShell} (nav tabs + the global
 *      date-range provider) around the active page.
 *
 * All testable logic is extracted into `src/components/admin/*` (the gate
 * helper, the nav, the shell) because the jsdom component project does not scan
 * `src/app/**`; this file stays a thin integrator.
 *
 * `dynamic = "force-dynamic"` + `runtime = "nodejs"`: the gate reads the
 * request-scoped session (cookie/Bearer) and must run per-request on Node, never
 * be statically prerendered.
 */

import type { ReactNode } from "react";

import AdminShell from "@/components/admin/AdminShell";
import { resolveAdminGate } from "@/components/admin/admin-gate";

import "./admin.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Redirects non-admins (and guests) away before any admin page renders.
  await resolveAdminGate();

  return <AdminShell>{children}</AdminShell>;
}
