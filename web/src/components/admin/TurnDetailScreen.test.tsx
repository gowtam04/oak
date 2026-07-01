import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

import TurnDetailScreen from "./TurnDetailScreen";
import type { TurnDetail as TurnDetailRecord } from "@/lib/admin/admin-types";

// ---------------------------------------------------------------------------
// Fixture — a TurnDetailResponse-shaped record (the `turn` field). Components
// render fixtures only; no db/repos imported (admin component-test rule). A
// rate-limited row keeps the fixture light (null model/answer, no tools) while
// still exercising the embedded TurnDetail breakdown.
// ---------------------------------------------------------------------------

const TURN: TurnDetailRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  sessionId: "sess-abc",
  accountId: null,
  accountEmail: null,
  model: null,
  providerModel: null,
  mode: "standard",
  status: "rate_limited",
  inputTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
  toolTrace: [],
  toolErrorCount: 0,
  citationCount: 0,
  turnLatencyMs: 0,
  imagesCount: 0,
  promptText: "another question",
  answerText: null,
  answerJson: null,
  estUsd: 0,
  createdAt: 1_700_000_000_000,
};

describe("TurnDetailScreen", () => {
  it("always renders a back link to the Usage explorer (default href)", () => {
    render(<TurnDetailScreen turn={null} loading />);
    const back = screen.getByTestId("turn-detail-screen-back");
    expect(back).toBeInTheDocument();
    expect(back).toHaveAttribute("href", "/admin/usage");
  });

  it("honors a custom backHref", () => {
    render(
      <TurnDetailScreen turn={null} loading backHref="/admin/usage?status=resolution_failed" />,
    );
    expect(screen.getByTestId("turn-detail-screen-back")).toHaveAttribute(
      "href",
      "/admin/usage?status=resolution_failed",
    );
  });

  it("shows the loading state and no breakdown while loading", () => {
    render(<TurnDetailScreen turn={null} loading />);
    expect(screen.getByTestId("turn-detail-screen-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("turn-detail")).not.toBeInTheDocument();
  });

  it("shows a not-found message for a 404", () => {
    render(<TurnDetailScreen turn={null} notFound />);
    expect(
      screen.getByTestId("turn-detail-screen-not-found"),
    ).toHaveTextContent("Turn not found.");
    expect(screen.queryByTestId("turn-detail")).not.toBeInTheDocument();
  });

  it("shows an error message (alert) on a transport failure", () => {
    render(<TurnDetailScreen turn={null} error="Failed to load this turn." />);
    const err = screen.getByTestId("turn-detail-screen-error");
    expect(err).toHaveTextContent("Failed to load this turn.");
    expect(err).toHaveAttribute("role", "alert");
  });

  it("renders the full TurnDetail breakdown once the turn resolves (ADMIN-AC-5.2)", () => {
    render(<TurnDetailScreen turn={TURN} />);
    expect(screen.getByTestId("turn-detail")).toBeInTheDocument();
    expect(screen.getByTestId("turn-detail-id")).toHaveTextContent(TURN.id);
    expect(screen.getByTestId("turn-detail-status")).toHaveTextContent(
      "Rate limited",
    );
  });

  it("renders no mutating controls (read-only, ADMIN-BR-2)", () => {
    render(<TurnDetailScreen turn={TURN} />);
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });
});
