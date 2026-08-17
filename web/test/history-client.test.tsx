/**
 * Unit tests for src/lib/api/history-client.ts (chat-history Phase 5). `fetch` is
 * stubbed; asserts the never-throw contract — success maps to typed values, and
 * HTTP errors / transport faults fold into safe defaults ([] / null / false).
 * Runs under the jsdom project (test/**\/*.test.tsx).
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bulkUpdate,
  deleteConversation,
  exportConversation,
  forkConversation,
  getConversation,
  importConversation,
  listConversations,
  renameConversation,
  setArchived,
  setFolder,
  setMessagePinned,
  setPinned,
} from "@/lib/api/history-client";
import type { OakAnswer } from "@/components/types";

function res(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

const ANSWER: OakAnswer = {
  status: "answered",
  answer_markdown: "hi",
  reasoning_markdown: "r",
  citations: [],
  inferences: [],
  generation_basis: { generation: "gen-9", fallback: false },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("listConversations", () => {
  it("returns the conversations array on 200", async () => {
    stubFetch(async () =>
      res(200, { conversations: [{ id: "a", title: "A", format: "scarlet-violet", pinned: false, updatedAt: 1 }] }),
    );
    const list = await listConversations();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("a");
  });

  it("passes q and format as query params", async () => {
    const fetchMock = vi.fn(async () => res(200, { conversations: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await listConversations({ q: "garchomp", format: "champions" });
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit?]>;
    const url = String(calls[0][0]);
    expect(url).toContain("q=garchomp");
    expect(url).toContain("format=champions");
  });

  it("passes folder_id / archived / include_archived as query params", async () => {
    const fetchMock = vi.fn(async () => res(200, { conversations: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await listConversations({
      folder_id: "unfiled",
      archived: true,
      include_archived: true,
    });
    const url = String(
      (fetchMock.mock.calls as unknown as Array<[string, RequestInit?]>)[0][0],
    );
    expect(url).toContain("folder_id=unfiled");
    expect(url).toContain("archived=1");
    expect(url).toContain("include_archived=1");
  });

  it("returns [] on a malformed body / error / network throw", async () => {
    stubFetch(async () => res(200, { nope: true }));
    expect(await listConversations()).toEqual([]);
    stubFetch(async () => {
      throw new Error("network");
    });
    expect(await listConversations()).toEqual([]);
  });
});

describe("getConversation", () => {
  it("returns the detail on 200", async () => {
    stubFetch(async () =>
      res(200, { id: "x", title: "T", format: "scarlet-violet", pinned: false, turns: [] }),
    );
    const detail = await getConversation("x");
    expect(detail?.id).toBe("x");
  });

  it("returns null on 404 and on a transport fault", async () => {
    stubFetch(async () => res(404, { code: "not_found" }));
    expect(await getConversation("x")).toBeNull();
    stubFetch(async () => {
      throw new Error("network");
    });
    expect(await getConversation("x")).toBeNull();
  });
});

describe("renameConversation / setPinned", () => {
  it("returns true on 200 and sends the right PATCH body", async () => {
    const fetchMock = vi.fn(async () => res(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit?]>;

    expect(await renameConversation("id1", "New")).toBe(true);
    const init = calls[0][1]!;
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ title: "New" });

    expect(await setPinned("id1", true)).toBe(true);
    expect(JSON.parse(calls[1][1]!.body as string)).toEqual({ pinned: true });
  });

  it("returns false on a non-ok response / throw", async () => {
    stubFetch(async () => res(404, { code: "not_found" }));
    expect(await renameConversation("id1", "x")).toBe(false);
    stubFetch(async () => {
      throw new Error("network");
    });
    expect(await setPinned("id1", false)).toBe(false);
  });
});

describe("deleteConversation", () => {
  it("treats 200 and 404 as success (idempotent), 500 as failure", async () => {
    stubFetch(async () => res(200, { ok: true }));
    expect(await deleteConversation("id1")).toBe(true);
    stubFetch(async () => res(404, { code: "not_found" }));
    expect(await deleteConversation("id1")).toBe(true);
    stubFetch(async () => res(500, {}));
    expect(await deleteConversation("id1")).toBe(false);
  });
});

describe("importConversation", () => {
  it("returns the id on success", async () => {
    stubFetch(async () => res(200, { id: "sess-1" }));
    expect(await importConversation("sess-1", [
      { id: "t1", role: "user", content: "hi" },
      { id: "t2", role: "assistant", answer: ANSWER },
    ], "champions")).toBe("sess-1");
  });

  it("sends the format and no champions_mode", async () => {
    const fetchMock = vi.fn(async () => res(200, { id: "sess-1" }));
    vi.stubGlobal("fetch", fetchMock);
    await importConversation("sess-1", [], "gen-7");
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit?]>;
    const body = JSON.parse(calls[0][1]!.body as string);
    expect(body).toEqual({ session_id: "sess-1", format: "gen-7", turns: [] });
    expect(body.champions_mode).toBeUndefined();
  });

  it("returns null when the body id is null / non-ok / throw", async () => {
    stubFetch(async () => res(200, { id: null }));
    expect(await importConversation("s", [], "champions")).toBeNull();
    stubFetch(async () => res(401, { code: "unauthorized" }));
    expect(await importConversation("s", [], "champions")).toBeNull();
    stubFetch(async () => {
      throw new Error("network");
    });
    expect(await importConversation("s", [], "champions")).toBeNull();
  });
});

describe("setArchived / setFolder", () => {
  it("PATCHes archived and folder_id (including null unfile)", async () => {
    const fetchMock = vi.fn(async () => res(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit?]>;

    expect(await setArchived("id1", true)).toBe(true);
    expect(JSON.parse(calls[0][1]!.body as string)).toEqual({ archived: true });

    expect(await setFolder("id1", "f1")).toBe(true);
    expect(JSON.parse(calls[1][1]!.body as string)).toEqual({ folder_id: "f1" });

    expect(await setFolder("id1", null)).toBe(true);
    expect(JSON.parse(calls[2][1]!.body as string)).toEqual({ folder_id: null });
  });
});

describe("bulkUpdate", () => {
  it("sends folder_id only when the caller passed string | null", async () => {
    const fetchMock = vi.fn(async () =>
      res(200, { updated: ["a"], skipped: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit?]>;

    expect(await bulkUpdate(["a"], "archive")).toEqual({
      updated: ["a"],
      skipped: [],
    });
    expect(JSON.parse(calls[0][1]!.body as string)).toEqual({
      ids: ["a"],
      action: "archive",
    });

    expect(await bulkUpdate(["a"], "move", "f1")).toEqual({
      updated: ["a"],
      skipped: [],
    });
    expect(JSON.parse(calls[1][1]!.body as string)).toEqual({
      ids: ["a"],
      action: "move",
      folder_id: "f1",
    });

    expect(await bulkUpdate(["a"], "move", null)).toEqual({
      updated: ["a"],
      skipped: [],
    });
    expect(JSON.parse(calls[2][1]!.body as string)).toEqual({
      ids: ["a"],
      action: "move",
      folder_id: null,
    });

    expect(await bulkUpdate(["a"], "move")).toEqual({
      updated: ["a"],
      skipped: [],
    });
    expect(JSON.parse(calls[3][1]!.body as string)).toEqual({
      ids: ["a"],
      action: "move",
    });
    expect(JSON.parse(calls[3][1]!.body as string)).not.toHaveProperty("folder_id");
  });

  it("returns null on a non-ok response / throw", async () => {
    stubFetch(async () => res(400, { code: "invalid_request" }));
    expect(await bulkUpdate(["a"], "delete")).toBeNull();
    stubFetch(async () => {
      throw new Error("network");
    });
    expect(await bulkUpdate(["a"], "delete")).toBeNull();
  });
});

describe("forkConversation / setMessagePinned", () => {
  it("returns the created fork and the pin list", async () => {
    stubFetch(async () => res(201, { id: "new", title: "rain team (fork)" }));
    expect(await forkConversation("src", "asst-1")).toEqual({
      id: "new",
      title: "rain team (fork)",
    });

    stubFetch(async () => res(200, { pinnedMessageIds: ["m1", "m2"] }));
    expect(await setMessagePinned("c", "m2", true)).toEqual(["m1", "m2"]);
  });

  it("returns null on failure / throw", async () => {
    stubFetch(async () => res(404, { code: "not_found" }));
    expect(await forkConversation("src", "m")).toBeNull();
    stubFetch(async () => {
      throw new Error("network");
    });
    expect(await setMessagePinned("c", "m", false)).toBeNull();
  });
});

describe("exportConversation", () => {
  function exportRes(
    status: number,
    bytes: Uint8Array,
    disposition?: string,
  ): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-disposition" ? (disposition ?? null) : null,
      },
    } as unknown as Response;
  }

  it("returns bytes + filename from Content-Disposition", async () => {
    const bytes = new TextEncoder().encode("# rain team");
    stubFetch(async () =>
      exportRes(
        200,
        bytes,
        'attachment; filename="rain-team.md"; filename*=UTF-8\'\'rain%20team.md',
      ),
    );
    const out = await exportConversation("c1", "md");
    expect(out?.filename).toBe("rain team.md");
    expect(out && new TextDecoder().decode(out.bytes)).toBe("# rain team");
  });

  it("falls back to conversation.{format} when the header is missing", async () => {
    stubFetch(async () => exportRes(200, new Uint8Array([1, 2, 3])));
    const out = await exportConversation("c1", "pdf");
    expect(out).toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      filename: "conversation.pdf",
    });
  });

  it("returns null on a non-ok response / throw", async () => {
    stubFetch(async () => exportRes(401, new Uint8Array()));
    expect(await exportConversation("c1", "md")).toBeNull();
    stubFetch(async () => {
      throw new Error("network");
    });
    expect(await exportConversation("c1", "pdf")).toBeNull();
  });
});
