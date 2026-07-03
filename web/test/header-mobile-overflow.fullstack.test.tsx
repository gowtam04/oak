/**
 * FULL-STACK (frontend) — mobile header overflow fix.
 *
 * At a phone width (≤640px) the header auth control (guest "Sign in" or the
 * wider signed-in email/"Sign out" cluster) used to sit inline and overflow the
 * right edge — clipped and unreachable since the page has no horizontal scroll.
 * The fix moves AuthMenu INTO the collapsible `#header-controls` group, which
 * the ≤640px CSS turns into the gear ("more") popover. So the guarantee is
 * structural and viewport-independent: the auth control is a descendant of
 * `#header-controls`, leaving the mobile header row = logo + scope chip + gear.
 *
 * A `matchMedia` stub reports a narrow (phone) viewport so the code paths that
 * consult it run the mobile branch, matching the existing narrow-flag pattern.
 *
 * Renders the REAL <Home/> with a single stubbed `fetch`. Imports only view +
 * lib code (never db/repos/runtime). Vitest jsdom project.
 */

import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import Home from "@/app/page";

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

/** matchMedia stub reporting a narrow phone viewport (all max-width queries match). */
function stubNarrowMatchMedia() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: /max-width/.test(query),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  );
}

beforeEach(() => {
  meState = { signedIn: false };
  vi.stubGlobal("localStorage", makeStorageStub());
  stubNarrowMatchMedia();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = new URL(String(url), "http://localhost").pathname;
      if (path === "/api/auth/me") return jsonResponse(200, meState);
      if (path === "/api/conversations") {
        return jsonResponse(200, { conversations: [] });
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

describe("Mobile header — auth control collapses into the gear popover", () => {
  it("keeps the gear trigger and puts the guest 'Sign in' inside #header-controls", async () => {
    render(<Home />);
    // Guest auth control resolves after fetchMe.
    const signIn = await screen.findByTestId("auth-signin-button");
    // The gear ("more") trigger is present (the popover opener on mobile).
    expect(screen.getByTestId("header-more")).toBeInTheDocument();
    // The auth control is a descendant of the collapsible group that the ≤640px
    // CSS turns into the popover — i.e. it is NOT loose in the header row.
    const controls = document.getElementById("header-controls");
    expect(controls).not.toBeNull();
    expect(controls!.contains(signIn)).toBe(true);
  });

  it("puts the (wider) signed-in email/'Sign out' cluster inside #header-controls too", async () => {
    meState = { signedIn: true, email: "ash@pallet.town" };
    render(<Home />);
    const signOut = await screen.findByTestId("auth-signout-button");
    const controls = document.getElementById("header-controls");
    expect(controls).not.toBeNull();
    expect(controls!.contains(signOut)).toBe(true);
    // The auth-menu is not rendered as a loose sibling in the header cluster.
    expect(controls!.contains(screen.getByTestId("auth-menu"))).toBe(true);
  });
});
