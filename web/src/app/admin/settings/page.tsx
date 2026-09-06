"use client";

/**
 * `/admin/settings` — the operator-controlled active-model switch plus the
 * spend-controls surface (daily caps + denylist).
 *
 * A THIN integrator (the "keep app/admin pages thin" rule): it owns the
 * `fetch('/api/admin/settings')` load, the OPTIMISTIC model switch, and the
 * spend write calls (`POST /api/admin/spend/caps`, POST/DELETE denylist),
 * then delegates all render to the tested {@link SettingsView} and
 * {@link SpendControlsView}. It imports no db/repos — only the admin HTTP
 * surface (same-origin, session cookie auto-sent).
 *
 * Settings POST remains `{ model }` — spend writes go to `/api/admin/spend/*`.
 *
 * `runtime`/`dynamic` are not declared here — the parent `admin/layout.tsx` is
 * already `force-dynamic` + `nodejs` and server-gates the whole route group.
 */

import { useCallback, useEffect, useState } from "react";

import SettingsView from "@/components/admin/SettingsView";
import SpendControlsView from "@/components/admin/SpendControlsView";
import type { ModelKey } from "@/agent/models";
import type {
  AdminSettingsResponse,
  AdminSpendState,
} from "@/lib/admin/admin-types";

const LAUNCH_SPEND: AdminSpendState = {
  signedCap: 25,
  guestCap: 10,
  denylist: [],
};

export default function SettingsPage() {
  const [data, setData] = useState<AdminSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [spendPending, setSpendPending] = useState(false);
  const [spendError, setSpendError] = useState<string | null>(null);

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

  const applySpend = useCallback((spend: AdminSpendState) => {
    setData((prev) => (prev ? { ...prev, spend } : prev));
  }, []);

  const onSaveCaps = useCallback(
    (caps: { signedCap: number; guestCap: number }) => {
      setSpendPending(true);
      setSpendError(null);
      void (async () => {
        try {
          const res = await fetch("/api/admin/spend/caps", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(caps),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as {
              message?: string;
            } | null;
            throw new Error(body?.message ?? `HTTP ${res.status}`);
          }
          const spend = (await res.json()) as AdminSpendState;
          applySpend(spend);
        } catch (err) {
          setSpendError(
            err instanceof Error
              ? err.message
              : "Failed to save spend controls.",
          );
        } finally {
          setSpendPending(false);
        }
      })();
    },
    [applySpend],
  );

  const onAddEmail = useCallback(
    (email: string) => {
      setSpendPending(true);
      setSpendError(null);
      void (async () => {
        try {
          const res = await fetch("/api/admin/spend/denylist", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as {
              code?: string;
              message?: string;
            } | null;
            throw new Error(body?.message ?? `HTTP ${res.status}`);
          }
          const body = (await res.json()) as { spend: AdminSpendState };
          applySpend(body.spend);
        } catch (err) {
          setSpendError(
            err instanceof Error
              ? err.message
              : "Failed to save spend controls.",
          );
        } finally {
          setSpendPending(false);
        }
      })();
    },
    [applySpend],
  );

  const onRemoveEmail = useCallback(
    (email: string) => {
      setSpendPending(true);
      setSpendError(null);
      void (async () => {
        try {
          const res = await fetch("/api/admin/spend/denylist", {
            method: "DELETE",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as {
              message?: string;
            } | null;
            throw new Error(body?.message ?? `HTTP ${res.status}`);
          }
          const body = (await res.json()) as { spend?: AdminSpendState };
          if (body.spend) applySpend(body.spend);
        } catch (err) {
          setSpendError(
            err instanceof Error
              ? err.message
              : "Failed to save spend controls.",
          );
        } finally {
          setSpendPending(false);
        }
      })();
    },
    [applySpend],
  );

  // Launch defaults are a loading placeholder only — never live data. A failed
  // GET leaves `data` null; keep the spend surface disabled until a successful
  // load and surface the same error SettingsView already shows.
  const spend = data?.spend;
  const spendReady = spend != null;

  return (
    <>
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
      <SpendControlsView
        signedCap={spend?.signedCap ?? LAUNCH_SPEND.signedCap}
        guestCap={spend?.guestCap ?? LAUNCH_SPEND.guestCap}
        denylist={spendReady ? spend.denylist : []}
        loading={loading || !spendReady}
        pending={spendPending}
        error={spendError ?? (spendReady ? null : error)}
        onSaveCaps={onSaveCaps}
        onAddEmail={onAddEmail}
        onRemoveEmail={onRemoveEmail}
      />
    </>
  );
}
