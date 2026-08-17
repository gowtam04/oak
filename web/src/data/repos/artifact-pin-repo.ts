/**
 * src/data/repos/artifact-pin-repo.ts — the SOLE Postgres reader/writer for
 * conversation artifact pins (docs/features/answer-cards-and-artifacts).
 *
 * Snapshots are stored as JSON text and never re-fetched (PIN-BR-1). Cap 5
 * per (account, conversation) is enforced here (`pin_cap`, PIN-BR-3), not as
 * a DB check. Isolation: every read/write filters by accountId (AUTH-BR-2);
 * another account is indistinguishable from a miss.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/data/db";
import { conversation_artifact_pin } from "@/data/schema";

const PIN_CAP = 5;

export type ArtifactPinKind = "team_sheet" | "comparison" | "calc";

export interface ArtifactPin {
  id: string;
  accountId: string;
  conversationId: string;
  kind: string;
  title: string;
  snapshot: unknown;
  createdAt: number;
}

function codedError(code: string, message = code): Error {
  const err = new Error(message);
  (err as Error & { code: string }).code = code;
  return err;
}

function parseSnapshot(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function toPin(row: {
  id: string;
  accountId: string;
  conversationId: string;
  kind: string;
  title: string;
  snapshotJson: string;
  createdAt: number;
}): ArtifactPin {
  return {
    id: row.id,
    accountId: row.accountId,
    conversationId: row.conversationId,
    kind: row.kind,
    title: row.title,
    snapshot: parseSnapshot(row.snapshotJson),
    createdAt: row.createdAt,
  };
}

const PIN_COLS = {
  id: conversation_artifact_pin.id,
  accountId: conversation_artifact_pin.account_id,
  conversationId: conversation_artifact_pin.conversation_id,
  kind: conversation_artifact_pin.kind,
  title: conversation_artifact_pin.title,
  snapshotJson: conversation_artifact_pin.snapshot_json,
  createdAt: conversation_artifact_pin.created_at,
};

export async function insert(args: {
  accountId: string;
  conversationId: string;
  kind: ArtifactPinKind | string;
  title: string;
  snapshot: unknown;
}): Promise<{ id: string }> {
  const id = randomUUID();
  // JSON.stringify clones so a later mutation of `snapshot` cannot change the row.
  const snapshotJson = JSON.stringify(args.snapshot);

  await db.transaction(async (tx) => {
    // Lock this conversation's existing pins so two concurrent inserts at the
    // cap cannot both commit (PIN-BR-3). Insert first, then count; over-cap
    // throws and rolls the new row back.
    await tx
      .select({ id: conversation_artifact_pin.id })
      .from(conversation_artifact_pin)
      .where(
        and(
          eq(conversation_artifact_pin.account_id, args.accountId),
          eq(conversation_artifact_pin.conversation_id, args.conversationId),
        ),
      )
      .for("update");

    await tx.insert(conversation_artifact_pin).values({
      id,
      account_id: args.accountId,
      conversation_id: args.conversationId,
      kind: args.kind,
      title: args.title,
      snapshot_json: snapshotJson,
      created_at: Date.now(),
    });

    const countRows = await tx
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(conversation_artifact_pin)
      .where(
        and(
          eq(conversation_artifact_pin.account_id, args.accountId),
          eq(conversation_artifact_pin.conversation_id, args.conversationId),
        ),
      );
    if ((countRows[0]?.n ?? 0) > PIN_CAP) {
      throw codedError("pin_cap");
    }
  });

  return { id };
}

export async function get(
  accountId: string,
  conversationId: string,
  id: string,
): Promise<ArtifactPin | null> {
  const rows = await db
    .select(PIN_COLS)
    .from(conversation_artifact_pin)
    .where(
      and(
        eq(conversation_artifact_pin.account_id, accountId),
        eq(conversation_artifact_pin.conversation_id, conversationId),
        eq(conversation_artifact_pin.id, id),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row ? toPin(row) : null;
}

export async function list(
  accountId: string,
  conversationId: string,
): Promise<ArtifactPin[]> {
  const rows = await db
    .select(PIN_COLS)
    .from(conversation_artifact_pin)
    .where(
      and(
        eq(conversation_artifact_pin.account_id, accountId),
        eq(conversation_artifact_pin.conversation_id, conversationId),
      ),
    )
    .orderBy(asc(conversation_artifact_pin.created_at));
  return rows.map(toPin);
}

export async function deletePin(
  accountId: string,
  conversationId: string,
  id: string,
): Promise<void> {
  await db
    .delete(conversation_artifact_pin)
    .where(
      and(
        eq(conversation_artifact_pin.account_id, accountId),
        eq(conversation_artifact_pin.conversation_id, conversationId),
        eq(conversation_artifact_pin.id, id),
      ),
    );
}

export { deletePin as delete };

export async function deleteForConversation(
  accountId: string,
  conversationId: string,
): Promise<void> {
  await db
    .delete(conversation_artifact_pin)
    .where(
      and(
        eq(conversation_artifact_pin.account_id, accountId),
        eq(conversation_artifact_pin.conversation_id, conversationId),
      ),
    );
}

export async function deleteForAccount(accountId: string): Promise<void> {
  await db
    .delete(conversation_artifact_pin)
    .where(eq(conversation_artifact_pin.account_id, accountId));
}
