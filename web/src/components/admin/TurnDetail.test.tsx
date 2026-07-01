import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

afterEach(() => cleanup());

import TurnDetail from "./TurnDetail";
import type { TurnDetail as TurnDetailRecord } from "@/lib/admin/admin-types";
import { CANONICAL_ANSWER } from "@/components/test-fixtures";

// ---------------------------------------------------------------------------
// Fixtures — TurnDetailResponse-shaped records (the `turn` field). Components
// render fixtures only; no db/repos imported (admin component-test rule).
// ---------------------------------------------------------------------------

/** A fully-populated, answered signed-in turn that exercises every section. */
const ANSWERED_TURN: TurnDetailRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  sessionId: "sess-abc",
  accountId: "acct-1",
  accountEmail: "trainer@example.com",
  model: "grok-4.3",
  providerModel: "grok-2",
  mode: "standard",
  status: "answered",
  inputTokens: 1234,
  outputTokens: 567,
  thinkingTokens: 89,
  toolTrace: [
    {
      tool: "resolve_entity",
      args: { name: "garchomp" },
      latency_ms: 12,
      cache_hit: true,
      error: null,
    },
    {
      tool: "get_pokemon",
      args: { slug: "garchomp" },
      latency_ms: 45,
      cache_hit: false,
      error: "index_unavailable",
    },
  ],
  toolErrorCount: 1,
  citationCount: 2,
  turnLatencyMs: 3210,
  imagesCount: 0,
  promptText: "Can Garchomp learn Earthquake?",
  answerText: CANONICAL_ANSWER.answer_markdown,
  answerJson: JSON.stringify(CANONICAL_ANSWER),
  estUsd: 0.0123,
  createdAt: 1_700_000_000_000,
};

/** A rate-limited guest turn: null model/answer, no tools. */
const RATE_LIMITED_TURN: TurnDetailRecord = {
  id: "22222222-2222-4222-8222-222222222222",
  sessionId: "sess-guest",
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
  createdAt: 1_700_000_500_000,
};

/** An image-only turn whose stored answer_json is malformed. */
const IMAGE_ONLY_BAD_JSON_TURN: TurnDetailRecord = {
  ...ANSWERED_TURN,
  id: "33333333-3333-4333-8333-333333333333",
  promptText: "   ",
  imagesCount: 2,
  answerText: "Plain text answer fallback.",
  answerJson: "{not valid json",
};

describe("TurnDetail", () => {
  it("renders the identity header (status, id, account, model, session)", () => {
    render(<TurnDetail turn={ANSWERED_TURN} />);
    expect(screen.getByTestId("turn-detail")).toBeInTheDocument();
    expect(screen.getByTestId("turn-detail-status")).toHaveTextContent(
      "Answered",
    );
    expect(screen.getByTestId("turn-detail-status")).toHaveAttribute(
      "data-status",
      "answered",
    );
    expect(screen.getByTestId("turn-detail-id")).toHaveTextContent(
      ANSWERED_TURN.id,
    );
    expect(screen.getByTestId("turn-detail-account")).toHaveTextContent(
      "trainer@example.com",
    );
    expect(screen.getByTestId("turn-detail-model")).toHaveTextContent(
      "grok-4.3",
    );
    expect(screen.getByTestId("turn-detail-model")).toHaveTextContent("grok-2");
    expect(screen.getByTestId("turn-detail-session")).toHaveTextContent(
      "sess-abc",
    );
  });

  it("shows 'Guest' when there is no account", () => {
    render(<TurnDetail turn={RATE_LIMITED_TURN} />);
    expect(screen.getByTestId("turn-detail-account")).toHaveTextContent(
      "Guest",
    );
    expect(screen.getByTestId("turn-detail-model")).toHaveTextContent("—");
  });

  it("renders token metrics and a computed total", () => {
    render(<TurnDetail turn={ANSWERED_TURN} />);
    expect(screen.getByTestId("turn-detail-input-tokens")).toHaveTextContent(
      "1,234",
    );
    expect(screen.getByTestId("turn-detail-output-tokens")).toHaveTextContent(
      "567",
    );
    expect(screen.getByTestId("turn-detail-thinking-tokens")).toHaveTextContent(
      "89",
    );
    // total = 1234 + 567 + 89 = 1890
    expect(screen.getByTestId("turn-detail-total-tokens")).toHaveTextContent(
      "1,890",
    );
    expect(screen.getByTestId("turn-detail-latency")).toHaveTextContent(
      "3,210 ms",
    );
  });

  it("flags the cost as an estimate (ADMIN-BR-5)", () => {
    render(<TurnDetail turn={ANSWERED_TURN} />);
    const cost = screen.getByTestId("turn-detail-cost");
    expect(cost).toHaveTextContent("$0.0123");
    expect(cost).toHaveTextContent(/estimated/i);
  });

  it("renders the prompt text", () => {
    render(<TurnDetail turn={ANSWERED_TURN} />);
    expect(screen.getByTestId("turn-detail-prompt")).toHaveTextContent(
      "Can Garchomp learn Earthquake?",
    );
  });

  it("flags an image-only turn when the prompt is empty", () => {
    render(<TurnDetail turn={IMAGE_ONLY_BAD_JSON_TURN} />);
    expect(screen.getByTestId("turn-detail-prompt")).toHaveTextContent(
      /image-only turn/i,
    );
  });

  it("renders each tool-trace entry with tool, latency, cache, and error", () => {
    render(<TurnDetail turn={ANSWERED_TURN} />);
    const trace = screen.getByTestId("turn-detail-tool-trace");
    expect(trace).toBeInTheDocument();

    const row0 = screen.getByTestId("turn-trace-row-0");
    expect(row0).toHaveTextContent("resolve_entity");
    expect(row0).toHaveTextContent("12 ms");
    expect(row0).toHaveTextContent("hit");
    expect(row0).toHaveTextContent("ok");
    expect(row0).toHaveAttribute("data-error", "false");

    const row1 = screen.getByTestId("turn-trace-row-1");
    expect(row1).toHaveTextContent("get_pokemon");
    expect(row1).toHaveTextContent("miss");
    expect(row1).toHaveTextContent("index_unavailable");
    expect(row1).toHaveAttribute("data-error", "true");
  });

  it("shows an empty-state when no tools were called", () => {
    render(<TurnDetail turn={RATE_LIMITED_TURN} />);
    expect(screen.getByTestId("turn-detail-no-tools")).toBeInTheDocument();
    expect(
      screen.queryByTestId("turn-detail-tool-trace"),
    ).not.toBeInTheDocument();
  });

  it("re-renders answer_json through AnswerCard", () => {
    render(<TurnDetail turn={ANSWERED_TURN} />);
    const answer = screen.getByTestId("turn-detail-answer");
    // The real AnswerCard root carries data-testid="answer-card".
    expect(within(answer).getByTestId("answer-card")).toBeInTheDocument();
    expect(within(answer).getByTestId("answer-card")).toHaveTextContent(
      "Earthquake",
    );
  });

  it("falls back to raw answer text when answer_json is malformed", () => {
    render(<TurnDetail turn={IMAGE_ONLY_BAD_JSON_TURN} />);
    expect(
      screen.queryByTestId("answer-card"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("turn-detail-answer-text")).toHaveTextContent(
      "Plain text answer fallback.",
    );
  });

  it("shows a rate-limited no-answer note when nothing was recorded", () => {
    render(<TurnDetail turn={RATE_LIMITED_TURN} />);
    const note = screen.getByTestId("turn-detail-no-answer");
    expect(note).toBeInTheDocument();
    expect(note).toHaveTextContent(/rate-limited/i);
  });

  it("renders no mutating controls (read-only, ADMIN-BR-2)", () => {
    // AnswerCard's interactive leaves are inert here (no onFollowUp), and the
    // detail view itself adds no buttons that change data. Any control present
    // is a no-op; there is no form/submit affordance bound to a mutation.
    render(<TurnDetail turn={RATE_LIMITED_TURN} />);
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });
});
