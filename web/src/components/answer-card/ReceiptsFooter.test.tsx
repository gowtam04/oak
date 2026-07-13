import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

import ReceiptsFooter from "./ReceiptsFooter";
import { CANONICAL_ANSWER } from "@/components/test-fixtures";

describe("ReceiptsFooter", () => {
  const citations = CANONICAL_ANSWER.citations;
  const markdown = CANONICAL_ANSWER.reasoning_markdown;

  it("renders a single RECEIPTS disclosure with the source count", () => {
    render(
      <ReceiptsFooter reasoningMarkdown={markdown} citations={citations} />,
    );
    const details = screen.getByTestId("receipts-footer") as HTMLDetailsElement;
    expect(details.tagName).toBe("DETAILS");
    expect(screen.getByTestId("receipts-summary")).toHaveTextContent(
      "RECEIPTS · 2 SOURCES",
    );
  });

  it("uses singular SOURCE when there is exactly one citation", () => {
    render(
      <ReceiptsFooter
        reasoningMarkdown={markdown}
        citations={citations.slice(0, 1)}
      />,
    );
    expect(screen.getByTestId("receipts-summary")).toHaveTextContent(
      "RECEIPTS · 1 SOURCE",
    );
  });

  it("is collapsed by default", () => {
    render(
      <ReceiptsFooter reasoningMarkdown={markdown} citations={citations} />,
    );
    expect(
      (screen.getByTestId("receipts-footer") as HTMLDetailsElement).open,
    ).toBe(false);
  });

  it("expands when defaultExpanded=true", () => {
    render(
      <ReceiptsFooter
        reasoningMarkdown={markdown}
        citations={citations}
        defaultExpanded
      />,
    );
    expect(
      (screen.getByTestId("receipts-footer") as HTMLDetailsElement).open,
    ).toBe(true);
  });

  it("embeds reasoning and citations when open", () => {
    render(
      <ReceiptsFooter
        reasoningMarkdown={markdown}
        citations={citations}
        defaultExpanded
      />,
    );
    expect(screen.getByTestId("reasoning-block-content")).toHaveTextContent(
      "query_pokedex",
    );
    expect(screen.getByTestId("citation-0")).toBeInTheDocument();
  });

  it("honours controlled open state after defaultExpanded", () => {
    const { rerender } = render(
      <ReceiptsFooter reasoningMarkdown={markdown} citations={citations} />,
    );
    expect(
      (screen.getByTestId("receipts-footer") as HTMLDetailsElement).open,
    ).toBe(false);
    rerender(
      <ReceiptsFooter
        reasoningMarkdown={markdown}
        citations={citations}
        defaultExpanded
      />,
    );
    // defaultExpanded only applies on first mount; re-render keeps prior state.
    expect(
      (screen.getByTestId("receipts-footer") as HTMLDetailsElement).open,
    ).toBe(false);
  });
});
