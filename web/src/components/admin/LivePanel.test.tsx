import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";

afterEach(() => cleanup());

import LivePanel from "./LivePanel";
import type { LiveResponse, TurnSummary } from "@/lib/admin/admin-types";

// ---------------------------------------------------------------------------
// Fixtures — LiveResponse-shaped snapshots. The component renders fixtures only
// and imports no db/repos; the injected `fetcher` stands in for the real
// `GET /api/admin/live` poll so polling can be exercised deterministically
// (admin component-test rule + Phase 7 "live polling" focus).
// ---------------------------------------------------------------------------

const NOW = 1_700_000_000_000;

function makeTurn(overrides: Partial<TurnSummary> = {}): TurnSummary {
  return {
    id: "t-1",
    sessionId: "sess-1",
    accountId: "acct-1",
    accountEmail: "trainer@example.com",
    model: "grok-4.3",
    providerModel: "grok-2",
    mode: "standard",
    status: "answered",
    inputTokens: 1000,
    outputTokens: 200,
    thinkingTokens: 50,
    toolErrorCount: 0,
    citationCount: 1,
    turnLatencyMs: 1234,
    imagesCount: 0,
    promptText: "Can Garchomp learn Earthquake?",
    estUsd: 0.0123,
    createdAt: NOW,
    ...overrides,
  };
}

const ANSWERED = makeTurn({ id: "11111111-1111-4111-8111-111111111111" });

const RATE_LIMITED_GUEST = makeTurn({
  id: "22222222-2222-4222-8222-222222222222",
  accountId: null,
  accountEmail: null,
  model: null,
  providerModel: null,
  status: "rate_limited",
  inputTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
  turnLatencyMs: 0,
  promptText: "too many questions",
  createdAt: NOW + 1_000,
});

const LIVE_OK: LiveResponse = {
  recent: [RATE_LIMITED_GUEST, ANSWERED],
  window: { lastHourTurns: 5, lastHourActive: 2 },
};

const LIVE_EMPTY: LiveResponse = {
  recent: [],
  window: { lastHourTurns: 0, lastHourActive: 0 },
};

/** A later snapshot with different counters — proves a poll refreshed the view. */
const LIVE_UPDATED: LiveResponse = {
  recent: [ANSWERED],
  window: { lastHourTurns: 9, lastHourActive: 4 },
};

describe("LivePanel", () => {
  it("shows a loading state until the first snapshot resolves", () => {
    // A fetcher that never settles keeps the panel in its initial loading state.
    const fetcher = vi.fn(() => new Promise<LiveResponse>(() => {}));
    render(<LivePanel fetcher={fetcher} pollIntervalMs={100_000} />);

    expect(screen.getByTestId("live-panel")).toBeInTheDocument();
    expect(screen.getByTestId("live-panel-loading")).toBeInTheDocument();
    // No data yet → neither the KPI tiles nor the feed are mounted.
    expect(screen.queryByTestId("live-window-turns")).not.toBeInTheDocument();
    expect(screen.queryByTestId("admin-data-table")).not.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalled();
  });

  it("renders current-window counters and the recent-turn feed", async () => {
    const fetcher = vi.fn(async () => LIVE_OK);
    render(<LivePanel fetcher={fetcher} pollIntervalMs={100_000} />);

    const turns = await screen.findByTestId("live-window-turns");
    expect(within(turns).getByTestId("kpi-card-value")).toHaveTextContent("5");

    const active = screen.getByTestId("live-window-active");
    expect(within(active).getByTestId("kpi-card-value")).toHaveTextContent("2");

    // Each recent turn is a feed row (DataTable surfaces a row per rowKey).
    expect(screen.getByTestId(`admin-row-${ANSWERED.id}`)).toBeInTheDocument();
    expect(
      screen.getByTestId(`admin-row-${RATE_LIMITED_GUEST.id}`),
    ).toBeInTheDocument();
  });

  it("links each turn to its read-only drill-down (/admin/usage/[id])", async () => {
    const fetcher = vi.fn(async () => LIVE_OK);
    render(<LivePanel fetcher={fetcher} pollIntervalMs={100_000} />);

    const link = await screen.findByTestId(`live-turn-link-${ANSWERED.id}`);
    expect(link).toHaveAttribute("href", `/admin/usage/${ANSWERED.id}`);
    // A plain anchor (router-free, read-only navigation) — not a mutating button.
    expect(link.tagName).toBe("A");
  });

  it("labels the recorded status and renders guests without a model", async () => {
    const fetcher = vi.fn(async () => LIVE_OK);
    render(<LivePanel fetcher={fetcher} pollIntervalMs={100_000} />);

    const badge = await screen.findByTestId(
      `live-status-${RATE_LIMITED_GUEST.id}`,
    );
    expect(badge).toHaveTextContent("Rate limited");
    expect(badge).toHaveAttribute("data-status", "rate_limited");

    expect(
      screen.getByTestId(`admin-cell-${RATE_LIMITED_GUEST.id}-user`),
    ).toHaveTextContent("Guest");
    expect(
      screen.getByTestId(`admin-cell-${RATE_LIMITED_GUEST.id}-model`),
    ).toHaveTextContent("—");
  });

  it("shows an empty-state when no turns have been recorded yet", async () => {
    const fetcher = vi.fn(async () => LIVE_EMPTY);
    render(<LivePanel fetcher={fetcher} pollIntervalMs={100_000} />);

    expect(await screen.findByTestId("admin-table-empty")).toHaveTextContent(
      /no turns recorded yet/i,
    );
    // The window tiles still render their zero counters.
    const turns = screen.getByTestId("live-window-turns");
    expect(within(turns).getByTestId("kpi-card-value")).toHaveTextContent("0");
  });

  it("polls on the interval and refreshes the view without a reload (ADMIN-AC-7.1)", async () => {
    let call = 0;
    const fetcher = vi.fn(async () => (call++ === 0 ? LIVE_OK : LIVE_UPDATED));
    render(<LivePanel fetcher={fetcher} pollIntervalMs={30} />);

    // First snapshot.
    const turns = await screen.findByTestId("live-window-turns");
    expect(within(turns).getByTestId("kpi-card-value")).toHaveTextContent("5");

    // A subsequent poll fires and the counter updates in place (no remount).
    await waitFor(() => {
      expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(
        within(screen.getByTestId("live-window-turns")).getByTestId(
          "kpi-card-value",
        ),
      ).toHaveTextContent("9");
    });
  });

  it("surfaces a non-fatal error but keeps the last good snapshot on a failed poll", async () => {
    let call = 0;
    const fetcher = vi.fn(async () => {
      if (call++ === 0) return LIVE_OK;
      throw new Error("boom");
    });
    render(<LivePanel fetcher={fetcher} pollIntervalMs={30} />);

    await screen.findByTestId("live-window-turns");

    await waitFor(() => {
      expect(screen.getByTestId("live-panel-error")).toBeInTheDocument();
    });
    // Last good window is still on screen — a poll hiccup never blanks the view.
    expect(
      within(screen.getByTestId("live-window-turns")).getByTestId(
        "kpi-card-value",
      ),
    ).toHaveTextContent("5");
  });

  it("shows an error note (and no KPI tiles) when the first snapshot fails", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("down");
    });
    render(<LivePanel fetcher={fetcher} pollIntervalMs={100_000} />);

    expect(await screen.findByTestId("live-panel-error")).toBeInTheDocument();
    expect(screen.getByTestId("live-panel-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("live-window-turns")).not.toBeInTheDocument();
  });

  it("renders no mutating controls (read-only, ADMIN-BR-2)", async () => {
    const fetcher = vi.fn(async () => LIVE_OK);
    render(<LivePanel fetcher={fetcher} pollIntervalMs={100_000} />);

    await screen.findByTestId("live-window-turns");
    // No form/submit affordance, and the feed columns are non-sortable (no sort
    // buttons) with no "Load more" — the only interactions are drill-down links.
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.queryByTestId("admin-table-load-more")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
