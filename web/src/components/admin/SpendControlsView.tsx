"use client";

import { useEffect, useState } from "react";

import type { AdminSpendDenylistEntry } from "@/lib/admin/admin-types";

/**
 * SpendControlsView — the render half of the admin spend-controls surface
 * (denylist + daily caps) composed under Settings (`/admin/settings`).
 *
 * PURE + CONTROLLED (admin component-test rule): imports no db/repos/runtime
 * and holds no network state. The owning thin page owns `fetch` + POST/DELETE;
 * this view reports intent via `onSaveCaps` / `onAddEmail` / `onRemoveEmail`.
 * Cap fields are local-draft so the operator can edit without the parent
 * round-tripping every keystroke; they resync when the saved props change.
 *
 * Empty denylist renders `spend-denylist-empty` (SC-AC-3.2, SC-BR-12) — never
 * a placeholder blocked user — except while `loading`, so a failed GET the
 * page keeps in the loading state cannot look like a healthy empty list.
 * Save is a no-op unless both caps are integers ≥ 1 (SC-AC-4.3).
 */

export interface SpendControlsViewProps {
  signedCap: number;
  guestCap: number;
  denylist: readonly AdminSpendDenylistEntry[];
  onSaveCaps: (caps: { signedCap: number; guestCap: number }) => void;
  onAddEmail: (email: string) => void;
  onRemoveEmail: (email: string) => void;
  /** True while the initial GET is in flight. */
  loading?: boolean;
  /** True while a spend write is in flight. */
  pending?: boolean;
  /** A transport/HTTP error message, or null when healthy. */
  error?: string | null;
}

/** Integer ≥ 1; rejects 0, negatives, floats, and non-numeric strings. */
function parsePositiveInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/** epoch-ms → local datetime; empty string when unparseable. */
function formatTimestamp(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SpendControlsView({
  signedCap,
  guestCap,
  denylist,
  onSaveCaps,
  onAddEmail,
  onRemoveEmail,
  loading = false,
  pending = false,
  error = null,
}: SpendControlsViewProps) {
  const [signedDraft, setSignedDraft] = useState(String(signedCap));
  const [guestDraft, setGuestDraft] = useState(String(guestCap));
  const [emailDraft, setEmailDraft] = useState("");

  useEffect(() => {
    setSignedDraft(String(signedCap));
    setGuestDraft(String(guestCap));
  }, [signedCap, guestCap]);

  const disabled = loading || pending;

  function handleSave(): void {
    const nextSigned = parsePositiveInt(signedDraft);
    const nextGuest = parsePositiveInt(guestDraft);
    if (nextSigned == null || nextGuest == null) return;
    onSaveCaps({ signedCap: nextSigned, guestCap: nextGuest });
  }

  function handleAdd(): void {
    if (emailDraft.trim() === "") return;
    onAddEmail(emailDraft);
    setEmailDraft("");
  }

  return (
    <section
      className="admin-page spend-controls-view"
      data-testid="spend-controls-view"
    >
      <h2 className="admin-page__title">Spend controls</h2>

      <p className="spend-controls-view__intro">
        Daily turn caps and the account denylist apply on the next admission
        attempt — no deploy. Allowlisted admin emails cannot be denylisted or
        capped. The denylist ships empty.
      </p>

      {error != null && error !== "" && (
        <div
          className="spend-controls-view__error"
          data-testid="spend-error"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="spend-controls-view__caps">
        <label className="spend-controls-view__field">
          <span className="spend-controls-view__label">
            Signed-in daily cap
          </span>
          <input
            type="text"
            inputMode="numeric"
            className="spend-controls-view__input"
            data-testid="spend-cap-signed"
            aria-label="Signed-in daily cap"
            value={signedDraft}
            disabled={disabled}
            onChange={(e) => setSignedDraft(e.target.value)}
          />
        </label>
        <label className="spend-controls-view__field">
          <span className="spend-controls-view__label">Guest daily cap</span>
          <input
            type="text"
            inputMode="numeric"
            className="spend-controls-view__input"
            data-testid="spend-cap-guest"
            aria-label="Guest daily cap"
            value={guestDraft}
            disabled={disabled}
            onChange={(e) => setGuestDraft(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="spend-controls-view__btn"
          data-testid="spend-caps-save"
          disabled={disabled}
          onClick={handleSave}
        >
          Save caps
        </button>
      </div>

      <div className="spend-controls-view__add">
        <label className="spend-controls-view__field spend-controls-view__field--grow">
          <span className="spend-controls-view__label">Denylist email</span>
          <input
            type="email"
            className="spend-controls-view__input"
            data-testid="spend-add-email"
            aria-label="Denylist email"
            placeholder="blocked@example.com"
            value={emailDraft}
            disabled={disabled}
            onChange={(e) => setEmailDraft(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="spend-controls-view__btn"
          data-testid="spend-add-submit"
          disabled={disabled}
          onClick={handleAdd}
        >
          Add
        </button>
      </div>

      {denylist.length === 0 ? (
        loading ? null : (
          <p
            className="spend-controls-view__empty"
            data-testid="spend-denylist-empty"
          >
            No accounts are denylisted.
          </p>
        )
      ) : (
        <table
          className="spend-controls-view__table"
          data-testid="spend-denylist"
        >
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Added</th>
              <th scope="col">Remove</th>
            </tr>
          </thead>
          <tbody>
            {denylist.map((row) => (
              <tr
                key={row.email}
                data-testid={`spend-denylist-row-${row.email}`}
              >
                <td>{row.email}</td>
                <td
                  data-testid={`spend-denylist-added-at-${row.email}`}
                >
                  {formatTimestamp(row.addedAt)}
                </td>
                <td>
                  <button
                    type="button"
                    className="spend-controls-view__btn spend-controls-view__btn--danger"
                    data-testid={`spend-denylist-remove-${row.email}`}
                    disabled={disabled}
                    onClick={() => onRemoveEmail(row.email)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
