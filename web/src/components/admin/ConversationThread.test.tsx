import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

afterEach(() => cleanup());

import ConversationThread from "./ConversationThread";
import type {
  ConversationSummary,
  ConversationThreadResponse,
  StoredTurn,
} from "@/lib/admin/admin-types";
import { CANONICAL_ANSWER } from "@/components/test-fixtures";

// ---------------------------------------------------------------------------
// Fixtures — a ConversationThreadResponse ({ summary, turns }). Components
// render fixtures only; no db/repos imported (admin component-test rule).
// ---------------------------------------------------------------------------

const SUMMARY: ConversationSummary = {
  id: "c-1",
  accountId: "a-1",
  accountEmail: "trainer@example.com",
  title: "Garchomp moveset help",
  format: "champions",
  messageCount: 3,
  createdAt: 1_700_000_100_000,
  updatedAt: 1_700_000_300_000,
};

/** A plain user message turn. */
const USER_TURN: StoredTurn = {
  id: "m-1",
  role: "user",
  seq: 0,
  textContent: "Can Garchomp learn Earthquake?",
  answerJson: null,
  createdAt: 1_700_000_100_000,
};

/** An assistant turn whose answer_json re-renders through AnswerCard. */
const ASSISTANT_TURN: StoredTurn = {
  id: "m-2",
  role: "assistant",
  seq: 1,
  textContent: CANONICAL_ANSWER.answer_markdown,
  answerJson: JSON.stringify(CANONICAL_ANSWER),
  createdAt: 1_700_000_200_000,
};

/** An assistant turn with malformed JSON → falls back to the stored text. */
const ASSISTANT_BAD_JSON: StoredTurn = {
  id: "m-3",
  role: "assistant",
  seq: 2,
  textContent: "Plain text fallback answer.",
  answerJson: "{not valid json",
  createdAt: 1_700_000_250_000,
};

const THREAD: ConversationThreadResponse = {
  summary: SUMMARY,
  turns: [USER_TURN, ASSISTANT_TURN, ASSISTANT_BAD_JSON],
};

describe("ConversationThread", () => {
  it("renders the screen chrome (back link + title)", () => {
    render(<ConversationThread thread={THREAD} />);
    expect(screen.getByTestId("conversation-thread")).toBeInTheDocument();
    const back = screen.getByTestId("conversation-thread-back");
    expect(back).toHaveAttribute("href", "/admin/conversations");
    expect(screen.getByText("Conversation")).toBeInTheDocument();
  });

  it("renders the summary header with the owning account (ADMIN-BR-4) and format", () => {
    render(<ConversationThread thread={THREAD} />);
    expect(screen.getByTestId("conversation-thread-summary")).toBeInTheDocument();
    expect(screen.getByTestId("conversation-thread-title")).toHaveTextContent(
      "Garchomp moveset help",
    );
    expect(screen.getByTestId("conversation-thread-account")).toHaveTextContent(
      "trainer@example.com",
    );
    expect(screen.getByTestId("conversation-thread-format")).toHaveTextContent(
      "Champions",
    );
    expect(
      screen.getByTestId("conversation-thread-message-count"),
    ).toHaveTextContent("3");
  });

  it("renders a user turn as plain message text with a role label", () => {
    render(<ConversationThread thread={THREAD} />);
    const turn = screen.getByTestId("thread-turn-m-1");
    expect(turn).toHaveAttribute("data-role", "user");
    expect(screen.getByTestId("thread-role-m-1")).toHaveTextContent("User");
    expect(turn).toHaveTextContent("Can Garchomp learn Earthquake?");
    // A user turn does not render an AnswerCard.
    expect(within(turn).queryByTestId("answer-card")).not.toBeInTheDocument();
  });

  it("re-renders an assistant turn's answer_json through AnswerCard (ADMIN-AC-9.2)", () => {
    render(<ConversationThread thread={THREAD} />);
    const turn = screen.getByTestId("thread-turn-m-2");
    expect(turn).toHaveAttribute("data-role", "assistant");
    expect(screen.getByTestId("thread-role-m-2")).toHaveTextContent("Oak");
    const card = within(turn).getByTestId("answer-card");
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent("Earthquake");
  });

  it("falls back to stored text when an assistant turn's answer_json is malformed", () => {
    render(<ConversationThread thread={THREAD} />);
    const turn = screen.getByTestId("thread-turn-m-3");
    expect(within(turn).queryByTestId("answer-card")).not.toBeInTheDocument();
    expect(turn).toHaveTextContent("Plain text fallback answer.");
  });

  it("shows a no-answer note for an assistant turn with no usable content", () => {
    const emptyAssistant: StoredTurn = {
      id: "m-9",
      role: "assistant",
      seq: 0,
      textContent: "   ",
      answerJson: null,
      createdAt: 1_700_000_400_000,
    };
    render(
      <ConversationThread
        thread={{ summary: SUMMARY, turns: [emptyAssistant] }}
      />,
    );
    expect(screen.getByTestId("thread-turn-m-9")).toHaveTextContent(
      "(no answer recorded)",
    );
  });

  it("falls back to a placeholder title for an untitled conversation", () => {
    render(
      <ConversationThread
        thread={{ summary: { ...SUMMARY, title: "" }, turns: [USER_TURN] }}
      />,
    );
    expect(screen.getByTestId("conversation-thread-title")).toHaveTextContent(
      "Untitled conversation",
    );
  });

  it("falls back to the account id when no email is joined", () => {
    render(
      <ConversationThread
        thread={{
          summary: { ...SUMMARY, accountEmail: null },
          turns: [USER_TURN],
        }}
      />,
    );
    expect(screen.getByTestId("conversation-thread-account")).toHaveTextContent(
      "a-1",
    );
  });

  it("shows an empty-thread state when the conversation has no messages", () => {
    render(<ConversationThread thread={{ summary: SUMMARY, turns: [] }} />);
    expect(
      screen.getByTestId("conversation-thread-no-turns"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("conversation-thread-turns"),
    ).not.toBeInTheDocument();
  });

  it("shows the loading state", () => {
    render(<ConversationThread thread={null} loading />);
    expect(
      screen.getByTestId("conversation-thread-loading"),
    ).toBeInTheDocument();
  });

  it("shows the not-found state", () => {
    render(<ConversationThread thread={null} notFound />);
    expect(
      screen.getByTestId("conversation-thread-not-found"),
    ).toBeInTheDocument();
  });

  it("shows an error state with role=alert", () => {
    render(
      <ConversationThread thread={null} error="Failed to load this conversation." />,
    );
    const err = screen.getByTestId("conversation-thread-error");
    expect(err).toHaveTextContent("Failed to load this conversation.");
    expect(err).toHaveAttribute("role", "alert");
  });

  it("shows an empty state when no thread and no flags are set", () => {
    render(<ConversationThread thread={null} />);
    expect(screen.getByTestId("conversation-thread-empty")).toBeInTheDocument();
  });

  it("honors a custom back href", () => {
    render(<ConversationThread thread={THREAD} backHref="/admin/usage" />);
    expect(screen.getByTestId("conversation-thread-back")).toHaveAttribute(
      "href",
      "/admin/usage",
    );
  });

  it("exposes NO mutating controls — read-only (ADMIN-AC-9.3 / ADMIN-BR-2)", () => {
    render(<ConversationThread thread={THREAD} />);
    // No deletion, editing, redaction, or flagging of the thread or messages.
    expect(
      screen.queryByRole("button", {
        name: /delete|remove|edit|redact|flag/i,
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/delete|redact|flag/i)).not.toBeInTheDocument();
  });
});
