/**
 * FULL-STACK (frontend) — slash-discovery P2 picker + intercept on <Home/>.
 *
 * Stubbed `fetch` + SSE. Never imports db/repos/runtime. Vitest jsdom.
 * Harness copied from page-chat-qol.fullstack.test.tsx (do not restripe that file).
 *
 * Test focus (architecture P2):
 *   type `/` → six command rows + caption; placeholder still Ask Oak;
 *   pick inserts trailing space without POST; Enter inserts (desktop);
 *   Send hops without /api/chat; /usage slug; unmatched /dex → /pokedex;
 *   /help prefills `/`; lone `/` stays; /foo is a message; edit last POSTs
 *   /new; images remain on hop; guest /team empty copy; @ hidden while
 *   slash picker visible; /calc overlay.
 *
 * Refs: SD-US-1, SD-US-2, SD-US-3, SD-US-4, SD-US-5, SD-US-6, SD-US-7,
 * SD-US-8, SD-AC-5.9, SD-BR-2, SD-BR-3, SD-BR-7, SD-BR-8, SD-BR-9,
 * SD-BR-11, SD-BR-12, SD-BR-13, SD-BR-14, SD-BR-16.
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

const imageAttachments = vi.hoisted(() => ({
  MAX_ATTACHMENTS: 4,
  filesToPendingImages: vi.fn(),
}));
vi.mock("@/lib/image-attachments", () => imageAttachments);

import Home from "@/app/page";
import { formatSseEvent } from "@/lib/sse/sse-types";
import { MINIMAL_ANSWER } from "@/components/test-fixtures";
import type { ChatTurn, OakAnswer, PendingImage } from "@/components/types";
import {
  EMPTY_TEAMS_GUEST,
  insertCommand,
  PICKER_CAPTION,
  SLASH_COMMANDS,
} from "@/lib/chat/slash-picker";

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

function stubDesktopMatchMedia(): void {
  window.matchMedia = vi.fn((query: string) => {
    const coarse = /\bpointer:\s*coarse\b/.test(query) || query.includes("coarse");
    const fine = /\bpointer:\s*fine\b/.test(query);
    return {
      matches: fine ? true : coarse ? false : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    };
  }) as unknown as typeof window.matchMedia;
}

function composerInput(): HTMLTextAreaElement {
  return screen.getByTestId("composer-input") as HTMLTextAreaElement;
}

async function clickSend(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId("composer-send"));
  });
}

function pngFile(name: string): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, {
    type: "image/png",
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
  stubDesktopMatchMedia();
  imageAttachments.filesToPendingImages.mockReset();
  imageAttachments.filesToPendingImages.mockResolvedValue({ images: [], errors: [] });
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
      if (path === "/api/search") {
        const kind = parsed.searchParams.get("kind");
        const q = (parsed.searchParams.get("q") ?? "").trim().toLowerCase();
        const hit = (name: string) => q.length === 0 || name.includes(q);
        const matches: Array<{
          slug: string;
          display_name: string;
          kind: string;
          sprite_url?: string;
        }> = [];
        if (kind === "pokemon" && hit("garchomp")) {
          matches.push({
            slug: "garchomp",
            display_name: "Garchomp",
            kind: "pokemon",
            sprite_url: "https://img.example/sprite/garchomp.png",
          });
        }
        if (kind === "move" && hit("metronome")) {
          matches.push({
            slug: "metronome",
            display_name: "Metronome",
            kind: "move",
          });
        }
        if (kind === "item" && hit("metronome")) {
          matches.push({
            slug: "metronome",
            display_name: "Metronome",
            kind: "item",
          });
        }
        return jsonResponse(200, { matches });
      }
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

function chatFetchCalls(): unknown[][] {
  return vi.mocked(fetch).mock.calls.filter(([url]) => {
    const path = new URL(String(url), "http://localhost").pathname;
    return path === "/api/chat";
  });
}

describe("Home — slash picker (SD-US-1, SD-BR-9)", () => {
  it("shows six command rows and Insert, then send; placeholder stays Ask Oak (SD-AC-1.1, SD-AC-1.5, SD-BR-9)", async () => {
    render(<Home />);
    const input = await screen.findByTestId("composer-input");
    expect(input).toHaveAttribute("placeholder", "Ask Oak");
    fireEvent.change(input, { target: { value: "/" } });
    const picker = await screen.findByTestId("slash-autocomplete");
    expect(within(picker).getByText(PICKER_CAPTION)).toBeInTheDocument();
    const options = within(picker).getAllByRole("option");
    expect(options).toHaveLength(6);
    for (const row of SLASH_COMMANDS) {
      expect(
        within(picker).getByRole("option", {
          name: new RegExp(row.token.replace("/", "\\/")),
        }),
      ).toHaveTextContent(row.token);
    }
    const team = within(picker).getByRole("option", { name: /\/team/ });
    expect(team).toHaveTextContent(/sign in to save/i);
    expect(input).toHaveAttribute("placeholder", "Ask Oak");
  });
});

describe("Home — pick inserts; Send hops (SD-US-2, SD-BR-2, SD-BR-7, SD-BR-16)", () => {
  it("picking /dex inserts `/dex ` and does not POST (SD-AC-2.1, SD-BR-7)", async () => {
    render(<Home />);
    const input = await screen.findByTestId("composer-input");
    fireEvent.change(input, { target: { value: "/" } });
    const picker = await screen.findByTestId("slash-autocomplete");
    fireEvent.click(within(picker).getByRole("option", { name: /\/dex/ }));
    expect(composerInput().value).toBe("/dex ");
    expect(chatBodies).toHaveLength(0);
    expect(chatFetchCalls()).toHaveLength(0);
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("Enter on the highlighted row inserts and does not submit (SD-AC-8.2, SD-BR-16)", async () => {
    render(<Home />);
    const input = await screen.findByTestId("composer-input");
    fireEvent.change(input, { target: { value: "/" } });
    await screen.findByTestId("slash-autocomplete");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const picker = screen.getByTestId("slash-autocomplete");
    const selected = within(picker)
      .getAllByRole("option")
      .find((el) => el.getAttribute("aria-selected") === "true");
    expect(selected).toBeTruthy();
    const token = SLASH_COMMANDS.find((row) =>
      (selected!.textContent ?? "").includes(row.token),
    )?.token;
    expect(token).toBeTruthy();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(composerInput().value).toBe(insertCommand(token!));
    expect(chatBodies).toHaveLength(0);
    expect(chatFetchCalls()).toHaveLength(0);
    expect(routerPush).not.toHaveBeenCalled();
    expect(screen.queryByTestId("calculator-overlay")).toBeNull();
  });

  it("Send of a handled slash hops without fetch('/api/chat') (SD-BR-2)", async () => {
    render(<Home />);
    await screen.findByTestId("composer");
    fireEvent.change(composerInput(), { target: { value: "/dex" } });
    await clickSend();
    await waitFor(() => expect(routerPush).toHaveBeenCalled());
    expect(chatBodies).toHaveLength(0);
    expect(chatFetchCalls()).toHaveLength(0);
    expect(String(routerPush.mock.calls[0]![0])).toBe("/pokedex");
  });
});

describe("Home — Dex / Usage hops (SD-US-5, SD-BR-11, SD-BR-12, ADR-6)", () => {
  it("sends /usage garchomp to /usage/garchomp without a chat turn (SD-AC-5.7, SD-BR-12)", async () => {
    render(<Home />);
    await screen.findByTestId("composer");
    fireEvent.change(composerInput(), { target: { value: "/usage garchomp" } });
    await clickSend();
    await waitFor(() => expect(routerPush).toHaveBeenCalled());
    const dest = String(routerPush.mock.calls[0]![0]);
    expect(dest).toBe(`/usage/${encodeURIComponent("garchomp")}`);
    expect(chatBodies).toHaveLength(0);
    expect(chatFetchCalls()).toHaveLength(0);
  });

  it("sends /usage with no arg to /usage, not /meta (SD-AC-5.6, ADR-6)", async () => {
    render(<Home />);
    await screen.findByTestId("composer");
    fireEvent.change(composerInput(), { target: { value: "/usage" } });
    await clickSend();
    await waitFor(() => expect(routerPush).toHaveBeenCalled());
    const dest = String(routerPush.mock.calls[0]![0]);
    expect(dest).toBe("/usage");
    expect(dest).not.toMatch(/meta/);
    expect(chatBodies).toHaveLength(0);
  });

  it("sends unmatched /dex zzq to /pokedex, not /pokedex/zzq (SD-AC-5.4, SD-BR-11)", async () => {
    render(<Home />);
    await screen.findByTestId("composer");
    fireEvent.change(composerInput(), { target: { value: "/dex zzq" } });
    await clickSend();
    await waitFor(() => expect(routerPush).toHaveBeenCalled());
    const dest = String(routerPush.mock.calls[0]![0]);
    expect(dest).toBe("/pokedex");
    expect(dest).not.toContain("zzq");
    expect(chatBodies).toHaveLength(0);
  });

  it("sends /usage ou to /usage, not a neighbouring species (SD-AC-5.7, SD-BR-12)", async () => {
    render(<Home />);
    await screen.findByTestId("composer");
    fireEvent.change(composerInput(), { target: { value: "/usage ou" } });
    await clickSend();
    await waitFor(() => expect(routerPush).toHaveBeenCalled());
    const dest = String(routerPush.mock.calls[0]![0]);
    expect(dest).toBe("/usage");
    expect(dest).not.toMatch(/garchomp/i);
    expect(chatBodies).toHaveLength(0);
    expect(chatFetchCalls()).toHaveLength(0);
  });

  it("sends unmatched /usage zzq to /usage (SD-AC-5.7, SD-BR-11)", async () => {
    render(<Home />);
    await screen.findByTestId("composer");
    fireEvent.change(composerInput(), { target: { value: "/usage zzq" } });
    await clickSend();
    await waitFor(() => expect(routerPush).toHaveBeenCalled());
    expect(String(routerPush.mock.calls[0]![0])).toBe("/usage");
    expect(chatBodies).toHaveLength(0);
  });

  it("picked Metronome item hops to /items/metronome (SD-AC-5.3, SD-BR-17)", async () => {
    render(<Home />);
    const input = await screen.findByTestId("composer-input");
    fireEvent.change(input, { target: { value: "/dex metronome" } });
    const picker = await screen.findByTestId("slash-autocomplete");
    const item = await waitFor(() => {
      const row = within(picker)
        .getAllByRole("option")
        .find(
          (el) =>
            /metronome/i.test(el.textContent ?? "") &&
            /item/i.test(el.textContent ?? ""),
        );
      expect(row).toBeTruthy();
      return row!;
    });
    fireEvent.click(item);
    expect(composerInput().value).toBe("/dex Metronome");
    await clickSend();
    await waitFor(() => expect(routerPush).toHaveBeenCalled());
    expect(String(routerPush.mock.calls[0]![0])).toBe(
      `/items/${encodeURIComponent("metronome")}`,
    );
    expect(chatBodies).toHaveLength(0);
    expect(chatFetchCalls()).toHaveLength(0);
  });
});

describe("Home — /help and lone / (SD-US-4, SD-US-7)", () => {
  it("sends /help by prefilling `/` and showing the picker; no POST (SD-AC-4.1)", async () => {
    render(<Home />);
    await screen.findByTestId("composer");
    fireEvent.change(composerInput(), { target: { value: "/help" } });
    await clickSend();
    await waitFor(() => expect(composerInput().value).toBe("/"));
    const picker = await screen.findByTestId("slash-autocomplete");
    expect(within(picker).getAllByRole("option")).toHaveLength(6);
    expect(within(picker).getByText(PICKER_CAPTION)).toBeInTheDocument();
    expect(chatBodies).toHaveLength(0);
    expect(chatFetchCalls()).toHaveLength(0);
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("Send of lone `/` does not POST; picker and `/` stay (SD-AC-7.1)", async () => {
    render(<Home />);
    const input = await screen.findByTestId("composer-input");
    fireEvent.change(input, { target: { value: "/" } });
    await screen.findByTestId("slash-autocomplete");
    await clickSend();
    await waitFor(() => expect(composerInput().value).toBe("/"));
    const picker = screen.getByTestId("slash-autocomplete");
    expect(within(picker).getAllByRole("option")).toHaveLength(6);
    expect(chatBodies).toHaveLength(0);
    expect(chatFetchCalls()).toHaveLength(0);
  });
});

describe("Home — unknown slash and edit last (SD-BR-3, SD-BR-8)", () => {
  it("POSTs /foo as a normal message (SD-BR-3)", async () => {
    render(<Home />);
    await screen.findByTestId("composer");
    await send("/foo", 1);
    expect(chatBodies.at(-1)?.message).toBe("/foo");
    expect(chatBodies.at(-1)?.recovery).toBeUndefined();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("edit last still POSTs /new (SD-BR-8, SLASH-AC-2.5)", async () => {
    render(<Home />);
    await screen.findByTestId("composer");
    await send("Garchomp speed?", 1);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    const input = composerInput();
    expect(input.value).toBe("Garchomp speed?");
    fireEvent.change(input, { target: { value: "/new" } });
    await clickSend();

    await waitFor(() => expect(chatBodies.at(-1)?.recovery).toBe("edit"));
    expect(chatBodies.at(-1)?.message).toBe("/new");
    expect(chatBodies.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Home — images remain on hop (SD-AC-5.9)", () => {
  it("keeps composer attachments after a handled slash hop and does not POST", async () => {
    imageAttachments.filesToPendingImages.mockImplementation(
      async (files: File[]) => ({
        images: files.map(
          (f, i): PendingImage => ({
            id: `img-${i}`,
            mimeType: "image/webp",
            data: "BASE64",
            previewUrl: "data:image/webp;base64,BASE64",
            name: f.name,
          }),
        ),
        errors: [],
      }),
    );
    render(<Home />);
    await screen.findByTestId("composer");
    fireEvent.change(screen.getByTestId("composer-file-input"), {
      target: { files: [pngFile("team.png")] },
    });
    const strip = await screen.findByTestId("composer-attachments");
    expect(within(strip).getAllByRole("img")).toHaveLength(1);

    fireEvent.change(composerInput(), { target: { value: "/dex" } });
    await clickSend();
    await waitFor(() => expect(routerPush).toHaveBeenCalled());
    expect(String(routerPush.mock.calls[0]![0])).toBe("/pokedex");
    expect(chatBodies).toHaveLength(0);
    expect(chatFetchCalls()).toHaveLength(0);
    await waitFor(() =>
      expect(screen.getByTestId("composer-attachments")).toBeInTheDocument(),
    );
    expect(
      within(screen.getByTestId("composer-attachments")).getAllByRole("img"),
    ).toHaveLength(1);
  });
});

describe("Home — guest /team and mentions vs slash (SD-AC-3.5, SD-BR-13, SD-BR-14)", () => {
  it("shows Sign in to save teams after guest `/team ` (SD-AC-3.5, SD-BR-13)", async () => {
    render(<Home />);
    const input = await screen.findByTestId("composer-input");
    fireEvent.change(input, { target: { value: "/team " } });
    const picker = await screen.findByTestId("slash-autocomplete");
    await waitFor(() =>
      expect(within(picker).getByText(EMPTY_TEAMS_GUEST)).toBeInTheDocument(),
    );
    expect(EMPTY_TEAMS_GUEST).toBe("Sign in to save teams");
    expect(within(picker).queryByRole("option")).toBeNull();
    expect(chatBodies).toHaveLength(0);
  });

  it("hides @ autocomplete while the slash picker owns a leading /", async () => {
    teams = [{ id: "team-rain", name: "Rain Offense", format: "champions" }];
    meState = { signedIn: true, email: EMAIL, lastUsedScopes: [] };
    seedConvo({ id: "c-rain", title: "Rain vs sun" });
    render(<Home />);
    await screen.findByTestId("history-sidebar");
    const input = screen.getByTestId("composer-input");
    fireEvent.change(input, { target: { value: "/" } });
    expect(await screen.findByTestId("slash-autocomplete")).toBeInTheDocument();
    expect(screen.queryByTestId("mention-autocomplete")).toBeNull();

    fireEvent.change(input, { target: { value: "/@" } });
    expect(screen.queryByTestId("mention-autocomplete")).toBeNull();

    fireEvent.change(input, { target: { value: "@" } });
    const mentions = await screen.findByTestId("mention-autocomplete");
    expect(within(mentions).getByText("Rain Offense")).toBeInTheDocument();
    expect(screen.queryByTestId("slash-autocomplete")).toBeNull();
  });
});

describe("Home — /calc overlay (CALC-AC-3.1, SD-BR-14)", () => {
  it("opens the calculator overlay for /calc without POSTing a chat turn", async () => {
    render(<Home />);
    await screen.findByTestId("composer");
    fireEvent.change(composerInput(), {
      target: { value: "/calc garchomp earthquake" },
    });
    await clickSend();
    expect(chatBodies).toHaveLength(0);
    expect(chatFetchCalls()).toHaveLength(0);
    expect(screen.getByTestId("calculator-overlay")).toBeInTheDocument();
  });
});
