"use client";

import TurnDetail from "./TurnDetail";
import type { TurnDetail as TurnDetailRecord } from "@/lib/admin/admin-types";

/**
 * TurnDetailScreen — the render half of the per-turn drill-down page
 * (`/admin/usage/[id]`, ADMIN-US-5 / ADMIN-AC-5.2). It wraps the existing pure
 * {@link TurnDetail} breakdown with the screen chrome the page needs: a back
 * link to the Usage explorer, a title, and the loading / not-found / error
 * fetch-states.
 *
 * Like the other admin views it is PURE + CONTROLLED (the component-test rule):
 * the owning thin page (`app/admin/usage/[id]/page.tsx`) owns the
 * `fetch('/api/admin/turns/[id]')` orchestration and passes the resolved
 * `turn` (or the loading/notFound/error flags) in as props, so this screen
 * renders identically from fixtures in jsdom and imports no db/repos/runtime.
 *
 * READ-ONLY (ADMIN-BR-2): the only interactive affordance is the back link
 * (navigation); {@link TurnDetail} itself renders no mutating control.
 *
 * Refs:
 *   - docs/features/admin-panel/architecture/design.md § Component Design §5
 *     (`TurnDetail` primitive), § API Design (`GET /api/admin/turns/{id} →
 *     TurnDetailResponse`), § Implementation Phases Phase 7 (drill-down).
 *   - requirements.md ADMIN-US-5, ADMIN-AC-5.2, ADMIN-BR-2.
 */

export interface TurnDetailScreenProps {
  /** The resolved turn record, or null while loading / not found / errored. */
  turn: TurnDetailRecord | null;
  /** True while the detail fetch is in flight. */
  loading?: boolean;
  /** True when the turn id resolved to a 404 (no such record). */
  notFound?: boolean;
  /** A transport/HTTP error message, or null when healthy. */
  error?: string | null;
  /** Where the "back" link points (defaults to the Usage explorer). */
  backHref?: string;
}

export default function TurnDetailScreen({
  turn,
  loading = false,
  notFound = false,
  error = null,
  backHref = "/admin/usage",
}: TurnDetailScreenProps) {
  let body: React.ReactNode;
  if (loading) {
    body = (
      <p
        className="turn-detail__empty"
        data-testid="turn-detail-screen-loading"
      >
        Loading turn…
      </p>
    );
  } else if (notFound) {
    body = (
      <p
        className="turn-detail__empty"
        data-testid="turn-detail-screen-not-found"
      >
        Turn not found.
      </p>
    );
  } else if (error != null && error !== "") {
    body = (
      <p
        className="turn-detail__empty"
        data-testid="turn-detail-screen-error"
        role="alert"
      >
        {error}
      </p>
    );
  } else if (turn) {
    body = <TurnDetail turn={turn} />;
  } else {
    body = (
      <p
        className="turn-detail__empty"
        data-testid="turn-detail-screen-empty"
      >
        No turn to display.
      </p>
    );
  }

  return (
    <section
      className="admin-page turn-detail-screen"
      data-testid="turn-detail-screen"
    >
      <a
        href={backHref}
        className="turn-detail-screen__back"
        data-testid="turn-detail-screen-back"
      >
        ← Back to usage
      </a>
      <h1 className="admin-page__title">Turn detail</h1>
      {body}
    </section>
  );
}
