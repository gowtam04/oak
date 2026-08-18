/**
 * P6 — citation tap highlights the linked span/row when both the sanitized
 * `anchor` and the matching mark exist; never fakes a highlight (CIT-US-1).
 *
 * Span marks follow the domain contract:
 *   `<!-- span:c0 -->…<!-- /span:c0 -->` with
 *   `citations[].anchor = { target: "answer_span", id: "c0" }`.
 * Fact rows use `{ target: "fact_row", id }` matching a candidate row name.
 *
 * Requirement refs: CIT-US-1, CIT-AC-1.1–1.3, CIT-BR-1, CIT-BR-2, CIT-BR-4.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { Citation } from "@/components/types";

import CitationHighlight from "./CitationHighlight";

afterEach(() => cleanup());

const SPAN_MD =
  "<!-- span:c0 -->Garchomp's base Speed is 102.<!-- /span:c0 --> It also learns Earthquake.";

const LINKED: Citation = {
  source: "pokemon/garchomp",
  detail: "base speed: 102",
  anchor: { target: "answer_span", id: "c0" },
};

const UNLINKED: Citation = {
  source: "move/earthquake",
  detail: "power: 100",
};

const ORPHAN: Citation = {
  source: "pokemon/garchomp",
  detail: "base speed: 102",
  anchor: { target: "answer_span", id: "missing" },
};

const FACT_ROW: Citation = {
  source: "pokemon/garchomp",
  detail: "shown in the candidate table",
  anchor: { target: "fact_row", id: "Garchomp" },
};

describe("CitationHighlight — span marks (CIT-AC-1.1)", () => {
  it("wraps a <!-- span:id --> mark so the claim can be highlighted", () => {
    render(
      <CitationHighlight markdown={SPAN_MD} citations={[LINKED]} />,
    );
    const span = screen.getByTestId("citation-span-c0");
    expect(span).toHaveTextContent("Garchomp's base Speed is 102.");
    expect(span).not.toHaveAttribute("data-highlighted");
  });

  it("highlights the linked span when that citation is activated (CIT-AC-1.1, CIT-BR-1)", () => {
    const onOpenSource = vi.fn();
    render(
      <CitationHighlight
        markdown={SPAN_MD}
        citations={[LINKED]}
        onOpenSource={onOpenSource}
      />,
    );
    fireEvent.click(screen.getByTestId("citation-activate-0"));
    expect(screen.getByTestId("citation-span-c0")).toHaveAttribute(
      "data-highlighted",
      "true",
    );
    expect(onOpenSource).toHaveBeenCalledWith(LINKED);
  });
});

describe("CitationHighlight — never fake a highlight (CIT-AC-1.2, CIT-BR-2)", () => {
  it("does not highlight anything when the citation has no anchor", () => {
    const onOpenSource = vi.fn();
    render(
      <CitationHighlight
        markdown={SPAN_MD}
        citations={[UNLINKED]}
        onOpenSource={onOpenSource}
      />,
    );
    fireEvent.click(screen.getByTestId("citation-activate-0"));
    expect(screen.queryByTestId("citation-span-c0")).not.toHaveAttribute(
      "data-highlighted",
      "true",
    );
    expect(screen.queryByTestId("citation-highlight")).toBeNull();
    expect(onOpenSource).toHaveBeenCalledWith(UNLINKED);
  });

  it("does not invent a highlight when the anchor id has no matching mark", () => {
    const onOpenSource = vi.fn();
    render(
      <CitationHighlight
        markdown={SPAN_MD}
        citations={[ORPHAN]}
        onOpenSource={onOpenSource}
      />,
    );
    fireEvent.click(screen.getByTestId("citation-activate-0"));
    expect(screen.getByTestId("citation-span-c0")).not.toHaveAttribute(
      "data-highlighted",
      "true",
    );
    expect(document.querySelector("[data-highlighted='true']")).toBeNull();
    expect(onOpenSource).toHaveBeenCalledWith(ORPHAN);
  });
});

describe("CitationHighlight — fact row + per-tap (CIT-AC-1.1, CIT-BR-4)", () => {
  it("highlights the matching fact-table / candidate row when both sides exist", () => {
    render(
      <CitationHighlight
        markdown="Candidates below."
        citations={[FACT_ROW]}
        rows={[{ name: "Garchomp" }, { name: "Dragonite" }]}
      />,
    );
    fireEvent.click(screen.getByTestId("citation-activate-0"));
    expect(screen.getByTestId("citation-row-Garchomp")).toHaveAttribute(
      "data-highlighted",
      "true",
    );
    expect(screen.getByTestId("citation-row-Dragonite")).not.toHaveAttribute(
      "data-highlighted",
      "true",
    );
  });

  it("moves the highlight to the newly tapped citation (CIT-BR-4)", () => {
    const second: Citation = {
      source: "pokemon/dragonite",
      detail: "the other row",
      anchor: { target: "fact_row", id: "Dragonite" },
    };
    render(
      <CitationHighlight
        markdown="Candidates below."
        citations={[FACT_ROW, second]}
        rows={[{ name: "Garchomp" }, { name: "Dragonite" }]}
      />,
    );
    fireEvent.click(screen.getByTestId("citation-activate-0"));
    expect(screen.getByTestId("citation-row-Garchomp")).toHaveAttribute(
      "data-highlighted",
      "true",
    );
    fireEvent.click(screen.getByTestId("citation-activate-1"));
    expect(screen.getByTestId("citation-row-Dragonite")).toHaveAttribute(
      "data-highlighted",
      "true",
    );
    expect(screen.getByTestId("citation-row-Garchomp")).not.toHaveAttribute(
      "data-highlighted",
      "true",
    );
  });
});
