"use client";

/**
 * `/admin/cost` — the Cost & tokens screen (Phase 7; ADMIN-US-3,
 * ADMIN-AC-3.1/3.2, ADMIN-BR-5/BR-8).
 *
 * Deliberately THIN (the design's "each page is a client component that fetches
 * its `/api/admin/*` endpoint and renders with shared admin primitives"): it
 * reads the global date range from the {@link useAdminRange} context provided by
 * `AdminShell`, fetches `GET /api/admin/cost` scoped to that window, and hands
 * the {@link CostResponse} to {@link CostView} for rendering. ALL render logic
 * (KPIs, the cost-trend chart, the by-model table, the estimate caveat) lives in
 * the fixture-tested `CostView` under `src/components/admin/` — the jsdom
 * component project does not scan `src/app/**`, so the page stays untested glue.
 *
 * The page reads the canonical range from the layout (single source of truth,
 * ADMIN-BR-8) and re-fetches whenever it changes; an AbortController cancels an
 * in-flight request when the range changes again or the page unmounts.
 */

import { useEffect, useState } from "react";

import { useAdminRange } from "@/components/admin/AdminShell";
import CostView from "@/components/admin/CostView";
import type { CostResponse } from "@/lib/admin/admin-types";

export default function AdminCostPage() {
  const { range } = useAdminRange();
  const [data, setData] = useState<CostResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams({
      from: String(range.from),
      to: String(range.to),
      bucket: range.bucket,
    });

    fetch(`/api/admin/cost?${qs.toString()}`, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return (await res.json()) as CostResponse;
      })
      .then((body) => {
        setData(body);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return; // superseded by a newer fetch / unmount
        setError(err instanceof Error ? err.message : "Unknown error");
        setLoading(false);
      });

    return () => ctrl.abort();
  }, [range.from, range.to, range.bucket]);

  return <CostView data={data} loading={loading} error={error} />;
}
