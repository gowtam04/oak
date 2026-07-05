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

  it("renders each citation's display source and detail", () => {
    render(<SourceList citations={citations} defaultExpanded />);
    // Display text is the friendly mapping, not the raw wire source string.
    expect(screen.getByText("Pokémon — Garchomp")).toBeInTheDocument();
    expect(screen.getByText(/base speed: 102/)).toBeInTheDocument();
    expect(screen.getByText("Move — Earthquake")).toBeInTheDocument();
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

  it("renders a parseable citation as a clickable entity link, with the friendly display text, and an unparseable one as friendly plain text (TestFlight AH1b0N09K)", () => {
    const mixed = [
      CITATION_EARTHQUAKE,
      { source: "run_sql/natdex_species", detail: "aggregation" },
    ];
    render(<SourceList citations={mixed} defaultExpanded />);
    const entity = screen.getByTestId("citation-entity-0");
    expect(entity.tagName).toBe("BUTTON");
    expect(entity).toHaveTextContent("Move — Earthquake");
    expect(screen.queryByTestId("citation-entity-1")).not.toBeInTheDocument();
    // The raw wire source never leaks into the visible text.
    expect(screen.queryByText("run_sql/natdex_species")).not.toBeInTheDocument();
    const plain = screen.getByText("Oak's game database");
    expect(plain.tagName).toBe("SPAN");
    expect(plain).toHaveClass("source-list__source");
  });

  it("maps citation sources to their friendly display text (copy-table §2)", () => {
    const mixed = [
      { source: "wiki/Team_Rocket_Hideout", detail: "walkthrough" },
      { source: "get_meta_usage/gen9ou", detail: "usage %" },
      { source: "get_meta_usage/gen8ou", detail: "usage %" },
      { source: "learnset/will-o-wisp (gen-9)", detail: "level-up" },
      { source: "some_unrecognized_thing", detail: "n/a" },
    ];
    render(<SourceList citations={mixed} defaultExpanded />);
    expect(
      screen.getByText("Community wiki — Team_Rocket_Hideout"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Competitive usage stats (Gen 9 OU)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Competitive usage stats")).toBeInTheDocument();
    expect(screen.getByText("Movepool — Will O Wisp")).toBeInTheDocument();
    // Unrecognized sources fall back to the raw string, unchanged.
    expect(screen.getByText("some_unrecognized_thing")).toBeInTheDocument();
  });
});
