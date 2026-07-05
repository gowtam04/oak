import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import MetaUsageLists from "./MetaUsageLists";

describe("MetaUsageLists", () => {
  it("renders each section's title and entries", () => {
    render(
      <MetaUsageLists
        sections={[
          {
            title: "Top moves",
            entries: [
              { name: "Make It Rain", href: null, valueLabel: "87.3%" },
            ],
          },
          {
            title: "Top counters",
            entries: [
              { name: "Great Tusk", href: "/pokedex/great-tusk", valueLabel: "score 3.42" },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByText("Top moves")).toBeInTheDocument();
    expect(screen.getByText("Make It Rain")).toBeInTheDocument();
    expect(screen.getByText("87.3%")).toBeInTheDocument();
    expect(screen.getByText("Top counters")).toBeInTheDocument();
    expect(screen.getByText("score 3.42")).toBeInTheDocument();
  });

  it("links an entry with an href, and renders plain text without one", () => {
    render(
      <MetaUsageLists
        sections={[
          {
            title: "Top teammates",
            entries: [
              { name: "Linked Mon", href: "/pokedex/linked-mon", valueLabel: "20%" },
              { name: "Unlinked Mon", href: null, valueLabel: "15%" },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Linked Mon" })).toHaveAttribute(
      "href",
      "/pokedex/linked-mon",
    );
    expect(screen.getByText("Unlinked Mon")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Unlinked Mon" }),
    ).not.toBeInTheDocument();
  });

  it("omits a section with no entries", () => {
    render(
      <MetaUsageLists
        sections={[{ title: "Top items", entries: [] }]}
      />,
    );
    expect(screen.queryByText("Top items")).not.toBeInTheDocument();
  });

  it("renders nothing when every section is empty", () => {
    const { container } = render(
      <MetaUsageLists sections={[{ title: "Top items", entries: [] }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
