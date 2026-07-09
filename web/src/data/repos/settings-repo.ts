/**
 * src/data/repos/settings-repo.ts — the operator-controlled `app_setting`
 * key/value store, first consumed for the active-model switch.
 *
 * WHY THIS EXISTS: the app's active LLM used to be fixed by the `ACTIVE_MODEL`
 * Fly secret (a restart-required deploy-time choice). This repo makes it
 * runtime-controlled instead: the admin Settings panel writes a `ModelKey` to
 * `app_setting` (key = {@link ACTIVE_MODEL_SETTING_KEY}), and every turn's
 * provider factory resolves it fresh via {@link getActiveModelKey}.
 *
 * FAIL-SOFT READS, DELIBERATELY: {@link resolveActiveModel} never throws —  a
 * missing row (pre-migration deploy, or no admin selection yet), a hand-edited
 * or stale invalid value, or ANY thrown DB error all degrade to
 * {@link DEFAULT_MODEL_KEY} with `source: "default"`. A model-resolution fault
 * must never break chat.
 *
 * WRITES CAN THROW: {@link setActiveModelKey} is only called from the admin
 * settings route, which is expected to surface a failure to the operator, so it
 * does not swallow errors.
 *
 * Handle style: like champions-items-repo's admin surface, this repo resolves
 * the `@/data/db` singleton via a dynamic `await import(...)` per call (never a
 * static import) — that keeps `db` out of this module's static import graph, so
 * the provider factory (a hot, DB-free path today) can dynamic-import this repo
 * without dragging Postgres into its own static graph.
 */

import "server-only";

import { eq } from "drizzle-orm";

import { app_setting } from "@/data/schema";
import { DEFAULT_MODEL_KEY, isModelKey, type ModelKey } from "@/agent/models";

/** The `app_setting.key` under which the active model selection is stored. */
export const ACTIVE_MODEL_SETTING_KEY = "active_model";

/** The resolved active-model setting, with provenance for the admin UI. */
export interface ActiveModelSetting {
  key: ModelKey;
  /** "db" — a valid stored selection; "default" — no (valid) row found. */
  source: "db" | "default";
  /** Admin email that made the stored selection; null if defaulted/unknown. */
  updatedBy: string | null;
  /** Epoch ms of the stored selection; null if defaulted. */
  updatedAt: number | null;
}

const DEFAULT_SETTING: ActiveModelSetting = {
  key: DEFAULT_MODEL_KEY,
  source: "default",
  updatedBy: null,
  updatedAt: null,
};

/**
 * Resolve the operator's active-model selection. Reads the PK row for
 * {@link ACTIVE_MODEL_SETTING_KEY}; a missing row, a stored value that no
 * longer validates as a {@link ModelKey} (e.g. hand-edited or a retired key),
 * or any thrown error (unmigrated table, connection fault, etc.) all fail soft
 * to {@link DEFAULT_MODEL_KEY} with `source: "default"` — resolution never
 * throws.
 */
export async function resolveActiveModel(): Promise<ActiveModelSetting> {
  try {
    const { db } = await import("@/data/db");
    const [row] = await db
      .select()
      .from(app_setting)
      .where(eq(app_setting.key, ACTIVE_MODEL_SETTING_KEY))
      .limit(1);

    if (!row || !isModelKey(row.value)) {
      return DEFAULT_SETTING;
    }

    return {
      key: row.value,
      source: "db",
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
    };
  } catch {
    // Pre-migration deploy, connection fault, etc. — degrade to the default
    // rather than failing the caller (a chat turn must still run).
    return DEFAULT_SETTING;
  }
}

/** Thin wrapper over {@link resolveActiveModel} for callers that only need the key. */
export async function getActiveModelKey(): Promise<ModelKey> {
  return (await resolveActiveModel()).key;
}

/**
 * Set the operator's active-model selection (upsert by PK). Callers are admin
 * routes that should surface a failure to the operator, so — unlike the reads
 * above — this does NOT swallow errors.
 */
export async function setActiveModelKey(
  key: ModelKey,
  updatedBy: string | null,
): Promise<void> {
  const { db } = await import("@/data/db");
  const now = Date.now();
  await db
    .insert(app_setting)
    .values({
      key: ACTIVE_MODEL_SETTING_KEY,
      value: key,
      updated_by: updatedBy,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: app_setting.key,
      set: { value: key, updated_by: updatedBy, updated_at: now },
    });
}
