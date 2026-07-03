import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import ThemeToggle from "./ThemeToggle";

const STORAGE_KEY = "oak-theme";

/** A minimal in-memory localStorage (this jsdom config provides no real one). */
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

/** Stub `matchMedia` so `(prefers-color-scheme: dark)` resolves to `dark`.
 * Routed through vi.stubGlobal so afterEach's unstubAllGlobals restores it. */
function mockPrefersColorScheme(dark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("dark") ? dark : !dark,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })),
  );
}

beforeEach(() => {
  vi.stubGlobal("localStorage", makeStorageStub());
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-theme");
});

describe("ThemeToggle — system-aware default", () => {
  it("follows the OS dark preference when there is no stored choice", () => {
    mockPrefersColorScheme(true);
    render(<ThemeToggle />);
    // isDark ⇒ the control offers to switch to light.
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute(
      "aria-label",
      "Switch to light theme",
    );
  });

  it("follows the OS light preference when there is no stored choice", () => {
    mockPrefersColorScheme(false);
    render(<ThemeToggle />);
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute(
      "aria-label",
      "Switch to dark theme",
    );
  });

  it("prefers the resolved data-theme attribute over the OS preference", () => {
    // Mirrors the no-flash inline script: a stored 'light' choice is stamped on
    // <html> before paint and must win over an OS dark preference.
    mockPrefersColorScheme(true);
    document.documentElement.setAttribute("data-theme", "light");
    render(<ThemeToggle />);
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute(
      "aria-label",
      "Switch to dark theme",
    );
  });
});

describe("ThemeToggle — explicit choice persists", () => {
  it("writes the chosen theme to localStorage and flips <html> data-theme", () => {
    mockPrefersColorScheme(false);
    render(<ThemeToggle />);
    const button = screen.getByTestId("theme-toggle");

    fireEvent.click(button);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    fireEvent.click(button);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
