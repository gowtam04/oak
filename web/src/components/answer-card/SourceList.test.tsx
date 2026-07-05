import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import SourceList from "./SourceList";
import {
  CITATION_GARCHOMP,
  CITATION_EARTHQUAKE,
  CANONICAL_ANSWER,
} from "@/components/test-fixtures";

describe("SourceList", () => {
  const citations = CANONICAL_ANSWER.citations;

  it("renders a collapsible disclosure element", () => {
    render(<SourceList citations={citations} />);
    const details = screen.getByTestId("source-list");
    expect(details.tagName).toBe("DETAILS");
  });

  it("shows citation count in the summary", () => {
    render(<SourceList citations={citations} />);
    expect(screen.getByTestId("source-list-summary")).toHaveTextContent(
      `Sources (${citations.length})`,
    );
  });

  it("is collapsed by default", () => {
    render(<SourceList citations={citations} />);
    const details = screen.getByTestId("source-list") as HTMLDetailsElement;
    expect(details.open).toBe(false);
  });

  it("is expanded when defaultExpanded=true", () => {
    render(<SourceList citations={citations} defaultExpanded />);
    const details = screen.getByTestId("source-list") as HTMLDetailsElement;
    expect(details.open).toBe(true);
  });

  it("renders each citation's source and detail", () => {
    render(<SourceList citations={citations} defaultExpanded />);
    expect(screen.getByText(CITATION_GARCHOMP.source)).toBeInTheDocument();
    expect(screen.getByText(/base speed: 102/)).toBeInTheDocument();
    expect(screen.getByText(CITATION_EARTHQUAKE.source)).toBeInTheDocument();
    expect(screen.getByText(/power: 100/)).toBeInTheDocument();
  });

  it("renders a link for citations with endpoint_url", () => {
    render(<SourceList citations={citations} defaultExpanded />);
    const link = screen.getByTestId("citation-link-0");
    expect(link).toHaveAttribute("href", CITATION_GARCHOMP.endpoint_url);
  });

  it("does not render a link for citations without endpoint_url", () => {
    render(<SourceList citations={citations} defaultExpanded />);
    // CITATION_EARTHQUAKE has no endpoint_url → no link for index 1
    expect(screen.queryByTestId("citation-link-1")).not.toBeInTheDocument();
  });

  it("renders an empty list without crashing", () => {
    render(<SourceList citations={[]} />);
    expect(screen.getByTestId("source-list-summary")).toHaveTextContent(
      "Sources (0)",
    );
  });

  it("does not render an anchor for a javascript: endpoint_url (FE-01)", () => {
    const malicious = [
      { ...CITATION_GARCHOMP, endpoint_url: "javascript:alert(1)" },
    ];
    render(<SourceList citations={malicious} defaultExpanded />);
    expect(screen.queryByTestId("citation-link-0")).not.toBeInTheDocument();
  });

  it("renders the anchor with the correct href for a legitimate https endpoint_url", () => {
    render(<SourceList citations={[CITATION_GARCHOMP]} defaultExpanded />);
    const link = screen.getByTestId("citation-link-0");
    expect(link).toHaveAttribute("href", CITATION_GARCHOMP.endpoint_url);
  });

  it("renders a parseable citation as a clickable entity link, and an unparseable one as plain text", () => {
    const mixed = [
      CITATION_EARTHQUAKE,
      { source: "run_sql/natdex_species", detail: "aggregation" },
    ];
    render(<SourceList citations={mixed} defaultExpanded />);
    expect(screen.getByTestId("citation-entity-0").tagName).toBe("BUTTON");
    expect(screen.queryByTestId("citation-entity-1")).not.toBeInTheDocument();
    const plain = screen.getByText("run_sql/natdex_species");
    expect(plain.tagName).toBe("SPAN");
    expect(plain).toHaveClass("source-list__source");
  });
});
