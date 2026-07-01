import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

import UsageExplorer, { type UsageExplorerProps } from "./UsageExplorer";
import type { FilterBarValue } from "./FilterBar";
import type { TurnSummary } from "@/lib/admin/admin-types";

// ---------------------------------------------------------------------------
// Fixtures — TurnSummary rows (the GET /api/admin/turns projection). Components
// render fixtures only; no db/repos imported (admin component-test rule).
// ---------------------------------------------------------------------------

/** A signed-in, answered turn. */
const SIGNED_ANSWERED: TurnSummary = {
  id: "t-1",
  sessionId: "s-1",
  accountId: "a-1",
  accountEmail: "trainer@example.com",
  model: "grok-4.3",
  providerModel: "grok-2",
  mode: "standard",
  status: "answered",
  inputTokens: 1000,
  outputTokens: 200,
  thinkingTokens: 50,
  toolErrorCount: 0,
  citationCount: 2,
  turnLatencyMs: 1500,
  imagesCount: 0,
  promptText: "Can Garchomp learn Earthquake?",
  estUsd: 0.0042,
  createdAt: 1_700_000_200_000,
};

/** A guest, failed, image-only (empty-prompt) turn. */
const GUEST_FAILED: TurnSummary = {
  id: "t-2",
  sessionId: "s-guest",
  accountId: null,
  accountEmail: null,
  model: "claude",
  providerModel: "claude-x",
  mode: "champions",
  status: "resolution_failed",
  inputTokens: 300,
  outputTokens: 0,
  thinkingTokens: 0,
  toolErrorCount: 1,
  citationCount: 0,
  turnLatencyMs: 800,
  imagesCount: 1,
  promptText: "",
  estUsd: 0,
  createdAt: 1_700_000_100_000,
};

const ROWS = [SIGNED_ANSWERED, GUEST_FAILED];

function renderExplorer(overrides: Partial<UsageExplorerProps> = {}) {
  const props: UsageExplorerProps = {
    filter: {} as FilterBarValue,
    onFilterChange: vi.fn(),
    rows: ROWS,
    ...overrides,
  };
  render(<UsageExplorer {...props} />);
  return props;
}

describe("UsageExplorer", () => {
  it("renders the Usage title, the filter bar, and the turns table", () => {
    renderExplorer();
    expect(screen.getByTestId("usage-explorer")).toBeInTheDocument();
    expect(screen.getByText("Usage")).toBeInTheDocument();
    expect(screen.getByTestId("filter-bar")).toBeInTheDocument();
    expect(screen.getByTestId("admin-data-table")).toBeInTheDocument();
  });

  it("renders a row per turn with the human-readable status label", () => {
    renderExplorer();
    expect(screen.getByTestId("admin-row-t-1")).toBeInTheDocument();
    expect(screen.getByTestId("admin-row-t-2")).toBeInTheDocument();
    expect(screen.getByTestId("usage-status-t-1")).toHaveTextContent("Answered");
    expect(screen.getByTestId("usage-status-t-2")).toHaveTextContent(
      "Resolution failed",
    );
  });

  it("shows the account email for a signed-in turn and 'Guest' for a guest turn", () => {
    renderExplorer();
    expect(screen.getByTestId("admin-cell-t-1-user")).toHaveTextContent(
      "trainer@example.com",
    );
    expect(screen.getByTestId("admin-cell-t-2-user")).toHaveTextContent("Guest");
  });

  it("renders tokens (summed) and an estimated cost per row", () => {
    renderExplorer();
    // 1000 + 200 + 50 = 1,250
    expect(screen.getByTestId("admin-cell-t-1-tokens")).toHaveTextContent("1,250");
    expect(screen.getByTestId("admin-cell-t-1-cost")).toHaveTextContent("$0.0042");
  });

  it("shows an em-dash prompt preview for an empty (image-only) prompt", () => {
    renderExplorer();
    expect(screen.getByTestId("admin-cell-t-2-prompt")).toHaveTextContent("—");
  });

  it("calls onRowClick with the turn when a row is clicked (read-only drill-down)", () => {
    const onRowClick = vi.fn();
    renderExplorer({ onRowClick });
    fireEvent.click(screen.getByTestId("admin-row-t-1"));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0][0]).toMatchObject({ id: "t-1" });
  });

  it("emits the next filter object when a FilterBar control changes (ADMIN-AC-5.1)", () => {
    const onFilterChange = vi.fn();
    renderExplorer({ filter: {}, onFilterChange });
    fireEvent.change(screen.getByTestId("filter-status"), {
      target: { value: "resolution_failed" },
    });
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange.mock.calls[0][0]).toEqual({
      status: "resolution_failed",
    });
  });

  it("renders a scope-note banner when one is supplied (click-through scope)", () => {
    renderExplorer({ scopeNote: "Filtered to account a-1" });
    expect(screen.getByTestId("usage-explorer-scope")).toHaveTextContent(
      "Filtered to account a-1",
    );
  });

  it("omits the scope-note banner by default", () => {
    renderExplorer();
    expect(screen.queryByTestId("usage-explorer-scope")).not.toBeInTheDocument();
  });

  it("renders an error banner when an error is present", () => {
    renderExplorer({ rows: [], error: "Failed to load turns." });
    const banner = screen.getByTestId("usage-explorer-error");
    expect(banner).toHaveTextContent("Failed to load turns.");
    expect(banner).toHaveAttribute("role", "alert");
  });

  it("shows a loading empty-state while the first page loads", () => {
    renderExplorer({ rows: [], loading: true });
    expect(screen.getByTestId("admin-table-empty")).toHaveTextContent(
      "Loading turns…",
    );
  });

  it("shows the no-match empty-state when there are no rows and not loading", () => {
    renderExplorer({ rows: [], loading: false });
    expect(screen.getByTestId("admin-table-empty")).toHaveTextContent(
      "No turns match these filters.",
    );
  });

  it("surfaces a Load more affordance and invokes onLoadMore (keyset pagination)", () => {
    const onLoadMore = vi.fn();
    renderExplorer({ hasMore: true, onLoadMore });
    const btn = screen.getByTestId("admin-table-load-more");
    fireEvent.click(btn);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("hides Load more when there is no further page", () => {
    renderExplorer({ hasMore: false });
    expect(screen.queryByTestId("admin-table-load-more")).not.toBeInTheDocument();
  });
});
