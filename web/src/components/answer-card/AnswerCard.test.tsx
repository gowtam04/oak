import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());

import AnswerCard from "./AnswerCard";
import type { OakAnswer } from "@/components/types";
import {
  CANONICAL_ANSWER,
  CANDIDATES_TRUNCATED_WITH_HIDDEN,
  QUESTION_ANSWER,
} from "@/components/test-fixtures";

/**
 * One answer carrying all three follow-up affordances at once:
 *   - suggestions[]        → SuggestionChips        (`suggestion-chip-*`)
 *   - question.options[]   → QuestionOptions        (`question-option-*`)
 *   - truncated candidates → CandidateTable Show-all (`candidate-table-show-all`)
 * so a single render can assert the whole `disabled` gate (U2).
 */
const ANSWER_WITH_AFFORDANCES: OakAnswer = {
  ...CANONICAL_ANSWER,
  question: QUESTION_ANSWER.question,
};

describe("AnswerCard — follow-up affordances gate on `disabled` (U2)", () => {
  it("fires onFollowUp for every affordance when not disabled", () => {
    const onFollowUp = vi.fn();
    render(
      <AnswerCard answer={ANSWER_WITH_AFFORDANCES} onFollowUp={onFollowUp} />,
    );

    fireEvent.click(screen.getByTestId("suggestion-chip-0"));
    fireEvent.click(screen.getByTestId("question-option-0"));
    fireEvent.click(screen.getByTestId("candidate-table-show-all"));

    expect(onFollowUp).toHaveBeenCalledTimes(3);
    // Suggestion chip + question option send their text verbatim.
    expect(onFollowUp).toHaveBeenNthCalledWith(1, "Garchomp");
    expect(onFollowUp).toHaveBeenNthCalledWith(2, "Singles");
  });

  it("disables every follow-up affordance and ignores clicks while streaming", () => {
    const onFollowUp = vi.fn();
    render(
      <AnswerCard
        answer={ANSWER_WITH_AFFORDANCES}
        onFollowUp={onFollowUp}
        disabled
      />,
    );

    const chip = screen.getByTestId("suggestion-chip-0");
    const option = screen.getByTestId("question-option-0");
    const showAll = screen.getByTestId("candidate-table-show-all");

    expect(chip).toBeDisabled();
    expect(option).toBeDisabled();
    expect(showAll).toBeDisabled();

    fireEvent.click(chip);
    fireEvent.click(option);
    fireEvent.click(showAll);

    // Both the disabled attribute AND the inert `followUp` alias keep this at 0.
    expect(onFollowUp).not.toHaveBeenCalled();
  });

  it("expands candidates.hidden_rows locally on Show all — no follow-up turn (T2)", () => {
    const onFollowUp = vi.fn();
    const answer: OakAnswer = {
      ...CANONICAL_ANSWER,
      suggestions: undefined,
      damage_calc: undefined,
      question: undefined,
      candidates: CANDIDATES_TRUNCATED_WITH_HIDDEN,
    };
    render(<AnswerCard answer={answer} onFollowUp={onFollowUp} />);

    // Before expanding: only the 2 shown rows, honest "Showing 2 of 4" footer.
    expect(screen.getByTestId("candidate-row-1")).toBeInTheDocument();
    expect(screen.queryByTestId("candidate-row-2")).toBeNull();
    expect(screen.getByTestId("candidate-table-count").textContent).toContain(
      "Showing 2 of 4",
    );

    fireEvent.click(screen.getByTestId("candidate-table-show-all"));

    // After: all 4 rows in place, footer flips to "4 results", button gone, and
    // NO follow-up chat turn was fired (the whole point of the fix).
    expect(screen.getByTestId("candidate-row-3")).toBeInTheDocument();
    expect(screen.getByTestId("candidate-table-count").textContent).toContain(
      "4 results",
    );
    expect(screen.queryByTestId("candidate-table-show-all")).toBeNull();
    expect(onFollowUp).not.toHaveBeenCalled();
  });

  it("leaves viewer-opening controls enabled while streaming (they don't POST a turn)", () => {
    // The candidate rows + "Open in viewer" call the artifact viewer, not a
    // follow-up, so `disabled` must NOT gate them — opening the viewer mid-stream
    // is harmless and must stay available.
    render(
      <AnswerCard
        answer={ANSWER_WITH_AFFORDANCES}
        onFollowUp={vi.fn()}
        disabled
      />,
    );
    expect(screen.getByTestId("open-damage-calc")).not.toBeDisabled();
  });
});
