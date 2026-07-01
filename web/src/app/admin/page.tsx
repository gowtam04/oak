"use client";

/**
 * /admin (Overview) — the admin panel's landing screen (Phase 7; ADMIN-US-2/3/4
 * headline). Deliberately THIN: it owns only the data fetch — resolving the
 * global date-range from the {@link useAdminRange} context (seeded by
 * {@link AdminShell}; ADMIN-BR-8) and calling `GET /api/admin/overview` — and
 * hands the result, loading, and error states to {@link OverviewView}, which
 * holds all the render logic so it can be fixture-tested under the jsdom project
 * (CLAUDE.md component rule: `src/app/**` is not scanned for tests).
 *
 * Route gating is handled upstream by the server `admin/layout.tsx`
 * (`requireAdminRequest` is the real boundary on the API side; AD-5); this page
 * assumes it only renders for an authenticated admin. The same-origin httpOnly
 * session cookie authorizes the fetch automatically.
 *
 * No route-segment config (`dynamic`/`runtime`) is declared here — this is a
 * "use client" page, and the parent layout already pins the segment to
 * `dynamic = "force-dynamic"` + `runtime = "nodejs"`.
 */

import { useCallback, useEffect, useState } from "react";

import { useAdminRange } from "@/components/admin/AdminShell";
import OverviewView from "@/components/admin/OverviewView";
import type { OverviewResponse } from "@/lib/admin/admin-types";

export default function AdminOverviewPage() {
  const { range } = useAdminRange();

  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    const params = new URLSearchParams({
      from: String(range.from),
      to: String(range.to),
      bucket: range.bucket,
    });

    fetch(`/api/admin/overview?${params.toString()}`, {
      method: "GET",
      credentials: "same-origin",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`overview ${res.status}`);
        return (await res.json()) as OverviewResponse;
      })
      .then((body) => {
        if (!active) return;
        setData(body);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [range.from, range.to, range.bucket, reloadKey]);

  const handleRetry = useCallback(() => setReloadKey((k) => k + 1), []);

  return (
    <OverviewView
      data={data}
      loading={loading}
      error={error}
      onRetry={handleRetry}
    />
  );
}
