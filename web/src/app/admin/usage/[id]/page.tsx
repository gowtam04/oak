"use client";

/**
 * `/admin/usage/[id]` — the per-turn drill-down page (ADMIN-US-5, ADMIN-AC-5.2).
 *
 * A THIN integrator (the "keep app/admin pages thin" rule): it reads the turn id
 * from the route, owns the `fetch('/api/admin/turns/[id]')` orchestration
 * (loading / 404 / error), and delegates ALL render to the tested
 * {@link TurnDetailScreen} view under `src/components/admin/` (the jsdom
 * component project does not scan `src/app/**`). It imports no db/repos — it only
 * talks to the admin HTTP surface (same-origin, session cookie auto-sent).
 *
 * READ-ONLY (ADMIN-BR-2): a single GET; the only affordance the screen offers is
 * the back link to the Usage explorer.
 *
 * `runtime`/`dynamic` are not declared here — the parent `admin/layout.tsx` is
 * already `force-dynamic` + `nodejs` and server-gates the whole route group.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import TurnDetailScreen from "@/components/admin/TurnDetailScreen";
import type { TurnDetail, TurnDetailResponse } from "@/lib/admin/admin-types";

export default function TurnDrillDownPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : undefined;

  const [turn, setTurn] = useState<TurnDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    setNotFound(false);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/admin/turns/${encodeURIComponent(id)}`, {
          method: "GET",
          credentials: "same-origin",
        });
        if (res.status === 404) {
          if (active) {
            setNotFound(true);
            setTurn(null);
          }
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as TurnDetailResponse;
        if (active) setTurn(data.turn);
      } catch {
        if (active) {
          setError("Failed to load this turn.");
          setTurn(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <TurnDetailScreen
      turn={turn}
      loading={loading}
      notFound={notFound}
      error={error}
      backHref="/admin/usage"
    />
  );
}
