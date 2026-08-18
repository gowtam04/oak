import type { ComponentProps } from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());

import AnswerCard from "./AnswerCard";
import type { OakAnswer } from "@/components/types";
import {
  CANONICAL_ANSWER,
  CANDIDATES_TRUNCATED_WITH_HIDDEN,
  MINIMAL_ANSWER,
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

/**
 * P6 — compact/full (COMPACT-US-1) and voice hydrate chrome (VOICE-US-1–3).
 *
 * Extra props (`density`, `hydrate`, `onHydrateRetry`) are passed at runtime
 * before AnswerCard declares them.
 */
type AnswerCardP6Props = ComponentProps<typeof AnswerCard> & {
  density?: "full" | "compact";
  hydrate?: { status: "running" | "failed" };
  onHydrateRetry?: () => void;
};

function renderCard(over: AnswerCardP6Props) {
  render(<AnswerCard {...(over as ComponentProps<typeof AnswerCard>)} />);
}

describe("AnswerCard — compact hides reasoning + sources only (COMPACT-US-1)", () => {
  const compactAnswer: OakAnswer = {
    ...CANONICAL_ANSWER,
    uncertainty_flags: ["Result assumes the standard Rough Skin ability"],
  };

  it("in compact mode keeps body, sprites, table, damage, caveats, and inferences (COMPACT-AC-1.1, COMPACT-BR-1)", () => {
    renderCard({ answer: compactAnswer, density: "compact" });
    expect(screen.getByTestId("answer-body")).toBeInTheDocument();
    expect(screen.getByTestId("sprite-card")).toBeInTheDocument();
    expect(screen.getByTestId("candidate-table")).toBeInTheDocument();
    expect(screen.getByTestId("damage-readout")).toBeInTheDocument();
    expect(screen.getByTestId("caveat-strip")).toBeInTheDocument();
    expect(screen.getByTestId("inference-callout")).toBeInTheDocument();
    const receipts = screen.getByTestId("receipts-footer") as HTMLDetailsElement;
    expect(receipts.open).toBe(false);
  });

  it("in full mode expands reasoning and sources (COMPACT-AC-1.2)", () => {
    renderCard({ answer: CANONICAL_ANSWER, density: "full" });
    const receipts = screen.getByTestId("receipts-footer") as HTMLDetailsElement;
    expect(receipts.open).toBe(true);
    expect(screen.getByTestId("reasoning-block-content")).toBeInTheDocument();
    expect(screen.getByTestId("citation-0")).toBeInTheDocument();
  });

  it("defaults to full when density is omitted (COMPACT-AC-1.3)", () => {
    renderCard({ answer: CANONICAL_ANSWER });
    expect(
      (screen.getByTestId("receipts-footer") as HTMLDetailsElement).open,
    ).toBe(true);
  });

  it("per-card expand reveals reasoning/sources without needing a new default (COMPACT-AC-1.5)", () => {
    renderCard({ answer: CANONICAL_ANSWER, density: "compact" });
    fireEvent.click(screen.getByTestId("receipts-summary"));
    expect(screen.getByTestId("reasoning-block-content")).toBeInTheDocument();
    expect(screen.getByTestId("citation-0")).toBeInTheDocument();
  });
});

describe("AnswerCard — citation highlight (CIT-US-1)", () => {
  it("highlights the linked span when the citation is tapped (CIT-AC-1.1)", () => {
    const answer: OakAnswer = {
      ...MINIMAL_ANSWER,
      answer_markdown:
        "<!-- span:c0 -->Garchomp's base Speed is 102.<!-- /span:c0 -->",
      citations: [
        {
          source: "pokemon/garchomp",
          detail: "base speed: 102",
          anchor: { target: "answer_span", id: "c0" },
        },
      ],
    };
    renderCard({ answer, density: "full" });
    fireEvent.click(screen.getByTestId("citation-0"));
    expect(screen.getByTestId("citation-span-c0")).toHaveAttribute(
      "data-highlighted",
      "true",
    );
  });

  it("does not invent a highlight when the citation has no matching mark (CIT-AC-1.2, CIT-BR-2)", () => {
    renderCard({ answer: MINIMAL_ANSWER, density: "full" });
    fireEvent.click(screen.getByTestId("citation-0"));
    expect(document.querySelector("[data-highlighted='true']")).toBeNull();
  });
});

describe("AnswerCard — voice hydrate chrome (VOICE-US-1)", () => {
  const voiceAnswer: OakAnswer = {
    ...MINIMAL_ANSWER,
    origin: "voice",
    answer_markdown: "Garchomp outspeeds most Ground-types.",
  };

  it("shows a mic glyph with a Voice turn text equivalent when origin is voice (VOICE-AC-1.2)", () => {
    renderCard({ answer: voiceAnswer });
    const glyph = screen.getByTestId("voice-origin-glyph");
    expect(glyph).toHaveAccessibleName(/voice turn/i);
  });

  it("does not show the mic glyph on a text-chat card", () => {
    renderCard({ answer: MINIMAL_ANSWER });
    expect(screen.queryByTestId("voice-origin-glyph")).toBeNull();
  });

  it("shows finishing card… while hydrate is running (VOICE-AC-2.1)", () => {
    renderCard({
      answer: voiceAnswer,
      hydrate: { status: "running" },
    });
    expect(screen.getByTestId("voice-hydrate-banner")).toHaveTextContent(
      /finishing card/i,
    );
    expect(screen.getByTestId("answer-body")).toHaveTextContent(
      "Garchomp outspeeds most Ground-types.",
    );
  });

  it("shows Retry when hydrate failed and keeps the spoken text (VOICE-AC-3.1)", () => {
    const onHydrateRetry = vi.fn();
    renderCard({
      answer: voiceAnswer,
      hydrate: { status: "failed" },
      onHydrateRetry,
    });
    expect(screen.getByTestId("voice-hydrate-banner")).toHaveTextContent(
      /couldn't build the full card/i,
    );
    const retry = screen.getByRole("button", { name: /^retry$/i });
    fireEvent.click(retry);
    expect(onHydrateRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("answer-body")).toHaveTextContent(
      "Garchomp outspeeds most Ground-types.",
    );
    expect(screen.getByTestId("voice-origin-glyph")).toBeInTheDocument();
  });
});
