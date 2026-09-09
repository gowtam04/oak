/**
 * Tests for `GET /api/conversations/[id]/export?format=md|pdf` (chat-qol
 * Phase 5). Signed-in only. Body is questions + answers + tables for that
 * conversation — never a zip of all history, never the live tool-activity
 * trace (EXP-BR-1). The file is produced for the owner (EXP-BR-2).
 *
 * Real migrated Postgres (Testcontainers); only `getCurrentAccount` is mocked.
 *
 * Requirement refs: EXP-US-1, EXP-US-2, EXP-AC-1.1, EXP-AC-1.2, EXP-AC-2.1,
 * EXP-BR-1, EXP-BR-2.
 */

import { inflateSync } from "node:zlib";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { OakAnswer } from "@/agent/schemas";

vi.mock("server-only", () => ({}));

const cu = vi.hoisted(() => ({
  getCurrentAccount: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/server/auth/current-user", () => cu);

import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../../../../test/support/pg";

const ACCT_A = "acct-a";
const ACCT_B = "acct-b";
const SV = "scarlet-violet";

const Q = "What beats Garchomp in SV OU?";
const A = "Use a bulky Ice-type such as Baxcalibur.";
const OTHER_Q = "UNIQUE_QUESTION_BRAVO_SHOULD_NOT_LEAK";

const ANSWER: OakAnswer = {
  status: "answered",
  answer_markdown: `${A}

| Name | Types | Speed |
| --- | --- | --- |
| Baxcalibur | Ice/Dragon | 87 |`,
  reasoning_markdown: "Called get_pokemon. tool_activity: fetching Garchomp…",
  citations: [],
  inferences: [],
  generation_basis: { generation: "gen-9", fallback: false },
  candidates: {
    total_count: 1,
    truncated: false,
    sort: null,
    shown: [
      {
        name: "Baxcalibur",
        dex_number: 998,
        types: ["ice", "dragon"],
        base_stats: {
          hp: 115,
          attack: 145,
          defense: 92,
          special_attack: 75,
          special_defense: 86,
          speed: 87,
        },
      },
    ],
  },
};

let fix: PgFixture;
let route: typeof import("./route");
let convRepo: typeof import("@/data/repos/conversation-repo");

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  await installAsSingleton(fix);
  route = await import("./route");
  convRepo = await import("@/data/repos/conversation-repo");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(
    sql`TRUNCATE TABLE conversation, conversation_message RESTART IDENTITY`,
  );
  cu.getCurrentAccount.mockReset();
});

// --- Helpers ---------------------------------------------------------------

function signedIn(id: string): void {
  cu.getCurrentAccount.mockResolvedValue({
    id,
    email: `${id}@x.test`,
    createdAt: 0,
    lastUsedScope: null,
  });
}
function guest(): void {
  cu.getCurrentAccount.mockResolvedValue(null);
}

const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

function exportReq(id: string, format: string): Promise<Response> {
  return route.GET(
    new Request(`http://t/api/conversations/${id}/export?format=${format}`),
    idCtx(id),
  );
}

function errorCode(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const rec = body as { error?: unknown; code?: unknown };
  if (typeof rec.error === "string") return rec.error;
  if (typeof rec.code === "string") return rec.code;
  return undefined;
}

function dispositionFilename(res: Response): string | null {
  const cd = res.headers.get("content-disposition") ?? "";
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(cd);
  if (star?.[1]) {
    return decodeURIComponent(star[1].replace(/["']/g, "").trim());
  }
  const plain = /filename=([^;]+)/i.exec(cd);
  if (!plain?.[1]) return null;
  return plain[1].replace(/^["']|["']$/g, "").trim();
}

function pdfHaystack(buf: Buffer): string {
  const raw = buf.toString("latin1");
  const decoded: string[] = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (const match of raw.matchAll(re)) {
    const payload = match[1];
    if (!payload) continue;
    let content = payload;
    try {
      content = inflateSync(Buffer.from(payload, "latin1")).toString("latin1");
    } catch {
      // not a flate stream
    }
    if (content.includes("TJ") || content.includes("Tj")) {
      decoded.push(decodeTjHex(content));
    }
  }
  // One string: kerned TJ shards (`Baxcalib` + `ur`) reassemble before toContain.
  return decoded.join("");
}

function decodeTjHex(content: string): string {
  const parts: string[] = [];
  for (const m of content.matchAll(/<([0-9A-Fa-f\s]+)>/g)) {
    const hex = (m[1] ?? "").replace(/\s+/g, "");
    if (hex.length < 2 || hex.length % 2 !== 0) continue;
    let s = "";
    for (let i = 0; i < hex.length; i += 2) {
      s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    }
    if (s.length > 0) parts.push(s);
  }
  return parts.join("");
}

async function seedConv(
  accountId: string,
  id: string,
  userMessage: string,
  answer: OakAnswer = ANSWER,
): Promise<void> {
  await convRepo.appendTurnPair({
    accountId,
    conversationId: id,
    format: SV,
    userTurnId: convRepo.newTurnId(),
    userMessage,
    assistantTurnId: convRepo.newTurnId(),
    answer,
    now: Date.now(),
  });
}

async function seedEmpty(accountId: string, id: string, title: string): Promise<void> {
  await fix.db.execute(sql`
    INSERT INTO conversation (id, account_id, title, format, pinned, created_at, updated_at)
    VALUES (${id}, ${accountId}, ${title}, ${SV}, 0, ${Date.now()}, ${Date.now()})
  `);
}

// --- format=md -------------------------------------------------------------

describe("GET /api/conversations/[id]/export?format=md — EXP-US-1", () => {
  it("returns a text/markdown attachment {title}.md with Q+A+tables (EXP-AC-1.1)", async () => {
    signedIn(ACCT_A);
    await seedConv(ACCT_A, "c-md", Q);
    await convRepo.renameConversation(ACCT_A, "c-md", "OU-lab");

    const res = await exportReq("c-md", "md");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/markdown/);
    expect(res.headers.get("content-type")).toMatch(/charset=utf-8/i);
    expect(res.headers.get("content-disposition")).toMatch(/attachment/i);
    expect(dispositionFilename(res)).toBe("OU-lab.md");

    const body = await res.text();
    expect(body).toContain(Q);
    expect(body).toContain(A);
    expect(body).toContain("|");
    expect(body).toContain("Baxcalibur");
    expect(body).toContain("87");
  });

  it("does not include the live tool-activity trace (EXP-AC-1.2, EXP-BR-1)", async () => {
    signedIn(ACCT_A);
    await seedConv(ACCT_A, "c-md", Q);

    const body = await (await exportReq("c-md", "md")).text();
    expect(body).not.toContain("tool_activity");
    expect(body).not.toContain("tool-activity");
    expect(body).not.toContain("fetching Garchomp");
  });

  it("exports only that conversation, never a zip of all history (EXP-BR-1)", async () => {
    signedIn(ACCT_A);
    await seedConv(ACCT_A, "c-keep", Q);
    await seedConv(ACCT_A, "c-other", OTHER_Q);

    const body = await (await exportReq("c-keep", "md")).text();
    expect(body).toContain(Q);
    expect(body).not.toContain(OTHER_Q);
  });
});

// --- format=pdf ------------------------------------------------------------

describe("GET /api/conversations/[id]/export?format=pdf — EXP-US-2", () => {
  it("returns an application/pdf attachment {title}.pdf of the same content (EXP-AC-2.1)", async () => {
    signedIn(ACCT_A);
    await seedConv(ACCT_A, "c-pdf", Q);
    await convRepo.renameConversation(ACCT_A, "c-pdf", "OU-lab");

    const res = await exportReq("c-pdf", "pdf");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/pdf/);
    expect(res.headers.get("content-disposition")).toMatch(/attachment/i);
    expect(dispositionFilename(res)).toBe("OU-lab.pdf");

    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
    const text = pdfHaystack(buf);
    expect(text).toContain(Q);
    expect(text).toContain(A);
    expect(text).not.toContain("tool_activity");
  });
});

// --- empty / isolation -----------------------------------------------------

describe("GET /api/conversations/[id]/export — empty + isolation", () => {
  it("empty conversation → 400 empty_conversation (EXP-AC-1.4)", async () => {
    signedIn(ACCT_A);
    await seedEmpty(ACCT_A, "c-empty", "Empty thread");

    const res = await exportReq("c-empty", "md");
    expect(res.status).toBe(400);
    expect(errorCode(await res.json())).toBe("empty_conversation");
  });

  it("guest → 401 unauthenticated, other account → 404 (EXP-BR-1, EXP-BR-2)", async () => {
    await seedConv(ACCT_A, "c-iso", Q);

    guest();
    const guestRes = await exportReq("c-iso", "md");
    expect(guestRes.status).toBe(401);
    const guestBody = (await guestRes.json()) as { error?: unknown };
    expect(guestBody.error).toBe("unauthenticated");

    signedIn(ACCT_B);
    expect((await exportReq("c-iso", "md")).status).toBe(404);
    expect((await exportReq("c-iso", "pdf")).status).toBe(404);
  });

  it("missing or unknown ?format= → 400 invalid_format", async () => {
    signedIn(ACCT_A);
    await seedConv(ACCT_A, "c-fmt", Q);

    const missing = await route.GET(
      new Request("http://t/api/conversations/c-fmt/export"),
      idCtx("c-fmt"),
    );
    expect(missing.status).toBe(400);
    expect(errorCode(await missing.json())).toBe("invalid_format");

    const unknown = await exportReq("c-fmt", "docx");
    expect(unknown.status).toBe(400);
    expect(errorCode(await unknown.json())).toBe("invalid_format");
  });
});
