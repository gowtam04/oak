/**
 * FULL-STACK (frontend) — the header ScopeChip is now the sole scope control
 * (champions-default): the Champions toggle is gone, a fresh conversation
 * defaults to Champions, and picking a scope from the chip's menu sends it as
 * `scope_seed` on the NEXT turn only — cleared the moment the server
 * acknowledges a turn via the `scope` SSE event (scope_seed > sticky scope, so
 * a stale seed would otherwise outrank the conversation's now-current scope).
 *
 * Renders the REAL <Home/> with a single stubbed `fetch` (guest, then signed
 * in for the New-chat case — only the signed-in sidebar has a New-chat
 * control), and drives:
 *   - a fresh load shows "Champions · Reg M-B"; sending carries neither
 *     `champions_mode` nor `scope_seed`,
 *   - picking "Gen 9 · Scarlet/Violet" from the chip menu updates the chip
 *     optimistically and rides the NEXT send as `scope_seed`; once the server
 *     acks it via a `scope` event, a further send carries no `scope_seed`,
 *   - a chip pick followed by a message whose response resolves a DIFFERENT
 *     scope (an in-message signal) snaps the chip to that scope and clears
 *     the seed,
 *   - "New chat" resets the chip to the Champions default.
 *
 * Imports only view + lib code (never db/repos/runtime). Vitest jsdom project.
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
import { MINIMAL_ANSWER } from "@/components/test-fixtures";
import type { ScopeEvent } from "@/lib/sse/sse-types";
import type { OakAnswer } from "@/components/types";

const EMAIL = "ash@pallet.town";

/** Bodies posted to /api/chat, in order (only the fields these tests care about). */
let chatBodies: Array<{ message: string; champions_mode?: boolean; scope_seed?: string }>;

/** The next /api/chat response's scope event, if any (consumed per-send). */
let nextScopeEvent: ScopeEvent | null;

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

function sseAnswerResponse(answer: OakAnswer, scopeEvent: ScopeEvent | null): Response {
  const frames: string[] = [];
  if (scopeEvent) frames.push(formatSseEvent("scope", scopeEvent));
  frames.push(formatSseEvent("answer", { answer }));
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(frames.join("")));
      controller.close();
    },
  });
  return { ok: true, status: 200, statusText: "OK", body } as unknown as Response;
}

beforeEach(() => {
  chatBodies = [];
  nextScopeEvent = null;
  meState = { signedIn: false };
  vi.stubGlobal("localStorage", makeStorageStub());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const path = new URL(String(url), "http://localhost").pathname;
      if (path === "/api/auth/me") return jsonResponse(200, meState);
      if (path === "/api/auth/request-code") return jsonResponse(200, { ok: true });
      if (path === "/api/auth/verify") {
        meState = { signedIn: true, email: EMAIL };
        return jsonResponse(200, { ok: true, email: EMAIL, created: true });
      }
      if (path === "/api/conversations" && (init?.method ?? "GET") === "GET") {
        return jsonResponse(200, { conversations: [] });
      }
      if (path === "/api/conversations/import") {
        return jsonResponse(200, { id: null });
      }
      if (path === "/api/chat") {
        const body = JSON.parse(init!.body!);
        chatBodies.push({
          message: body.message,
          champions_mode: body.champions_mode,
          scope_seed: body.scope_seed,
        });
        const scopeEvent = nextScopeEvent;
        nextScopeEvent = null;
        return sseAnswerResponse(
          { ...MINIMAL_ANSWER, answer_markdown: `re: ${body.message}` },
          scopeEvent,
        );
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

function pickScope(format: string) {
  fireEvent.click(screen.getByTestId("scope-chip"));
  fireEvent.click(screen.getByTestId(`scope-chip-option-${format}`));
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

describe("ScopeChip as the header's scope control", () => {
  it("defaults to Champions and sends neither champions_mode nor scope_seed", async () => {
    render(<Home />);
    await screen.findByTestId("composer");

    expect(screen.getByTestId("scope-chip")).toHaveTextContent("Champions · Reg M-B");

    await send("what beats Garchomp?", 1);
    const body = chatBodies.at(-1)!;
    expect(body.champions_mode).toBeUndefined();
    expect(body.scope_seed).toBeUndefined();
  });

  it("a chip pick rides the next send as scope_seed, then clears once acked", async () => {
    render(<Home />);
    await screen.findByTestId("composer");

    pickScope("scarlet-violet");
    // Optimistic chip update — before any turn has run.
    expect(screen.getByTestId("scope-chip")).toHaveTextContent(
      "Gen 9 · Scarlet/Violet",
    );

    // This send's response acks the seed via a `scope` event.
    nextScopeEvent = { format: "scarlet-violet", source: "seed" };
    await send("what beats Garchomp?", 1);
    expect(chatBodies.at(-1)!.scope_seed).toBe("scarlet-violet");

    // The ack cleared the seed — chip still reads Gen 9 (from resolvedScope),
    // and the NEXT send carries no scope_seed.
    expect(screen.getByTestId("scope-chip")).toHaveTextContent(
      "Gen 9 · Scarlet/Violet",
    );
    await send("and its Speed?", 2);
    expect(chatBodies.at(-1)!.scope_seed).toBeUndefined();
  });

  it("an in-message signal overrides a pending chip pick and clears the seed", async () => {
    render(<Home />);
    await screen.findByTestId("composer");

    pickScope("scarlet-violet");
    expect(screen.getByTestId("scope-chip")).toHaveTextContent(
      "Gen 9 · Scarlet/Violet",
    );

    // The server resolves a DIFFERENT scope from an in-message signal.
    nextScopeEvent = { format: "gen-7", source: "message" };
    await send("what about gen 7 Dragapult?", 1);
    expect(chatBodies.at(-1)!.scope_seed).toBe("scarlet-violet");

    expect(screen.getByTestId("scope-chip")).toHaveTextContent("Gen 7 · USUM");
    await send("follow up", 2);
    expect(chatBodies.at(-1)!.scope_seed).toBeUndefined();
  });

  it("New chat resets the chip to the Champions default", async () => {
    render(<Home />);
    await screen.findByTestId("auth-signin-button");
    await signIn();

    nextScopeEvent = { format: "gen-7", source: "message" };
    await send("gen 7 question", 1);
    expect(screen.getByTestId("scope-chip")).toHaveTextContent("Gen 7 · USUM");

    const sidebar = await screen.findByTestId("history-sidebar");
    await act(async () => {
      fireEvent.click(within(sidebar).getByTestId("new-chat"));
    });

    expect(screen.getByTestId("scope-chip")).toHaveTextContent(
      "Champions · Reg M-B",
    );
  });
});
