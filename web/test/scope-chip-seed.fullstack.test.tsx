/**
 * FULL-STACK (frontend) — the header chip is a display-only Champions
 * regulation indicator (CF-CHAT-AC-1.2, CF-UI-US-2). Click does not open a
 * game menu, send never includes `scope_seed`, and the client never PUTs
 * `/api/scope`.
 *
 * Renders the REAL <Home/> with a stubbed `fetch`. Imports only view + lib
 * code (never db/repos/runtime). Vitest jsdom project.
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import Home from "@/app/page";
import { formatSseEvent } from "@/lib/sse/sse-types";
import { MINIMAL_ANSWER } from "@/components/test-fixtures";
import { CHAMPIONS_REGULATION } from "@/data/formats";
import type { OakAnswer } from "@/components/types";

const EMAIL = "ash@pallet.town";

const REGULATION_RE = new RegExp(
  `${escapeRe(CHAMPIONS_REGULATION)}|${escapeRe(
    CHAMPIONS_REGULATION.replace(/^Regulation\b/, "Reg").trim(),
  )}`,
);

function escapeRe(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Bodies posted to /api/chat, in order (only the fields these tests care about). */
let chatBodies: Array<{ message: string; champions_mode?: boolean; scope_seed?: string }>;

/** PUT /api/scope calls — must stay empty. */
let scopePuts: unknown[];

/** Stateful /api/auth/me identity — flipped by verify (in) and signout (out). */
let meState: { signedIn: boolean; email?: string };

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

function sseAnswerResponse(answer: OakAnswer): Response {
  const frames = [
    formatSseEvent("scope", { format: "champions", source: "default" }),
    formatSseEvent("answer", { answer }),
  ];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(frames.join("")));
      controller.close();
    },
  });
  return { ok: true, status: 200, statusText: "OK", body } as unknown as Response;
}

function expectNoGameMenu() {
  expect(screen.queryByRole("menu")).toBeNull();
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(screen.queryByTestId("scope-chip-menu")).toBeNull();
  expect(screen.queryByTestId("scope-chip-option-gen-7")).toBeNull();
  expect(screen.queryByTestId("scope-chip-option-national-dex")).toBeNull();
}

beforeEach(() => {
  chatBodies = [];
  scopePuts = [];
  meState = { signedIn: false };
  vi.stubGlobal("localStorage", makeStorageStub());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const path = new URL(String(url), "http://localhost").pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/auth/me") return jsonResponse(200, meState);
      if (path === "/api/auth/request-code") return jsonResponse(200, { ok: true });
      if (path === "/api/auth/verify") {
        meState = { signedIn: true, email: EMAIL };
        return jsonResponse(200, { ok: true, email: EMAIL, created: true });
      }
      if (path === "/api/conversations" && method === "GET") {
        return jsonResponse(200, { conversations: [] });
      }
      if (path === "/api/conversations/import") {
        return jsonResponse(200, { id: null });
      }
      if (path === "/api/teams") return jsonResponse(200, { teams: [] });
      if (path === "/api/folders") return jsonResponse(200, { folders: [] });
      if (path === "/api/scope" && method === "PUT") {
        scopePuts.push(JSON.parse(init!.body!));
        return jsonResponse(200, { ok: true });
      }
      if (path === "/api/chat") {
        const body = JSON.parse(init!.body!);
        chatBodies.push({
          message: body.message,
          champions_mode: body.champions_mode,
          scope_seed: body.scope_seed,
        });
        return sseAnswerResponse({
          ...MINIMAL_ANSWER,
          answer_markdown: `re: ${body.message}`,
        });
      }
      throw new Error(`unexpected fetch: ${path}`);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function send(text: string, assistantCount: number) {
  fireEvent.change(screen.getByTestId("composer-input"), { target: { value: text } });
  await act(async () => {
    fireEvent.click(screen.getByTestId("composer-send"));
  });
  await waitFor(() =>
    expect(screen.getAllByTestId("assistant-turn")).toHaveLength(assistantCount),
  );
}

async function signIn() {
  await act(async () => {
    fireEvent.click(screen.getByTestId("auth-signin-button"));
  });
  fireEvent.change(screen.getByTestId("auth-email-input"), { target: { value: EMAIL } });
  await act(async () => {
    fireEvent.submit(screen.getByTestId("auth-email-step"));
  });
  await screen.findByTestId("auth-code-step");
  fireEvent.change(screen.getByTestId("auth-code-input"), { target: { value: "123456" } });
  await act(async () => {
    fireEvent.submit(screen.getByTestId("auth-code-step"));
  });
  await waitFor(() => expect(screen.getByTestId("auth-signout-button")).toBeInTheDocument());
}

describe("ScopeChip as the header's regulation indicator (CF-UI-US-2)", () => {
  it("always shows the current Champions regulation and sends neither champions_mode nor scope_seed", async () => {
    render(<Home />);
    await screen.findByTestId("composer");

    const chip = screen.getByTestId("scope-chip");
    expect(chip).toHaveTextContent(REGULATION_RE);
    expect(chip).not.toHaveTextContent(/National Dex/i);
    expect(chip.getAttribute("data-format")).toBe("champions");

    await send("what beats Garchomp?", 1);
    const body = chatBodies.at(-1)!;
    expect(body.champions_mode).toBeUndefined();
    expect(body.scope_seed).toBeUndefined();
    expect(scopePuts).toHaveLength(0);
  });

  it("click opens no game menu and does not PUT /api/scope (CF-UI-AC-2.2)", async () => {
    render(<Home />);
    await screen.findByTestId("composer");

    fireEvent.click(screen.getByTestId("scope-chip"));
    expectNoGameMenu();
    expect(screen.getByTestId("scope-chip")).toHaveTextContent(REGULATION_RE);

    await send("what beats Garchomp?", 1);
    expect(chatBodies.at(-1)!.scope_seed).toBeUndefined();
    expect(scopePuts).toHaveLength(0);
  });

  it("stays on the current regulation after a turn and a follow-up send", async () => {
    render(<Home />);
    await screen.findByTestId("composer");

    await send("what beats Garchomp?", 1);
    expect(screen.getByTestId("scope-chip")).toHaveTextContent(REGULATION_RE);
    expect(chatBodies.at(-1)!.scope_seed).toBeUndefined();

    await send("and its Speed?", 2);
    expect(chatBodies.at(-1)!.scope_seed).toBeUndefined();
    expect(screen.getByTestId("scope-chip")).toHaveTextContent(REGULATION_RE);
    expect(scopePuts).toHaveLength(0);
  });

  it("New chat keeps the Champions regulation on the chip for a signed-in user", async () => {
    render(<Home />);
    await screen.findByTestId("auth-signin-button");
    await signIn();

    await send("rain team?", 1);
    expect(screen.getByTestId("scope-chip")).toHaveTextContent(REGULATION_RE);

    const sidebar = await screen.findByTestId("history-sidebar");
    await act(async () => {
      fireEvent.click(within(sidebar).getByTestId("new-chat"));
    });

    expect(screen.getByTestId("scope-chip")).toHaveTextContent(REGULATION_RE);
    expect(scopePuts).toHaveLength(0);
  });

  it("New chat still shows Champions regulation with no last-used scope", async () => {
    meState = { signedIn: true, email: EMAIL };
    render(<Home />);
    await screen.findByTestId("history-sidebar");

    expect(screen.getByTestId("scope-chip")).toHaveTextContent(REGULATION_RE);

    const sidebar = screen.getByTestId("history-sidebar");
    await act(async () => {
      fireEvent.click(within(sidebar).getByTestId("new-chat"));
    });

    expect(screen.getByTestId("scope-chip")).toHaveTextContent(REGULATION_RE);
    expect(scopePuts).toHaveLength(0);
  });
});
