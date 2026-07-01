import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

import AccountsView, { type AccountsViewProps } from "./AccountsView";
import type { AccountWithActivity } from "@/lib/admin/admin-types";

// ---------------------------------------------------------------------------
// Fixtures — AccountWithActivity rows (the GET /api/admin/accounts projection).
// Components render fixtures only; no db/repos imported (admin component-test
// rule).
// ---------------------------------------------------------------------------

const ACTIVE_ACCOUNT: AccountWithActivity = {
  id: "a-1",
  email: "trainer@example.com",
  createdAt: 1_700_000_000_000,
  turns: 42,
  lastActiveAt: 1_700_500_000_000,
  inputTokens: 1000,
  outputTokens: 200,
  thinkingTokens: 50,
  totalTokens: 1250,
  estUsd: 0.0042,
  conversations: 3,
  teams: 2,
  rateLimited: 1,
  failed: 4,
};

const QUIET_ACCOUNT: AccountWithActivity = {
  id: "a-2",
  email: "lurker@example.com",
  createdAt: 1_700_100_000_000,
  turns: 0,
  lastActiveAt: null,
  inputTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
  totalTokens: 0,
  estUsd: 0,
  conversations: 0,
  teams: 0,
  rateLimited: 0,
  failed: 0,
};

const ROWS = [ACTIVE_ACCOUNT, QUIET_ACCOUNT];

function renderView(overrides: Partial<AccountsViewProps> = {}) {
  const props: AccountsViewProps = {
    rows: ROWS,
    q: "",
    onQChange: vi.fn(),
    sort: "recent",
    onSortChange: vi.fn(),
    ...overrides,
  };
  render(<AccountsView {...props} />);
  return props;
}

describe("AccountsView", () => {
  it("renders the Accounts title, toolbar, and the accounts table", () => {
    renderView();
    expect(screen.getByTestId("accounts-view")).toBeInTheDocument();
    expect(screen.getByText("Accounts")).toBeInTheDocument();
    expect(screen.getByTestId("accounts-view-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("admin-data-table")).toBeInTheDocument();
  });

  it("renders a row per account with email and signup date (ADMIN-AC-8.1)", () => {
    renderView();
    expect(screen.getByTestId("admin-row-a-1")).toBeInTheDocument();
    expect(screen.getByTestId("admin-row-a-2")).toBeInTheDocument();
    expect(screen.getByTestId("admin-cell-a-1-email")).toHaveTextContent(
      "trainer@example.com",
    );
  });

  it("renders derived activity: turns, tokens, est. cost (ADMIN-AC-8.2)", () => {
    renderView();
    expect(screen.getByTestId("admin-cell-a-1-turns")).toHaveTextContent("42");
    expect(screen.getByTestId("admin-cell-a-1-tokens")).toHaveTextContent("1,250");
    expect(screen.getByTestId("admin-cell-a-1-cost")).toHaveTextContent("$0.0042");
  });

  it("renders the misuse counters (rate-limited, failed) for ADMIN-AC-11.1", () => {
    renderView();
    expect(screen.getByTestId("admin-cell-a-1-rateLimited")).toHaveTextContent("1");
    expect(screen.getByTestId("admin-cell-a-1-failed")).toHaveTextContent("4");
  });

  it("shows 'Never' for an account that has never chatted", () => {
    renderView();
    expect(screen.getByTestId("admin-cell-a-2-lastActive")).toHaveTextContent(
      "Never",
    );
  });

  it("emits the next search term when the search box changes (ADMIN-AC-8.1)", () => {
    const onQChange = vi.fn();
    renderView({ onQChange });
    fireEvent.change(screen.getByTestId("accounts-search"), {
      target: { value: "trainer" },
    });
    expect(onQChange).toHaveBeenCalledWith("trainer");
  });

  it("emits the next sort when the sort control changes (heavy users, ADMIN-US-11)", () => {
    const onSortChange = vi.fn();
    renderView({ onSortChange });
    fireEvent.change(screen.getByTestId("accounts-sort"), {
      target: { value: "cost" },
    });
    expect(onSortChange).toHaveBeenCalledWith("cost");
  });

  it("shows a heavy-user note only for a non-default (ranking) sort", () => {
    renderView({ sort: "cost" });
    expect(screen.getByTestId("accounts-heavy-note")).toHaveTextContent(
      /estimated cost/i,
    );
  });

  it("omits the heavy-user note for the default 'recent' sort", () => {
    renderView({ sort: "recent" });
    expect(screen.queryByTestId("accounts-heavy-note")).not.toBeInTheDocument();
  });

  it("calls onRowClick with the account when a row is clicked (read-only drill-down)", () => {
    const onRowClick = vi.fn();
    renderView({ onRowClick });
    fireEvent.click(screen.getByTestId("admin-row-a-1"));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0][0]).toMatchObject({ id: "a-1" });
  });

  it("renders an error banner when an error is present", () => {
    renderView({ rows: [], error: "Failed to load accounts." });
    const banner = screen.getByTestId("accounts-view-error");
    expect(banner).toHaveTextContent("Failed to load accounts.");
    expect(banner).toHaveAttribute("role", "alert");
  });

  it("shows a loading empty-state while the first page loads", () => {
    renderView({ rows: [], loading: true });
    expect(screen.getByTestId("admin-table-empty")).toHaveTextContent(
      "Loading accounts…",
    );
  });

  it("surfaces a Load more affordance and invokes onLoadMore (keyset pagination)", () => {
    const onLoadMore = vi.fn();
    renderView({ hasMore: true, onLoadMore });
    fireEvent.click(screen.getByTestId("admin-table-load-more"));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("exposes NO mutating controls — read-only (ADMIN-BR-2 / ADMIN-AC-8.4)", () => {
    renderView();
    // The only interactions are search, sort, column sort, load-more, and a
    // read-only row click. Nothing edits, deletes, bans, or resets an account.
    expect(
      screen.queryByRole("button", {
        name: /delete|remove|edit|ban|revoke|suspend|reset|save/i,
      }),
    ).toBeNull();
    expect(
      screen.queryByText(/delete|ban|suspend|revoke/i),
    ).not.toBeInTheDocument();
  });
});
