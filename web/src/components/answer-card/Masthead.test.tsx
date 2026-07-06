import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import Masthead from "./Masthead";
import {
  GENERATION_BASIS_GEN9,
  GENERATION_BASIS_FALLBACK,
} from "@/components/test-fixtures";
import type { GenerationBasis } from "@/components/types";

const GENERATION_BASIS_CHAMPIONS: GenerationBasis = {
  generation: "champions",
  fallback: false,
};

const GENERATION_BASIS_NATDEX: GenerationBasis = {
  generation: "national-dex",
  fallback: false,
};

describe("Masthead — status indicator mapping", () => {
  it("renders a check-mark, 'Answered', and the ok tone for 'answered'", () => {
    render(
      <Masthead status="answered" generationBasis={GENERATION_BASIS_GEN9} />,
    );
    const status = screen.getByTestId("answer-masthead-status");
    expect(status).toHaveTextContent("✓");
    expect(status).toHaveTextContent("Answered");
    expect(status.className).toContain("answer-masthead__status--ok");
  });

  it("renders a warning glyph and the partial tone for 'clarification_needed'", () => {
    render(
      <Masthead
        status="clarification_needed"
        generationBasis={GENERATION_BASIS_GEN9}
      />,
    );
    const status = screen.getByTestId("answer-masthead-status");
    expect(status).toHaveTextContent("⚠");
    expect(status).toHaveTextContent("Needs input");
    expect(status.className).toContain("answer-masthead__status--partial");
  });

  it("renders a warning glyph and the partial tone for 'resolution_failed'", () => {
    render(
      <Masthead
        status="resolution_failed"
        generationBasis={GENERATION_BASIS_GEN9}
      />,
    );
    const status = screen.getByTestId("answer-masthead-status");
    expect(status).toHaveTextContent("⚠");
    expect(status).toHaveTextContent("Couldn't resolve");
    expect(status.className).toContain("answer-masthead__status--partial");
  });

  it("renders the empty-set glyph and the insufficient tone for 'insufficient_data'", () => {
    render(
      <Masthead
        status="insufficient_data"
        generationBasis={GENERATION_BASIS_GEN9}
      />,
    );
    const status = screen.getByTestId("answer-masthead-status");
    expect(status).toHaveTextContent("∅");
    expect(status).toHaveTextContent("Insufficient data");
    expect(status.className).toContain(
      "answer-masthead__status--insufficient",
    );
  });
});

describe("Masthead — scope tag", () => {
  it("renders a Gen 9 scope tag", () => {
    render(
      <Masthead status="answered" generationBasis={GENERATION_BASIS_GEN9} />,
    );
    expect(screen.getByTestId("answer-masthead-scope")).toHaveTextContent(
      "Gen 9",
    );
  });

  it("renders a pre-Gen-9 fallback scope tag from generation_basis.generation", () => {
    render(
      <Masthead
        status="answered"
        generationBasis={GENERATION_BASIS_FALLBACK}
      />,
    );
    expect(screen.getByTestId("answer-masthead-scope")).toHaveTextContent(
      "Gen 1",
    );
  });

  it("renders the Champions scope tag with the current regulation", () => {
    render(
      <Masthead
        status="answered"
        generationBasis={GENERATION_BASIS_CHAMPIONS}
      />,
    );
    const scope = screen.getByTestId("answer-masthead-scope");
    expect(scope).toHaveTextContent("Champions");
    expect(scope).toHaveTextContent("Reg M-B");
  });

  it("renders the National Dex scope tag", () => {
    render(
      <Masthead status="answered" generationBasis={GENERATION_BASIS_NATDEX} />,
    );
    expect(screen.getByTestId("answer-masthead-scope")).toHaveTextContent(
      "National Dex",
    );
  });
});
