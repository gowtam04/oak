/**
 * /admin layout — the server-component gate + chrome for the read-only admin
 * panel (Component Design §5; AD-1 in-app route group; AD-5 two-layer gating).
 *
 * Two responsibilities, kept deliberately thin:
 *   1. GATE (server-side, AD-5): `resolveAdminGate()` resolves the request's
 *      account. A non-admin (guest or non-allowlisted) is shown a standalone
 *      {@link AdminLogin} box IN PLACE of the panel — never the panel HTML and
 *      never the chat home (ADMIN-AC-1.2). This is defense in depth on top of
 *      the per-route `requireAdminRequest` guard, the actual data boundary
 *      (ADMIN-AC-1.4). Only an allowlisted admin ever sees `children`.
 *   2. CHROME: render the client {@link AdminShell} (nav tabs + the global
 *      date-range provider) around the active page — admins only.
 *
 * All testable logic is extracted into `src/components/admin/*` (the gate
 * helper, the login box, the nav, the shell) because the jsdom component project
 * does not scan `src/app/**`; this file stays a thin integrator.
 *
 * `dynamic = "force-dynamic"` + `runtime = "nodejs"`: the gate reads the
 * request-scoped session (cookie/Bearer) and must run per-request on Node, never
 * be statically prerendered.
 */

import type { ReactNode } from "react";

import AdminLogin from "@/components/admin/AdminLogin";
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
  const gate = await resolveAdminGate();

  // Non-admins (guests + non-allowlisted signed-in users) get ONLY the login
  // box — no admin chrome, no page content, no chat home.
  if (gate.status !== "admin") {
    return (
      <AdminLogin
        forbiddenEmail={gate.status === "forbidden" ? gate.email : null}
      />
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
