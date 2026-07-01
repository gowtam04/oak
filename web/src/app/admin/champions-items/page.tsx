"use client";

/**
 * `/admin/champions-items` — the operator-curated Champions item allowlist.
 *
 * A THIN integrator (the "keep app/admin pages thin" rule): it owns the
 * `fetch('/api/admin/champions-items')` load, the client-side filter text, and
 * the OPTIMISTIC toggle (flip the checkbox immediately, POST, revert on error),
 * then delegates all render to the tested {@link ChampionsItemsView} under
 * `src/components/admin/`. It imports no db/repos — only the admin HTTP surface
 * (same-origin, session cookie auto-sent).
 *
 * This is the FIRST mutating admin page: unlike the read-only analytics screens,
 * a checkbox toggle POSTs. The write is gated server-side by
 * `requireAdminRequest` on the route; this page just orchestrates it.
 *
 * `runtime`/`dynamic` are not declared here — the parent `admin/layout.tsx` is
 * already `force-dynamic` + `nodejs` and server-gates the whole route group.
 */

import { useCallback, useEffect, useState } from "react";

import ChampionsItemsView from "@/components/admin/ChampionsItemsView";
import type {
  AdminChampionsItem,
  ChampionsItemsResponse,
} from "@/lib/admin/admin-types";

export default function ChampionsItemsPage() {
  const [items, setItems] = useState<AdminChampionsItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch("/api/admin/champions-items", {
          method: "GET",
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ChampionsItemsResponse;
        if (!active) return;
        setItems(Array.isArray(data.items) ? data.items : []);
      } catch {
        if (!active) return;
        setItems([]);
        setError("Failed to load Champions items.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setAvailability = useCallback((slug: string, available: boolean) => {
    setItems((prev) =>
      prev.map((it) => (it.slug === slug ? { ...it, available } : it)),
    );
  }, []);

  const onToggle = useCallback(
    (slug: string, nextAvailable: boolean) => {
      // Optimistic flip.
      setAvailability(slug, nextAvailable);
      setPending((prev) => new Set(prev).add(slug));
      setError(null);
      void (async () => {
        try {
          const res = await fetch("/api/admin/champions-items", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug, available: nextAvailable }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch {
          // Revert on failure.
          setAvailability(slug, !nextAvailable);
          setError("Failed to save that change — reverted.");
        } finally {
          setPending((prev) => {
            const next = new Set(prev);
            next.delete(slug);
            return next;
          });
        }
      })();
    },
    [setAvailability],
  );

  return (
    <ChampionsItemsView
      items={items}
      query={query}
      onQueryChange={setQuery}
      onToggle={onToggle}
      loading={loading}
      error={error}
      pending={pending}
    />
  );
}
