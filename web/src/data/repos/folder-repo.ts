/**
 * src/data/repos/folder-repo.ts — conversation folders (chat-qol ORG-BR-1).
 *
 * create / list / rename / delete. Delete unfiles conversations in the same
 * transaction. Unique per account ILIKE; 50-folder cap.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, eq, ne, sql } from "drizzle-orm";

import { db } from "@/data/db";
import { conversation, conversation_folder } from "@/data/schema";

const FOLDER_NAME_MAX = 40;
const FOLDER_LIMIT = 50;

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

function codedError(code: string, message = code): Error {
  const err = new Error(message);
  (err as Error & { code: string }).code = code;
  return err;
}

function normalizeName(raw: string): string {
  const name = raw.trim();
  if (name.length < 1 || name.length > FOLDER_NAME_MAX) {
    throw new Error("folder name must be 1–40 characters");
  }
  return name;
}

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  while (current && typeof current === "object") {
    if ("code" in current && (current as { code: unknown }).code === "23505") {
      return true;
    }
    current = "cause" in current ? (current as { cause: unknown }).cause : undefined;
  }
  return false;
}

export async function createFolder(
  accountId: string,
  name: string,
): Promise<{ id: string; name: string; createdAt: number }> {
  const trimmed = normalizeName(name);

  const countRows = await db
    .select({
      n: sql<number>`count(*)`.mapWith(Number),
    })
    .from(conversation_folder)
    .where(eq(conversation_folder.account_id, accountId));
  if ((countRows[0]?.n ?? 0) >= FOLDER_LIMIT) {
    throw codedError("folder_limit");
  }

  const taken = await db
    .select({ id: conversation_folder.id })
    .from(conversation_folder)
    .where(
      and(
        eq(conversation_folder.account_id, accountId),
        sql`lower(${conversation_folder.name}) = ${trimmed.toLowerCase()}`,
      ),
    )
    .limit(1);
  if (taken.length > 0) {
    throw codedError("folder_name_taken");
  }

  const id = randomUUID();
  const createdAt = Date.now();
  try {
    await db.insert(conversation_folder).values({
      id,
      account_id: accountId,
      name: trimmed,
      created_at: createdAt,
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw codedError("folder_name_taken");
    throw err;
  }
  return { id, name: trimmed, createdAt };
}

export async function listFolders(
  accountId: string,
): Promise<{ id: string; name: string; createdAt: number }[]> {
  const rows = await db
    .select({
      id: conversation_folder.id,
      name: conversation_folder.name,
      createdAt: conversation_folder.created_at,
    })
    .from(conversation_folder)
    .where(eq(conversation_folder.account_id, accountId))
    .orderBy(asc(conversation_folder.name));
  return rows;
}

export async function renameFolder(
  accountId: string,
  id: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const trimmed = normalizeName(name);

  const existing = await db
    .select({ id: conversation_folder.id })
    .from(conversation_folder)
    .where(
      and(
        eq(conversation_folder.account_id, accountId),
        eq(conversation_folder.id, id),
      ),
    )
    .limit(1);
  if (existing.length === 0) {
    throw new Error("folder not found");
  }

  const taken = await db
    .select({ id: conversation_folder.id })
    .from(conversation_folder)
    .where(
      and(
        eq(conversation_folder.account_id, accountId),
        ne(conversation_folder.id, id),
        sql`lower(${conversation_folder.name}) = ${trimmed.toLowerCase()}`,
      ),
    )
    .limit(1);
  if (taken.length > 0) {
    throw codedError("folder_name_taken");
  }

  try {
    await db
      .update(conversation_folder)
      .set({ name: trimmed })
      .where(
        and(
          eq(conversation_folder.account_id, accountId),
          eq(conversation_folder.id, id),
        ),
      );
  } catch (err) {
    if (isUniqueViolation(err)) throw codedError("folder_name_taken");
    throw err;
  }
  return { id, name: trimmed };
}

export async function deleteFolder(accountId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: conversation_folder.id })
      .from(conversation_folder)
      .where(
        and(
          eq(conversation_folder.account_id, accountId),
          eq(conversation_folder.id, id),
        ),
      )
      .limit(1);
    if (existing.length === 0) {
      throw new Error("folder not found");
    }

    await tx
      .update(conversation)
      .set({ folder_id: null })
      .where(
        and(
          eq(conversation.account_id, accountId),
          eq(conversation.folder_id, id),
        ),
      );
    await tx
      .delete(conversation_folder)
      .where(
        and(
          eq(conversation_folder.account_id, accountId),
          eq(conversation_folder.id, id),
        ),
      );
  });
}
