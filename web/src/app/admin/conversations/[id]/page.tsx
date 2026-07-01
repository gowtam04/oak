"use client";

/**
 * `/admin/conversations/[id]` — the full conversation thread reader page
 * (ADMIN-US-9, ADMIN-AC-9.2).
 *
 * A THIN integrator (the "keep app/admin pages thin" rule): it reads the
 * conversation id from the route, owns the
 * `fetch('/api/admin/conversations/[id]')` orchestration (loading / 404 /
 * error), and delegates ALL render to the tested {@link ConversationThread} view
 * under `src/components/admin/` (the jsdom component project does not scan
 * `src/app/**`). It imports no db/repos — it only talks to the admin HTTP
 * surface (same-origin, session cookie auto-sent).
 *
 * READ-ONLY (ADMIN-BR-2 / ADMIN-AC-9.3): a single GET; the only affordance the
 * screen offers is the back link to the Conversations browser.
 *
 * `runtime`/`dynamic` are not declared here — the parent `admin/layout.tsx` is
 * already `force-dynamic` + `nodejs` and server-gates the whole route group.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import ConversationThread from "@/components/admin/ConversationThread";
import type { ConversationThreadResponse } from "@/lib/admin/admin-types";

export default function ConversationThreadPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : undefined;

  const [thread, setThread] = useState<ConversationThreadResponse | null>(null);
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
        const res = await fetch(
          `/api/admin/conversations/${encodeURIComponent(id)}`,
          { method: "GET", credentials: "same-origin" },
        );
        if (res.status === 404) {
          if (active) {
            setNotFound(true);
            setThread(null);
          }
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ConversationThreadResponse;
        if (active) setThread(data);
      } catch {
        if (active) {
          setError("Failed to load this conversation.");
          setThread(null);
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
    <ConversationThread
      thread={thread}
      loading={loading}
      notFound={notFound}
      error={error}
      backHref="/admin/conversations"
    />
  );
}
