/**
 * src/data/repos/scope-mru-repo.ts — per-account scope most-recently-used list.
 *
 * Upserts (account_id, format). list() returns formats newest-first.
 */

import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/data/db";
import type { Format } from "@/data/formats";
import { account_scope_mru } from "@/data/schema";

export async function touch(
  accountId: string,
  format: Format,
  at: number,
): Promise<void> {
  await db
    .insert(account_scope_mru)
    .values({
      account_id: accountId,
      format,
      last_used_at: at,
    })
    .onConflictDoUpdate({
      target: [account_scope_mru.account_id, account_scope_mru.format],
      set: { last_used_at: at },
    });
}

export async function list(accountId: string): Promise<Format[]> {
  const rows = await db
    .select({ format: account_scope_mru.format })
    .from(account_scope_mru)
    .where(eq(account_scope_mru.account_id, accountId))
    .orderBy(desc(account_scope_mru.last_used_at));
  return rows.map((r) => r.format as Format);
}
