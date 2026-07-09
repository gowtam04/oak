"use client";

/**
 * `/admin/settings` — the operator-controlled active-model switch.
 *
 * A THIN integrator (the "keep app/admin pages thin" rule): it owns the
 * `fetch('/api/admin/settings')` load and the OPTIMISTIC model switch (swap
 * the active key immediately, POST, replace state with the server's response
 * on success so the audit fields stay accurate, revert + surface an error on
 * failure), then delegates all render to the tested {@link SettingsView}
 * under `src/components/admin/`. It imports no db/repos — only the admin HTTP
 * surface (same-origin, session cookie auto-sent).
 *
 * `runtime`/`dynamic` are not declared here — the parent `admin/layout.tsx` is
 * already `force-dynamic` + `nodejs` and server-gates the whole route group.
 */

import { useCallback, useEffect, useState } from "react";

import SettingsView from "@/components/admin/SettingsView";
import type { ModelKey } from "@/agent/models";
import type { AdminSettingsResponse } from "@/lib/admin/admin-types";

export default function SettingsPage() {
  const [data, setData] = useState<AdminSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "GET",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as AdminSettingsResponse;
      setData(body);
    } catch {
      setData(null);
      setError("Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onSelect = useCallback(
    (key: ModelKey) => {
      const previous = data;
      // Optimistic: swap the active model immediately.
      setData((prev) => (prev ? { ...prev, activeModel: key } : prev));
      setPending(true);
      setError(null);
      void (async () => {
        try {
          const res = await fetch("/api/admin/settings", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: key }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as {
              message?: string;
            } | null;
            throw new Error(body?.message ?? `HTTP ${res.status}`);
          }
          const body = (await res.json()) as AdminSettingsResponse;
          setData(body);
        } catch (err) {
          // Revert on failure.
          setData(previous);
          setError(
            err instanceof Error
              ? err.message
              : "Failed to switch the active model — reverted.",
          );
        } finally {
          setPending(false);
        }
      })();
    },
    [data],
  );

  return (
    <SettingsView
      activeModel={data?.activeModel ?? null}
      source={data?.source ?? null}
      models={data?.models ?? []}
      updatedBy={data?.updatedBy ?? null}
      updatedAt={data?.updatedAt ?? null}
      loading={loading}
      error={error}
      pending={pending}
      onSelect={onSelect}
    />
  );
}
