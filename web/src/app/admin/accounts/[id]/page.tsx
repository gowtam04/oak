"use client";

/**
 * `/admin/accounts/[id]` — the account-detail page (ADMIN-US-8, ADMIN-AC-8.2/8.3).
 *
 * A THIN integrator (the "keep app/admin pages thin" rule): it reads the account
 * id from the route, owns the `fetch('/api/admin/accounts/[id]')` orchestration
 * (loading / 404 / error), and delegates ALL render to the tested
 * {@link AccountDetailView} view under `src/components/admin/` (the jsdom
 * component project does not scan `src/app/**`). It imports no db/repos — it only
 * talks to the admin HTTP surface (same-origin, session cookie auto-sent).
 *
 * READ-ONLY (ADMIN-BR-2 / ADMIN-AC-8.4): a single GET; the only affordances the
 * screen offers are the back link and the read-only pivot to this account's
 * turns (`/admin/usage?accountId=…`, ADMIN-AC-11.2).
 *
 * `runtime`/`dynamic` are not declared here — the parent `admin/layout.tsx` is
 * already `force-dynamic` + `nodejs` and server-gates the whole route group.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import AccountDetailView from "@/components/admin/AccountDetailView";
import type {
  AccountDetailResponse,
  AccountWithActivity,
  SessionInfo,
} from "@/lib/admin/admin-types";

export default function AccountDetailPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : undefined;

  const [account, setAccount] = useState<AccountWithActivity | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
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
        const res = await fetch(`/api/admin/accounts/${encodeURIComponent(id)}`, {
          method: "GET",
          credentials: "same-origin",
        });
        if (res.status === 404) {
          if (active) {
            setNotFound(true);
            setAccount(null);
            setSessions([]);
          }
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as AccountDetailResponse;
        if (active) {
          setAccount(data.account);
          setSessions(Array.isArray(data.sessions) ? data.sessions : []);
        }
      } catch {
        if (active) {
          setError("Failed to load this account.");
          setAccount(null);
          setSessions([]);
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
    <AccountDetailView
      account={account}
      sessions={sessions}
      loading={loading}
      notFound={notFound}
      error={error}
      backHref="/admin/accounts"
    />
  );
}
