import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

import AccountDetailView, {
  type AccountDetailViewProps,
} from "./AccountDetailView";
import type {
  AccountWithActivity,
  SessionInfo,
} from "@/lib/admin/admin-types";

// ---------------------------------------------------------------------------
// Fixtures — the GET /api/admin/accounts/[id] projection. Components render
// fixtures only; no db/repos imported (admin component-test rule).
// ---------------------------------------------------------------------------

const ACCOUNT: AccountWithActivity = {
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

const SESSIONS: SessionInfo[] = [
  { id: "sess-1", createdAt: 1_700_400_000_000, expiresAt: 1_703_000_000_000 },
  { id: "sess-2", createdAt: 1_700_450_000_000, expiresAt: 1_703_050_000_000 },
];

function renderView(overrides: Partial<AccountDetailViewProps> = {}) {
  const props: AccountDetailViewProps = {
    account: ACCOUNT,
    sessions: SESSIONS,
    ...overrides,
  };
  render(<AccountDetailView {...props} />);
  return props;
}

describe("AccountDetailView", () => {
  it("renders identity: email, account id, signup (ADMIN-AC-8.1)", () => {
    renderView();
    expect(screen.getByTestId("account-detail")).toBeInTheDocument();
    expect(screen.getByTestId("account-detail-email")).toHaveTextContent(
      "trainer@example.com",
    );
    expect(screen.getByTestId("account-detail-id")).toHaveTextContent("a-1");
    expect(screen.getByTestId("account-detail-signup")).toBeInTheDocument();
  });

  it("renders derived activity: turns, total tokens, est. cost, counts (ADMIN-AC-8.2)", () => {
    renderView();
    expect(screen.getByTestId("account-detail-turns")).toHaveTextContent("42");
    expect(screen.getByTestId("account-detail-total-tokens")).toHaveTextContent(
      "1,250",
    );
    expect(screen.getByTestId("account-detail-cost")).toHaveTextContent("$0.0042");
    expect(screen.getByTestId("account-detail-cost")).toHaveTextContent(
      /estimated/i,
    );
    expect(screen.getByTestId("account-detail-conversations")).toHaveTextContent(
      "3",
    );
    expect(screen.getByTestId("account-detail-teams")).toHaveTextContent("2");
  });

  it("renders the misuse counters (rate-limited, failed) for ADMIN-AC-11.1", () => {
    renderView();
    expect(screen.getByTestId("account-detail-rate-limited")).toHaveTextContent(
      "1",
    );
    expect(screen.getByTestId("account-detail-failed")).toHaveTextContent("4");
  });

  it("links to this account's turns for click-through (ADMIN-AC-11.2)", () => {
    renderView();
    const link = screen.getByTestId("account-detail-turns-link");
    expect(link).toHaveAttribute("href", "/admin/usage?accountId=a-1");
  });

  it("renders the active sessions with created/expiry (ADMIN-AC-8.3)", () => {
    renderView();
    expect(screen.getByTestId("account-detail-sessions")).toBeInTheDocument();
    expect(screen.getByTestId("account-session-sess-1")).toBeInTheDocument();
    expect(screen.getByTestId("account-session-sess-2")).toBeInTheDocument();
  });

  it("shows an empty-state when the account has no active sessions", () => {
    renderView({ sessions: [] });
    expect(screen.getByTestId("account-detail-no-sessions")).toBeInTheDocument();
    expect(screen.queryByTestId("account-detail-sessions")).not.toBeInTheDocument();
  });

  it("renders a back link to the accounts list", () => {
    renderView();
    expect(screen.getByTestId("account-detail-back")).toHaveAttribute(
      "href",
      "/admin/accounts",
    );
  });

  it("shows a loading state while the detail fetch is in flight", () => {
    renderView({ account: null, sessions: [], loading: true });
    expect(screen.getByTestId("account-detail-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("account-detail")).not.toBeInTheDocument();
  });

  it("shows a not-found state for an unknown account id", () => {
    renderView({ account: null, sessions: [], notFound: true });
    expect(screen.getByTestId("account-detail-not-found")).toBeInTheDocument();
  });

  it("shows an error state on a transport failure", () => {
    renderView({
      account: null,
      sessions: [],
      error: "Failed to load this account.",
    });
    const banner = screen.getByTestId("account-detail-error");
    expect(banner).toHaveTextContent("Failed to load this account.");
    expect(banner).toHaveAttribute("role", "alert");
  });

  it("exposes NO mutating controls — read-only (ADMIN-BR-2 / ADMIN-AC-8.4)", () => {
    renderView();
    // The only affordances are the back link and the read-only turns pivot —
    // both navigation. Nothing edits an account, revokes a session, or resets
    // its limits.
    expect(
      screen.queryByRole("button", {
        name: /delete|remove|edit|ban|revoke|suspend|reset|save|logout|sign out/i,
      }),
    ).toBeNull();
    expect(
      screen.queryByText(/revoke|delete|ban|suspend|reset limit/i),
    ).not.toBeInTheDocument();
  });
});
