/**
 * FULL-STACK (frontend) — chat-qol Phase 8 web UI on the real <Home/>.
 *
 * Stubbed `fetch` + SSE. Never imports db/repos/runtime. Vitest jsdom.
 *
 * Test focus (implementation-plan Phase 8):
 *   undo calls stop; retry keeps old card until answer; regulation chip is
 *   display-only (no PUT /api/scope); empty desk recents; palette lists; guest
 *   hides share/pin/fork. Also slash intercept + ADR-15 shortcuts.
 *
 * Refs: REC-US-1/2/3, COPY-US-1, SHARE-US-1, NAV-US-1/2, EMPTY-US-1,
 * SCOPE-US-1, SLASH-US-1, MEN-AC-1.5, PIN-AC-1.5, FORK-AC-1.5, ADR-3/8/10/15.
 */

import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
  waitFor,
  within,
} from "@testing-library/react";

import Home from "@/app/page";
import { formatSseEvent } from "@/lib/sse/sse-types";
import { CANONICAL_ANSWER, MINIMAL_ANSWER } from "@/components/test-fixtures";
import type { ChatTurn, OakAnswer } from "@/components/types";
import { CHAMPIONS_REGULATION } from "@/data/formats";

const EMAIL = "ash@pallet.town";

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

interface ServerConvo {
  id: string;
  title: string;
  format: string;
  pinned: boolean;
  archived?: boolean;
  folderId?: string | null;
  updatedAt: number;
  turns: ChatTurn[];
}

interface HeldStream {
  response: Response;
  push: (chunk: string) => void;
  close: () => void;
}

type ChatBody = {
  session_id: string;
  message: string;
  scope_seed?: string;
  recovery?: "retry" | "edit";
  mentioned_team_ids?: string[];
};

let meState: {
  signedIn: boolean;
  email?: string;
  lastUsedScope?: string;
  lastUsedScopes?: string[];
};
let serverConvos: ServerConvo[];
let teams: { id: string; name: string; format: string }[];
let clock: number;
let chatBodies: ChatBody[];
let scopePuts: Array<{
  format?: string;
  conversation_id?: string | null;
  session_id?: string;
  querySessionId?: string | null;
}>;
let stopUrls: string[];
let nextAnswer: OakAnswer;
/** When set, the next /api/chat returns this held stream (consumed once). */
let nextHeld: HeldStream | null;
let turnSeq: number;

function makeStorageStub(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

function holdStream(): HeldStream {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: { ok: true, status: 200, statusText: "OK", body } as unknown as Response,
    push(chunk: string) {
      controller.enqueue(new TextEncoder().encode(chunk));
    },
    close() {
      controller.close();
    },
  };
}

function completeSse(answer: OakAnswer): Response {
  const held = holdStream();
  const turnId = `turn-${++turnSeq}`;
  held.push(formatSseEvent("turn", { turn_id: turnId }));
  held.push(formatSseEvent("scope", { format: "national-dex", source: "default" }));
  held.push(formatSseEvent("answer", { answer }));
  held.close();
  return held.response;
}

function seedConvo(c: Partial<ServerConvo> & { id: string; title: string }): void {
  serverConvos.push({
    format: "scarlet-violet",
    pinned: false,
    updatedAt: ++clock,
    turns: [],
    ...c,
  });
}

beforeEach(() => {
  meState = { signedIn: false };
  serverConvos = [];
  teams = [];
  clock = 0;
  chatBodies = [];
  scopePuts = [];
  stopUrls = [];
  nextAnswer = { ...MINIMAL_ANSWER, answer_markdown: "Yes, Garchomp can learn Earthquake." };
  nextHeld = null;
  turnSeq = 0;
  routerPush.mockReset();
  vi.stubGlobal("localStorage", makeStorageStub());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const parsed = new URL(String(url), "http://localhost");
      const path = parsed.pathname;
      const method = init?.method ?? "GET";

      if (path === "/api/auth/me") return jsonResponse(200, meState);
      if (path === "/api/auth/request-code") return jsonResponse(200, { ok: true });
      if (path === "/api/auth/verify") {
        meState = {
          signedIn: true,
          email: EMAIL,
          lastUsedScope: meState.lastUsedScope,
          lastUsedScopes: meState.lastUsedScopes ?? [],
        };
        return jsonResponse(200, { ok: true, email: EMAIL, created: true });
      }
      if (path === "/api/auth/signout") {
        meState = { signedIn: false };
        return jsonResponse(200, { ok: true });
      }

      if (path === "/api/chat") {
        const body = JSON.parse(init!.body!) as ChatBody;
        chatBodies.push(body);
        if (nextHeld) {
          const held = nextHeld;
          nextHeld = null;
          const turnId = `turn-${++turnSeq}`;
          held.push(formatSseEvent("turn", { turn_id: turnId }));
          held.push(
            formatSseEvent("scope", { format: "national-dex", source: "conversation" }),
          );
          return held.response;
        }
        return completeSse({
          ...nextAnswer,
          answer_markdown: nextAnswer.answer_markdown,
        });
      }

      if (path.startsWith("/api/chat/turns/") && path.endsWith("/stop") && method === "POST") {
        stopUrls.push(path);
        return jsonResponse(200, { status: "stopped" });
      }

      if (path === "/api/scope" && method === "PUT") {
        const body = JSON.parse(init!.body!) as {
          format?: string;
          conversation_id?: string | null;
          session_id?: string;
        };
        scopePuts.push({
          ...body,
          querySessionId: parsed.searchParams.get("session_id"),
        });
        const format = body.format ?? "national-dex";
        if (meState.signedIn) {
          const prev = (meState.lastUsedScopes ?? []).filter((f) => f !== format);
          meState.lastUsedScope = format;
          meState.lastUsedScopes = [format, ...prev];
          if (typeof body.conversation_id === "string") {
            const convo = serverConvos.find((c) => c.id === body.conversation_id);
            if (convo) convo.format = format;
          }
          return jsonResponse(200, {
            format,
            lastUsedScopes: meState.lastUsedScopes,
          });
        }
        return jsonResponse(200, { format });
      }

      if (path === "/api/conversations" && method === "GET") {
        const archived = parsed.searchParams.get("archived") === "1";
        const list = serverConvos
          .filter((c) => (archived ? c.archived : !c.archived))
          .sort(
            (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
          )
          .map((c) => ({
            id: c.id,
            title: c.title,
            format: c.format,
            pinned: c.pinned,
            updatedAt: c.updatedAt,
            archived: Boolean(c.archived),
            folderId: c.folderId ?? null,
          }));
        return jsonResponse(200, { conversations: list });
      }
      if (path === "/api/conversations/import" && method === "POST") {
        return jsonResponse(200, { id: null });
      }
      if (path.startsWith("/api/conversations/") && method === "GET") {
        const id = decodeURIComponent(path.slice("/api/conversations/".length));
        const convo = serverConvos.find((c) => c.id === id);
        if (!convo) return jsonResponse(404, { code: "not_found" });
        return jsonResponse(200, {
          id: convo.id,
          title: convo.title,
          format: convo.format,
          pinned: convo.pinned,
          turns: convo.turns,
          archived: Boolean(convo.archived),
          folderId: convo.folderId ?? null,
          pinnedMessageIds: [],
        });
      }

      if (path === "/api/folders") return jsonResponse(200, { folders: [] });
      if (path === "/api/teams") {
        return jsonResponse(200, {
          teams: teams.map((t) => ({
            id: t.id,
            name: t.name,
            format: t.format,
            memberCount: 6,
            incomplete: false,
            updatedAt: 1,
          })),
        });
      }
      if (path === "/api/shares") return jsonResponse(200, { shares: [] });
      if (path === "/api/search") return jsonResponse(200, { matches: [] });
      if (path === "/api/entity") {
        return jsonResponse(200, { status: "not_found" });
      }

      throw new Error(`unexpected fetch: ${method} ${path}`);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function send(text: string, assistantCount: number) {
  fireEvent.change(screen.getByTestId("composer-input"), {
    target: { value: text },
  });
  await act(async () => {
    fireEvent.click(screen.getByTestId("composer-send"));
  });
  if (assistantCount > 0) {
    await waitFor(() =>
      expect(screen.getAllByTestId("assistant-turn")).toHaveLength(assistantCount),
    );
  }
}

const REGULATION_RE = new RegExp(
  `${CHAMPIONS_REGULATION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|${CHAMPIONS_REGULATION.replace(/^Regulation\b/, "Reg").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
);

describe("Home — undo send (REC-US-3, ADR-3)", () => {
  it("offers Undo on the just-sent bubble and Stop-cancels the turn (REC-AC-3.1, REC-AC-3.2)", async () => {
    const held = holdStream();
    nextHeld = held;
    render(<Home />);
    await screen.findByTestId("composer");

    fireEvent.change(screen.getByTestId("composer-input"), {
      target: { value: "oops accidental send" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("composer-send"));
    });

    expect(screen.getByTestId("user-turn")).toHaveTextContent("oops accidental send");
    const undo = await screen.findByRole("button", { name: /^undo$/i });
    await act(async () => {
      fireEvent.click(undo);
    });

    await waitFor(() => expect(stopUrls.length).toBeGreaterThan(0));
    expect(stopUrls.at(-1)).toMatch(/\/api\/chat\/turns\/.+\/stop/);
    expect(
      (screen.getByTestId("composer-input") as HTMLTextAreaElement).value,
    ).toBe("oops accidental send");
    expect(screen.queryByTestId("user-turn")).not.toBeInTheDocument();
    expect(screen.queryByTestId("assistant-turn")).not.toBeInTheDocument();
  });
});

describe("Home — retry / edit keep the old card (REC-US-1/2)", () => {
  it("retries the last answer without dropping the old card until success (REC-AC-1.1..1.3)", async () => {
    render(<Home />);
    await screen.findByTestId("composer");
    await send("Garchomp speed?", 1);
    expect(screen.getByTestId("assistant-turn")).toHaveTextContent(
      "Yes, Garchomp can learn Earthquake.",
    );

    const held = holdStream();
    nextHeld = held;
    nextAnswer = { ...MINIMAL_ANSWER, answer_markdown: "Base Speed is 102." };
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^retry$/i }));
    });

    await waitFor(() => expect(chatBodies.at(-1)?.recovery).toBe("retry"));
    expect(chatBodies.at(-1)?.message).toBe("Garchomp speed?");
    expect(screen.getByTestId("assistant-turn")).toHaveTextContent(
      "Yes, Garchomp can learn Earthquake.",
    );
    expect(screen.getAllByTestId("assistant-turn")).toHaveLength(1);

    await act(async () => {
      held.push(
        formatSseEvent("answer", {
          answer: { ...MINIMAL_ANSWER, answer_markdown: "Base Speed is 102." },
        }),
      );
      held.close();
    });

    await waitFor(() =>
      expect(screen.getByTestId("assistant-turn")).toHaveTextContent(
        "Base Speed is 102.",
      ),
    );
    expect(screen.getAllByTestId("assistant-turn")).toHaveLength(1);
    expect(screen.getAllByTestId("user-turn")).toHaveLength(1);
  });

  it("edits the last user message and replaces the pair only on success (REC-AC-2.1, REC-AC-2.3)", async () => {
    render(<Home />);
    await screen.findByTestId("composer");
    await send("Garchomp sped?", 1);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    const input = screen.getByTestId("composer-input") as HTMLTextAreaElement;
    expect(input.value).toBe("Garchomp sped?");
    fireEvent.change(input, { target: { value: "Garchomp speed in Gen 7?" } });

    const held = holdStream();
    nextHeld = held;
    await act(async () => {
      fireEvent.click(screen.getByTestId("composer-send"));
    });

    await waitFor(() => expect(chatBodies.at(-1)?.recovery).toBe("edit"));
    expect(chatBodies.at(-1)?.message).toBe("Garchomp speed in Gen 7?");
    expect(screen.getByText("Garchomp sped?")).toBeInTheDocument();
    expect(screen.getByTestId("assistant-turn")).toHaveTextContent(
      "Yes, Garchomp can learn Earthquake.",
    );

    await act(async () => {
      held.push(
        formatSseEvent("answer", {
          answer: { ...MINIMAL_ANSWER, answer_markdown: "102 in USUM." },
        }),
      );
      held.close();
    });

    await waitFor(() =>
      expect(screen.getByTestId("assistant-turn")).toHaveTextContent("102 in USUM."),
    );
    expect(screen.getByText("Garchomp speed in Gen 7?")).toBeInTheDocument();
    expect(screen.queryByText("Garchomp sped?")).toBeNull();
    expect(screen.getAllByTestId("user-turn")).toHaveLength(1);
  });
});

describe("Home — regulation chip (CF-UI-US-2)", () => {
  it("shows the current Champions regulation; click opens no menu and does not PUT /api/scope", async () => {
    render(<Home />);
    await screen.findByTestId("composer");
    const chip = screen.getByTestId("scope-chip");
    expect(chip).toHaveTextContent(REGULATION_RE);
    fireEvent.click(chip);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByTestId("scope-chip-menu")).toBeNull();
    expect(screen.queryByTestId("scope-chip-option-gen-7")).toBeNull();
    expect(scopePuts).toHaveLength(0);
    expect(chatBodies).toHaveLength(0);
  });

  it("stays on Champions regulation for a signed-in empty chat with no PUT", async () => {
    meState = {
      signedIn: true,
      email: EMAIL,
      lastUsedScope: "gen-7",
      lastUsedScopes: ["gen-7"],
    };
    render(<Home />);
    await screen.findByTestId("history-sidebar");
    fireEvent.click(screen.getByTestId("scope-chip"));
    expect(screen.getByTestId("scope-chip")).toHaveTextContent(REGULATION_RE);
    expect(screen.getByTestId("scope-chip")).not.toHaveTextContent(/Gen 7/i);
    expect(scopePuts).toHaveLength(0);
    expect(chatBodies).toHaveLength(0);
  });
});

describe("Home — empty desk (EMPTY-US-1)", () => {
  it("shows continue-last, last team, current scope, and four starters when signed in (EMPTY-AC-1.1)", async () => {
    seedConvo({ id: "c-rain", title: "Rain vs sun", format: "scarlet-violet" });
    teams = [{ id: "team-rain", name: "Rain Offense", format: "scarlet-violet" }];
    meState = {
      signedIn: true,
      email: EMAIL,
      lastUsedScope: "scarlet-violet",
      lastUsedScopes: ["scarlet-violet"],
    };
    render(<Home />);
    await screen.findByTestId("chat-empty");

    expect(screen.getByTestId("empty-desk-continue")).toHaveTextContent(
      "Rain vs sun",
    );
    expect(screen.getByTestId("empty-desk-last-team")).toHaveTextContent(
      "Rain Offense",
    );
    const deskScope = screen.getByTestId("empty-desk-scope");
    expect(deskScope).toHaveTextContent(REGULATION_RE);
    expect(deskScope).not.toHaveTextContent(/National Dex/i);
    expect(deskScope).not.toHaveTextContent(/Scarlet/i);
    expect(deskScope).not.toHaveTextContent(/\bGen [1-8]\b/);
    expect(screen.getAllByTestId("chat-empty-example")).toHaveLength(4);
  });

  it("keeps only the four starters for guests (EMPTY-AC-1.2)", async () => {
    render(<Home />);
    await screen.findByTestId("chat-empty");
    expect(screen.getAllByTestId("chat-empty-example")).toHaveLength(4);
    expect(screen.queryByTestId("empty-desk-continue")).toBeNull();
    expect(screen.queryByTestId("empty-desk-last-team")).toBeNull();
  });

  it("omits continue-last / last-team when a signed-in user has nothing yet (EMPTY-AC-1.3)", async () => {
    meState = { signedIn: true, email: EMAIL, lastUsedScopes: [] };
    render(<Home />);
    await screen.findByTestId("chat-empty");
    expect(screen.getAllByTestId("chat-empty-example")).toHaveLength(4);
    expect(screen.queryByTestId("empty-desk-continue")).toBeNull();
    expect(screen.queryByTestId("empty-desk-last-team")).toBeNull();
  });
});

describe("Home — palette and shortcuts (NAV-US-1/2, ADR-15)", () => {
  it("opens the palette on ⌘K and lists New chat / Dex / usage (NAV-AC-1.1)", async () => {
    render(<Home />);
    await screen.findByTestId("composer");
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    const palette = await screen.findByTestId("command-palette");
    expect(within(palette).getByRole("option", { name: /new chat/i })).toBeInTheDocument();
    expect(
      within(palette).getByRole("option", { name: /dex|pok[eé]dex/i }),
    ).toBeInTheDocument();
    expect(
      within(palette).getByRole("option", { name: /usage|meta/i }),
    ).toBeInTheDocument();
    expect(within(palette).queryByText(/prompt library/i)).toBeNull();
  });

  it("lists signed-in conversation jumps and omits them for guests (NAV-AC-1.1, NAV-AC-1.2)", async () => {
    seedConvo({ id: "c-rain", title: "Rain vs sun" });
    meState = { signedIn: true, email: EMAIL, lastUsedScopes: [] };
    render(<Home />);
    await screen.findByTestId("history-sidebar");
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    const palette = await screen.findByTestId("command-palette");
    expect(within(palette).getByRole("option", { name: "Rain vs sun" })).toBeInTheDocument();
  });

  it("documents ADR-15 chords in the ? overlay (NAV-AC-2.2)", async () => {
    render(<Home />);
    await screen.findByTestId("composer");
    (screen.getByTestId("composer-input") as HTMLTextAreaElement).blur();
    fireEvent.keyDown(document, { key: "?" });
    const overlay = await screen.findByTestId("shortcut-overlay");
    expect(overlay).toHaveTextContent(/palette/i);
    expect(overlay).toHaveTextContent(/new chat/i);
    expect(overlay).toHaveTextContent(/focus composer/i);
    expect(overlay).toHaveTextContent(/stop/i);
    expect(overlay.textContent).toMatch(/⌘\s*K|Ctrl\+K/i);
    expect(overlay).not.toHaveTextContent(/scope picker/i);
    expect(overlay.textContent).not.toMatch(/⌘⇧S|Ctrl\+Shift\+S/i);
  });

  it("does not steal a typed ? from the focused composer (ADR-15, NAV-BR-2)", async () => {
    render(<Home />);
    const input = await screen.findByTestId("composer-input");
    input.focus();
    fireEvent.change(input, { target: { value: "?" } });
    fireEvent.keyDown(input, { key: "?" });
    expect((input as HTMLTextAreaElement).value).toContain("?");
    expect(screen.queryByTestId("shortcut-overlay")).toBeNull();
  });
});

describe("Home — slash intercept (SLASH-US-1, ADR-10)", () => {
  it("handles /new without POSTing a chat turn (SLASH-AC-1.1, SLASH-BR-2)", async () => {
    render(<Home />);
    await screen.findByTestId("composer");
    fireEvent.change(screen.getByTestId("composer-input"), {
      target: { value: "/new" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("composer-send"));
    });
    expect(chatBodies).toHaveLength(0);
    expect(screen.getByTestId("chat-empty")).toBeInTheDocument();
  });

  it("opens the calculator overlay for /calc without POSTing a chat turn (CALC-AC-3.1)", async () => {
    render(<Home />);
    await screen.findByTestId("composer");
    fireEvent.change(screen.getByTestId("composer-input"), {
      target: { value: "/calc garchomp earthquake" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("composer-send"));
    });
    expect(chatBodies).toHaveLength(0);
    expect(screen.getByTestId("calculator-overlay")).toBeInTheDocument();
  });

  it("sends an unknown slash as a normal message (SLASH-AC-1.5)", async () => {
    render(<Home />);
    await screen.findByTestId("composer");
    await send("/compare garchomp dragonite", 1);
    expect(chatBodies.at(-1)?.message).toBe("/compare garchomp dragonite");
    expect(chatBodies.at(-1)?.recovery).toBeUndefined();
  });

  it("navigates /dex without starting a turn (SLASH-AC-1.3)", async () => {
    render(<Home />);
    await screen.findByTestId("composer");
    fireEvent.change(screen.getByTestId("composer-input"), {
      target: { value: "/dex garchomp" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("composer-send"));
    });
    expect(chatBodies).toHaveLength(0);
    expect(routerPush).toHaveBeenCalled();
    const dest = String(routerPush.mock.calls[0]![0]);
    expect(dest).toMatch(/pokedex|dex/i);
  });
});

describe("Home — guest hides share / pin / fork / @ (AUTH)", () => {
  it("keeps recovery + human copy and hides Share, Pin, and Fork (SHARE-AC-1.2, PIN-AC-1.5, FORK-AC-1.5)", async () => {
    nextAnswer = CANONICAL_ANSWER;
    render(<Home />);
    await screen.findByTestId("composer");
    await send("What is Garchomp's Speed?", 1);

    expect(screen.getByRole("button", { name: /^retry$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /copy as human text/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^share$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^fork$/i })).toBeNull();
    expect(
      screen.queryAllByTestId("turn-actions").flatMap((el) =>
        within(el).queryAllByRole("button", { name: /^pin$/i }),
      ),
    ).toHaveLength(0);
    expect(screen.queryByTestId("pin-strip")).toBeNull();
  });

  it("does not open team autocomplete when a guest types @ (MEN-AC-1.5)", async () => {
    teams = [{ id: "team-rain", name: "Rain Offense", format: "scarlet-violet" }];
    render(<Home />);
    const input = await screen.findByTestId("composer-input");
    fireEvent.change(input, { target: { value: "@" } });
    expect(screen.queryByTestId("mention-autocomplete")).toBeNull();
  });

  it("lists saved teams when a signed-in user types @ (MEN-AC-1.1)", async () => {
    teams = [{ id: "team-rain", name: "Rain Offense", format: "scarlet-violet" }];
    meState = { signedIn: true, email: EMAIL, lastUsedScopes: [] };
    render(<Home />);
    await screen.findByTestId("history-sidebar");
    const input = screen.getByTestId("composer-input");
    fireEvent.change(input, { target: { value: "@" } });
    const ac = await screen.findByTestId("mention-autocomplete");
    expect(within(ac).getByText("Rain Offense")).toBeInTheDocument();
  });

  it("offers Share, Pin, and Fork once signed in", async () => {
    nextAnswer = CANONICAL_ANSWER;
    meState = { signedIn: true, email: EMAIL, lastUsedScopes: [] };
    seedConvo({
      id: "c1",
      title: "Speed",
      turns: [
        { id: "u1", role: "user", content: "Speed?" },
        { id: "a1", role: "assistant", answer: CANONICAL_ANSWER },
      ],
    });
    render(<Home />);
    await screen.findByTestId("history-sidebar");
    await act(async () => {
      fireEvent.click(screen.getByTitle("Speed"));
    });
    await waitFor(() => expect(screen.getByTestId("assistant-turn")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /^share$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^fork$/i })).toBeInTheDocument();
    expect(
      screen.getAllByTestId("turn-actions").some((el) =>
        within(el).queryByRole("button", { name: /^pin$/i }),
      ),
    ).toBe(true);
  });
});

describe("Home — follow-up chips (CHIP-US-1)", () => {
  it("renders hop chips from the structured answer, not a second toolbar", async () => {
    nextAnswer = CANONICAL_ANSWER;
    render(<Home />);
    await screen.findByTestId("composer");
    await send("Tell me about Garchomp", 1);
    expect(
      screen.getByRole("button", { name: "Open Garchomp in Dex" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /tell me more/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /add .+ to a team/i })).toBeNull();
  });
});
