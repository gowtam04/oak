import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import AnswerBody from "./AnswerBody";

afterEach(() => cleanup());
import { CANONICAL_ANSWER, MINIMAL_ANSWER } from "./test-fixtures";

describe("AnswerBody", () => {
  it("renders the markdown text", () => {
    render(<AnswerBody markdown={CANONICAL_ANSWER.answer_markdown} />);
    expect(screen.getByTestId("answer-body")).toBeInTheDocument();
    expect(
      screen.getByText(CANONICAL_ANSWER.answer_markdown),
    ).toBeInTheDocument();
  });

  it("renders minimal one-liner text", () => {
    render(<AnswerBody markdown={MINIMAL_ANSWER.answer_markdown} />);
    expect(
      screen.getByText(MINIMAL_ANSWER.answer_markdown),
    ).toBeInTheDocument();
  });

  it("preserves multiline text (newlines not collapsed)", () => {
    const multiline = "Line one.\nLine two.\nLine three.";
    render(<AnswerBody markdown={multiline} />);
    // The container should have the full text node including newlines
    expect(screen.getByTestId("answer-body")).toHaveTextContent("Line one.");
    expect(screen.getByTestId("answer-body")).toHaveTextContent("Line two.");
    expect(screen.getByTestId("answer-body")).toHaveTextContent("Line three.");
  });

  it("renders an empty string without crashing", () => {
    render(<AnswerBody markdown="" />);
    expect(screen.getByTestId("answer-body")).toBeInTheDocument();
  });
});
