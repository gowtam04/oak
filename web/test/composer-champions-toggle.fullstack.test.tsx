/**
 * FULL-STACK (frontend) — the Champions toggle now lives in the composer
 * controls row (moved out of the header) and defaults to OFF / Gen 9.
 *
 * Renders the REAL <Home/> as a guest with a single stubbed `fetch`, and drives:
 *   - a fresh load shows the toggle in the composer, aria-checked="false"
 *     (the new Standard / Gen 9 default),
 *   - sending a message posts `champions_mode: false`,
 *   - clicking the toggle flips it on and the NEXT send posts
 *     `champions_mode: true` (and the choice persists to localStorage).
 *
 * Imports only view + lib code (never db/repos/server-only). Vitest jsdom project.
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
import type { OakAnswer } from "@/components/types";

const CHAMPIONS_STORAGE_KEY = "oak-champions-mode";

/** Bodies posted to /api/chat, in order, so tests can assert champions_mode. */
let chatBodies: Array<{ message: string; champions_mode: boolean }>;

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
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(formatSseEvent("answer", { answer })));
      controller.close();
    },
  });
  return { ok: true, status: 200, statusText: "OK", body } as unknown as Response;
}

beforeEach(() => {
  chatBodies = [];
  vi.stubGlobal("localStorage", makeStorageStub());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const path = new URL(String(url), "http://localhost").pathname;
      if (path === "/api/auth/me") return jsonResponse(200, { signedIn: false });
      if (path === "/api/chat") {
        const body = JSON.parse(init!.body!);
        chatBodies.push({ message: body.message, champions_mode: body.champions_mode });
        return sseAnswerResponse({ ...MINIMAL_ANSWER, answer_markdown: `re: ${body.message}` });
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

async function send(text: string, count: number) {
  fireEvent.change(screen.getByTestId("composer-input"), { target: { value: text } });
  await act(async () => {
    fireEvent.click(screen.getByTestId("composer-send"));
  });
  await waitFor(() =>
    expect(screen.getAllByTestId("assistant-turn")).toHaveLength(count),
  );
}

describe("Composer Champions toggle", () => {
  it("lives in the composer and defaults to OFF (Gen 9) on a fresh load", async () => {
    render(<Home />);
    await screen.findByTestId("composer");

    const composer = screen.getByTestId("composer");
    const toggle = within(composer).getByTestId("champions-toggle");
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("sends champions_mode:false by default, then true after toggling on", async () => {
    render(<Home />);
    await screen.findByTestId("composer");

    // Default send is Gen 9.
    await send("what beats Garchomp?", 1);
    expect(chatBodies.at(-1)).toMatchObject({ champions_mode: false });

    // Flip the toggle on — it lights up and persists the choice.
    const toggle = screen.getByTestId("champions-toggle");
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(localStorage.getItem(CHAMPIONS_STORAGE_KEY)).toBe("true");

    // The next turn is scoped to Champions.
    await send("build a rain team", 2);
    expect(chatBodies.at(-1)).toMatchObject({ champions_mode: true });
  });
});
