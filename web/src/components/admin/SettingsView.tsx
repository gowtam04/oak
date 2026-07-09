"use client";

import type { ModelKey } from "@/agent/models";
import type { AdminSettingsModel } from "@/lib/admin/admin-types";

/**
 * SettingsView — the render half of the admin Settings screen
 * (`/admin/settings`).
 *
 * WHY: the app's active LLM used to be fixed by the `ACTIVE_MODEL` Fly secret
 * (a restart-required deploy-time choice). This is the operator-facing surface
 * for the runtime replacement: a radio group over every registry model, each
 * flagged `configured` (its provider API key present on this server) so an
 * operator can never select a model this server can't actually run — the
 * option is disabled with an explanatory note instead. The audit line shows
 * who last changed the selection (or that no operator selection has been made
 * yet, in which case the default model is active).
 *
 * SECOND WRITE in the admin UI (after champions-items' toggle): selecting a
 * model POSTs. The owning thin page (`app/admin/settings/page.tsx`) owns that
 * fetch + the optimistic swap; this view stays PURE + CONTROLLED (imports no
 * db/repos/runtime, holds no network state) so it renders identically from
 * fixtures under the jsdom component project.
 */

/** epoch-ms → local datetime string; tolerant of a null/NaN value. */
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

export interface SettingsViewProps {
  /** The currently active model key, or null while unloaded/errored. */
  activeModel: ModelKey | null;
  /** "db" — an operator selection is stored; "default" — no selection yet. */
  source: "db" | "default" | null;
  /** Every registry model, each flagged whether its provider is configured. */
  models: AdminSettingsModel[];
  /** Admin email that made the stored selection; null if defaulted/unknown. */
  updatedBy: string | null;
  /** Epoch ms of the stored selection; null if defaulted. */
  updatedAt: number | null;
  /** True while the initial GET is in flight. */
  loading?: boolean;
  /** A transport/HTTP error message, or null when healthy. */
  error?: string | null;
  /** True while a POST switch is in flight (disables every option). */
  pending?: boolean;
  /** Emits the model key the operator picked. */
  onSelect: (key: ModelKey) => void;
}

export default function SettingsView({
  activeModel,
  source,
  models,
  updatedBy,
  updatedAt,
  loading = false,
  error = null,
  pending = false,
  onSelect,
}: SettingsViewProps) {
  const disabledAll = loading || pending;

  return (
    <section className="admin-page settings-view" data-testid="settings-view">
      <h1 className="admin-page__title">Settings</h1>

      <p className="settings-view__intro" data-testid="settings-intro">
        The active model runs every future chat turn on this server. Switching
        it takes effect immediately — no restart. A model whose provider has
        no API key configured on this server can&apos;t be selected.
      </p>

      {error != null && error !== "" && (
        <div className="settings-view__error" data-testid="settings-error" role="alert">
          {error}
        </div>
      )}

      <div
        className="settings-view__group"
        role="radiogroup"
        aria-label="Active model"
        data-testid="settings-model-group"
      >
        {models.length === 0 ? (
          <p className="settings-view__empty" data-testid="settings-empty">
            {loading ? "Loading models…" : "No models in the registry."}
          </p>
        ) : (
          models.map((m) => {
            const active = m.key === activeModel;
            const disabled = disabledAll || !m.configured;
            return (
              <label
                key={m.key}
                className={`settings-view__row${
                  active ? " settings-view__row--active" : ""
                }${!m.configured ? " settings-view__row--unconfigured" : ""}`}
              >
                <input
                  type="radio"
                  name="active-model"
                  data-testid={`settings-model-${m.key}`}
                  checked={active}
                  aria-checked={active}
                  disabled={disabled}
                  onChange={() => {
                    if (!disabled) onSelect(m.key);
                  }}
                />
                <span className="settings-view__row-main">
                  <span className="settings-view__label">{m.label}</span>
                  <span className="settings-view__badge">{m.provider}</span>
                </span>
                {!m.configured && (
                  <span className="settings-view__note">
                    provider key not configured on this server
                  </span>
                )}
              </label>
            );
          })
        )}
      </div>

      <p className="settings-view__audit" data-testid="settings-audit">
        {source === "db"
          ? `Last changed by ${updatedBy ?? "unknown"} · ${formatTimestamp(updatedAt)}`
          : "Default — no operator selection yet."}
      </p>
    </section>
  );
}
