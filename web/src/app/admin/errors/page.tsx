"use client";

/**
 * /admin/errors — the Errors & Failures screen (ADMIN-US-4, ADMIN-AC-4.1/4.2;
 * ADMIN-BR-9 failure taxonomy; ADMIN-BR-8 date-range scoping).
 *
 * A deliberately THIN client shell: it reads the global window from the shell's
 * {@link useAdminRange} (the canonical {@link Range} the `DateRangePicker`
 * mutates), fetches `GET /api/admin/errors` for that window, and hands the
 * resolved payload to {@link ErrorsView}, which owns every bit of testable
 * render logic. All rendering lives in `src/components/admin/ErrorsView.tsx`
 * because the jsdom component project does not scan `src/app/**` (CLAUDE.md
 * test-placement rule); this page is intentionally untested glue.
 *
 * Re-fetches whenever the global range changes (ADMIN-BR-8). Read-only: the only
 * request is a GET (ADMIN-BR-2). The admin gate already ran server-side in
 * `admin/layout.tsx` (AD-5) and the route re-checks server-side (AD-1/ADMIN-AC-1.4),
 * so this client code performs no authorization of its own.
 */

import { useEffect, useState } from "react";

import { useAdminRange } from "@/components/admin/AdminShell";
import ErrorsView from "@/components/admin/ErrorsView";
import type { ErrorsResponse } from "@/lib/admin/admin-types";

export default function AdminErrorsPage() {
  const { range } = useAdminRange();
  const [data, setData] = useState<ErrorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      from: String(range.from),
      to: String(range.to),
      bucket: range.bucket,
    });

    fetch(`/api/admin/errors?${params.toString()}`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load errors (${res.status})`);
        return (await res.json()) as ErrorsResponse;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load errors");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, range.bucket]);

  return <ErrorsView data={data} loading={loading} error={error} />;
}
