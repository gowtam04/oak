/**
 * src/data/repos/spend-repo.ts — denylist CRUD, daily-cap get/set, and the
 * atomic UTC-day increment behind spend-control admission.
 *
 * Handle style matches `settings-repo.ts`: `import "server-only"` and a
 * dynamic `await import("@/data/db")` per call so this module stays out of
 * the static graph of route modules that already dynamic-import to avoid
 * build-time `env` throws.
 *
 * FAIL-CLOSED READS (unlike settings-repo): a thrown DB error (missing table,
 * connection fault) MUST propagate. Missing/invalid `app_setting` *rows* still
 * default per key (25 / 10) — that is not a throw.
 */

import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { account_denylist, app_setting, spend_daily_usage } from "@/data/schema";

/** `app_setting.key` for the signed-in daily turn cap. */
export const DAILY_CAP_SIGNED_KEY = "daily_cap_signed";
/** `app_setting.key` for the guest daily turn cap. */
export const DAILY_CAP_GUEST_KEY = "daily_cap_guest";

const DEFAULT_SIGNED_CAP = 25;
const DEFAULT_GUEST_CAP = 10;

export interface DenylistEntry {
  email: string;
  addedAt: number;
  addedBy: string | null;
}

export interface SpendCaps {
  signedCap: number;
  guestCap: number;
}

export interface TryAdmitResult {
  admitted: boolean;
  count: number;
}

/** Trim + lowercase — the denylist identity (SC-BR-2). */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Decimal integer ≥ 1; anything else is invalid (SC-AC-4.1 / SC-BR-13). */
function parseCap(value: string | undefined): number | undefined {
  if (value == null) return undefined;
  if (!/^[1-9]\d*$/.test(value)) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return undefined;
  return n;
}

function assertPositiveInt(n: number, label: string): void {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${label} must be an integer ≥ 1`);
  }
}

export async function addDenylistEmail(
  email: string,
  addedBy: string,
): Promise<void> {
  const { db } = await import("@/data/db");
  const now = Date.now();
  const normalized = normalizeEmail(email);
  await db
    .insert(account_denylist)
    .values({
      email: normalized,
      added_at: now,
      added_by: addedBy,
    })
    .onConflictDoUpdate({
      target: account_denylist.email,
      set: { added_at: now, added_by: addedBy },
    });
}

export async function removeDenylistEmail(email: string): Promise<void> {
  const { db } = await import("@/data/db");
  await db
    .delete(account_denylist)
    .where(eq(account_denylist.email, normalizeEmail(email)));
}

export async function isDenylisted(email: string): Promise<boolean> {
  const { db } = await import("@/data/db");
  const [row] = await db
    .select({ email: account_denylist.email })
    .from(account_denylist)
    .where(eq(account_denylist.email, normalizeEmail(email)))
    .limit(1);
  return row != null;
}

export async function getDenylist(): Promise<DenylistEntry[]> {
  const { db } = await import("@/data/db");
  const rows = await db.select().from(account_denylist);
  return rows.map((r) => ({
    email: r.email,
    addedAt: r.added_at,
    addedBy: r.added_by,
  }));
}

export async function getCaps(): Promise<SpendCaps> {
  const { db } = await import("@/data/db");
  const rows = await db
    .select({ key: app_setting.key, value: app_setting.value })
    .from(app_setting)
    .where(inArray(app_setting.key, [DAILY_CAP_SIGNED_KEY, DAILY_CAP_GUEST_KEY]));

  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return {
    signedCap: parseCap(byKey.get(DAILY_CAP_SIGNED_KEY)) ?? DEFAULT_SIGNED_CAP,
    guestCap: parseCap(byKey.get(DAILY_CAP_GUEST_KEY)) ?? DEFAULT_GUEST_CAP,
  };
}

export async function setCaps(
  caps: { signedCap: number; guestCap: number },
  updatedBy: string,
): Promise<void> {
  assertPositiveInt(caps.signedCap, "signedCap");
  assertPositiveInt(caps.guestCap, "guestCap");

  const { db } = await import("@/data/db");
  const now = Date.now();
  await db
    .insert(app_setting)
    .values({
      key: DAILY_CAP_SIGNED_KEY,
      value: String(caps.signedCap),
      updated_by: updatedBy,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: app_setting.key,
      set: {
        value: String(caps.signedCap),
        updated_by: updatedBy,
        updated_at: now,
      },
    });
  await db
    .insert(app_setting)
    .values({
      key: DAILY_CAP_GUEST_KEY,
      value: String(caps.guestCap),
      updated_by: updatedBy,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: app_setting.key,
      set: {
        value: String(caps.guestCap),
        updated_by: updatedBy,
        updated_at: now,
      },
    });
}

/**
 * Atomically increment today's counter if `count < cap`.
 * Empty RETURNING (WHERE failed) → not admitted; follow-up SELECT for `count`.
 */
export async function tryAdmit(
  subjectKey: string,
  dayUtc: string,
  cap: number,
): Promise<TryAdmitResult> {
  const { db } = await import("@/data/db");
  const result = (await db.execute(sql`
    INSERT INTO spend_daily_usage (subject_key, day_utc, admitted_count)
    VALUES (${subjectKey}, ${dayUtc}, 1)
    ON CONFLICT (subject_key, day_utc)
    DO UPDATE SET admitted_count = spend_daily_usage.admitted_count + 1
    WHERE spend_daily_usage.admitted_count < ${cap}
    RETURNING admitted_count
  `)) as unknown as { rows: Array<{ admitted_count: unknown }> };

  const admittedRow = result.rows[0];
  if (admittedRow != null) {
    return { admitted: true, count: Number(admittedRow.admitted_count) };
  }

  const [current] = await db
    .select({ admitted_count: spend_daily_usage.admitted_count })
    .from(spend_daily_usage)
    .where(
      and(
        eq(spend_daily_usage.subject_key, subjectKey),
        eq(spend_daily_usage.day_utc, dayUtc),
      ),
    );
  return { admitted: false, count: Number(current?.admitted_count ?? 0) };
}
