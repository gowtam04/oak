/**
 * src/data/repos/share-repo.ts — immutable public-share snapshots (chat-qol).
 *
 * Create stores a frozen OakAnswer JSON. getLiveShare hides revoked/missing
 * rows. Account delete hard-deletes via deleteSharesForAccount.
 */

import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { OakAnswer } from "@/agent/schemas";
import { db } from "@/data/db";
import { shared_answer } from "@/data/schema";

const LIVE_SHARE_LIMIT = 200;

export interface ShareRow {
  id: string;
  accountId: string;
  conversationId: string | null;
  conversationTitle: string;
  questionText: string;
  answerJson: string;
  answer: OakAnswer;
  createdAt: number;
  revokedAt: number | null;
}

function codedError(code: string, message = code): Error {
  const err = new Error(message);
  (err as Error & { code: string }).code = code;
  return err;
}

function toRow(r: {
  id: string;
  accountId: string;
  conversationId: string | null;
  conversationTitle: string;
  questionText: string;
  answerJson: string;
  createdAt: number;
  revokedAt: number | null;
}): ShareRow {
  return {
    ...r,
    answer: JSON.parse(r.answerJson) as OakAnswer,
  };
}

export async function createShare(input: {
  accountId: string;
  conversationId: string;
  conversationTitle: string;
  questionText: string;
  answer: OakAnswer;
}): Promise<{ id: string }> {
  const live = await countLiveShares(input.accountId);
  if (live >= LIVE_SHARE_LIMIT) {
    throw codedError("share_limit");
  }

  const id = nanoid(21);
  await db.insert(shared_answer).values({
    id,
    account_id: input.accountId,
    conversation_id: input.conversationId,
    conversation_title: input.conversationTitle,
    question_text: input.questionText,
    answer_json: JSON.stringify(input.answer),
    created_at: Date.now(),
    revoked_at: null,
  });
  return { id };
}

export async function getLiveShare(id: string): Promise<ShareRow | null> {
  const rows = await db
    .select({
      id: shared_answer.id,
      accountId: shared_answer.account_id,
      conversationId: shared_answer.conversation_id,
      conversationTitle: shared_answer.conversation_title,
      questionText: shared_answer.question_text,
      answerJson: shared_answer.answer_json,
      createdAt: shared_answer.created_at,
      revokedAt: shared_answer.revoked_at,
    })
    .from(shared_answer)
    .where(and(eq(shared_answer.id, id), isNull(shared_answer.revoked_at)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  // Corrupt answer_json is indistinguishable from missing (SHARE-BR-6):
  // the public viewer must not 500 on a bad snapshot.
  try {
    return toRow(row);
  } catch {
    return null;
  }
}

export async function listLiveShares(accountId: string): Promise<ShareRow[]> {
  const rows = await db
    .select({
      id: shared_answer.id,
      accountId: shared_answer.account_id,
      conversationId: shared_answer.conversation_id,
      conversationTitle: shared_answer.conversation_title,
      questionText: shared_answer.question_text,
      answerJson: shared_answer.answer_json,
      createdAt: shared_answer.created_at,
      revokedAt: shared_answer.revoked_at,
    })
    .from(shared_answer)
    .where(
      and(
        eq(shared_answer.account_id, accountId),
        isNull(shared_answer.revoked_at),
      ),
    )
    .orderBy(desc(shared_answer.created_at));
  return rows.map(toRow);
}

export async function revokeShare(
  accountId: string,
  id: string,
): Promise<boolean> {
  const updated = await db
    .update(shared_answer)
    .set({ revoked_at: Date.now() })
    .where(
      and(
        eq(shared_answer.account_id, accountId),
        eq(shared_answer.id, id),
        isNull(shared_answer.revoked_at),
      ),
    )
    .returning({ id: shared_answer.id });
  return updated.length > 0;
}

export async function deleteSharesForAccount(accountId: string): Promise<void> {
  await db.delete(shared_answer).where(eq(shared_answer.account_id, accountId));
}

export async function countLiveShares(accountId: string): Promise<number> {
  const rows = await db
    .select({
      n: sql<number>`count(*)`.mapWith(Number),
    })
    .from(shared_answer)
    .where(
      and(
        eq(shared_answer.account_id, accountId),
        isNull(shared_answer.revoked_at),
      ),
    );
  return rows[0]?.n ?? 0;
}
