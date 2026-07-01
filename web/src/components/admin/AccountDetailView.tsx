"use client";

import type { AccountWithActivity, SessionInfo } from "@/lib/admin/admin-types";

/**
 * AccountDetailView — the render half of the account-detail screen
 * (`/admin/accounts/[id]`, ADMIN-US-8). Given one {@link AccountWithActivity}
 * plus its active {@link SessionInfo} rows it renders, READ-ONLY:
 *
 *   1. Identity   — email, account id, signup date (ADMIN-AC-8.1).
 *   2. Activity   — total turns, last-active time, input/output/thinking + total
 *                   tokens, estimated cost (ADMIN-BR-5), saved-conversation and
 *                   saved-team counts, plus rate-limited / failed counters
 *                   (ADMIN-AC-8.2, ADMIN-AC-11.1).
 *   3. Sessions   — each active session's id, created, and expiry
 *                   (ADMIN-AC-8.3).
 *   4. A pivot link to this account's recorded turns (ADMIN-AC-11.2).
 *
 * PURE + CONTROLLED (the admin component-test rule): the owning thin page
 * (`app/admin/accounts/[id]/page.tsx`) owns the
 * `fetch('/api/admin/accounts/[id]')` orchestration and passes the resolved
 * `account`/`sessions` (or the loading / notFound / error flags) in as props, so
 * this view renders identically from fixtures in jsdom and imports no
 * db/repos/runtime.
 *
 * READ-ONLY (ADMIN-BR-2, ADMIN-AC-8.4): the only affordances are the back link
 * and the "view turns" pivot — both navigation. NOTHING here mutates the
 * account, a session, its content, or its limits.
 *
 * Refs:
 *   - docs/features/admin-panel/architecture/design.md § Component Design §5,
 *     § API Design (`GET /api/admin/accounts/{id} → AccountDetailResponse`),
 *     § Implementation Phases Phase 8.
 *   - requirements.md ADMIN-US-8, ADMIN-AC-8.1/8.2/8.3/8.4, ADMIN-AC-11.2,
 *     ADMIN-BR-2/5.
 */

/** epoch-ms → local datetime string; tolerant of a 0/NaN/null value. */
function formatTimestamp(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "—";
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Estimated USD cost to a readable precision (ADMIN-BR-5). */
function formatUsd(n: number): string {
  return `$${(Number.isFinite(n) ? n : 0).toFixed(4)}`;
}

/** Integer with thousands separators; tolerant of nullish. */
function formatInt(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString("en-US") : "0";
}

/** One labelled value cell in a metric/identity grid. */
function Field({
  label,
  value,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="turn-detail__field" data-testid={testId}>
      <dt className="turn-detail__field-label">{label}</dt>
      <dd className="turn-detail__field-value">{value}</dd>
    </div>
  );
}

export interface AccountDetailViewProps {
  /** The resolved account, or null while loading / not found / errored. */
  account: AccountWithActivity | null;
  /** The account's active sessions (ADMIN-AC-8.3); empty when none/loading. */
  sessions: SessionInfo[];
  /** True while the detail fetch is in flight. */
  loading?: boolean;
  /** True when the id resolved to a 404 (no such account). */
  notFound?: boolean;
  /** A transport/HTTP error message, or null when healthy. */
  error?: string | null;
  /** Where the "back" link points (defaults to the Accounts list). */
  backHref?: string;
  /** Where the "view turns" pivot points (defaults to a scoped Usage filter). */
  turnsHref?: string;
}

export default function AccountDetailView({
  account,
  sessions,
  loading = false,
  notFound = false,
  error = null,
  backHref = "/admin/accounts",
  turnsHref,
}: AccountDetailViewProps) {
  let body: React.ReactNode;

  if (loading) {
    body = (
      <p className="turn-detail__empty" data-testid="account-detail-loading">
        Loading account…
      </p>
    );
  } else if (notFound) {
    body = (
      <p className="turn-detail__empty" data-testid="account-detail-not-found">
        Account not found.
      </p>
    );
  } else if (error != null && error !== "") {
    body = (
      <p className="turn-detail__empty" data-testid="account-detail-error" role="alert">
        {error}
      </p>
    );
  } else if (account) {
    const pivotHref =
      turnsHref ?? `/admin/usage?accountId=${encodeURIComponent(account.id)}`;
    body = (
      <div className="account-detail" data-testid="account-detail">
        <header className="turn-detail__header">
          <span className="turn-detail__id" data-testid="account-detail-email">
            {account.email}
          </span>
        </header>

        {/* 1. Identity */}
        <dl className="turn-detail__grid turn-detail__identity">
          <Field
            label="Account id"
            testId="account-detail-id"
            value={<code>{account.id}</code>}
          />
          <Field
            label="Signed up"
            testId="account-detail-signup"
            value={formatTimestamp(account.createdAt)}
          />
          <Field
            label="Last active"
            testId="account-detail-last-active"
            value={account.lastActiveAt == null ? "Never" : formatTimestamp(account.lastActiveAt)}
          />
        </dl>

        {/* 2. Activity */}
        <dl
          className="turn-detail__grid turn-detail__metrics"
          data-testid="account-detail-activity"
        >
          <Field label="Total turns" testId="account-detail-turns" value={formatInt(account.turns)} />
          <Field label="Input tokens" value={formatInt(account.inputTokens)} />
          <Field label="Output tokens" value={formatInt(account.outputTokens)} />
          <Field label="Thinking tokens" value={formatInt(account.thinkingTokens)} />
          <Field
            label="Total tokens"
            testId="account-detail-total-tokens"
            value={formatInt(account.totalTokens)}
          />
          <Field
            label="Est. cost"
            testId="account-detail-cost"
            value={
              <>
                {formatUsd(account.estUsd)}{" "}
                <span className="turn-detail__estimate-tag">(estimated)</span>
              </>
            }
          />
          <Field
            label="Saved conversations"
            testId="account-detail-conversations"
            value={formatInt(account.conversations)}
          />
          <Field
            label="Saved teams"
            testId="account-detail-teams"
            value={formatInt(account.teams)}
          />
          <Field
            label="Rate-limited turns"
            testId="account-detail-rate-limited"
            value={formatInt(account.rateLimited)}
          />
          <Field
            label="Failed turns"
            testId="account-detail-failed"
            value={formatInt(account.failed)}
          />
        </dl>

        <a
          href={pivotHref}
          className="account-detail__turns-link"
          data-testid="account-detail-turns-link"
        >
          View this account&rsquo;s turns →
        </a>

        {/* 3. Sessions */}
        <div className="turn-detail__section">
          <h3 className="turn-detail__section-title">
            Active sessions ({sessions.length})
          </h3>
          {sessions.length === 0 ? (
            <p className="turn-detail__empty" data-testid="account-detail-no-sessions">
              No active sessions.
            </p>
          ) : (
            <table
              className="turn-detail__tool-trace"
              data-testid="account-detail-sessions"
            >
              <thead>
                <tr>
                  <th scope="col">Session id</th>
                  <th scope="col">Created</th>
                  <th scope="col">Expires</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} data-testid={`account-session-${s.id}`}>
                    <td>
                      <code>{s.id}</code>
                    </td>
                    <td>{formatTimestamp(s.createdAt)}</td>
                    <td>{formatTimestamp(s.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  } else {
    body = (
      <p className="turn-detail__empty" data-testid="account-detail-empty">
        No account to display.
      </p>
    );
  }

  return (
    <section
      className="admin-page account-detail-screen"
      data-testid="account-detail-screen"
    >
      <a
        href={backHref}
        className="turn-detail-screen__back"
        data-testid="account-detail-back"
      >
        ← Back to accounts
      </a>
      <h1 className="admin-page__title">Account detail</h1>
      {body}
    </section>
  );
}
