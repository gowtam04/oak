import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import LearnsetTable from "./LearnsetTable";

describe("LearnsetTable", () => {
  it("renders a heading per method", () => {
    render(
      <LearnsetTable
        groups={[
          {
            method: "Level-up",
            moves: [{ slug: "earthquake", displayName: "Earthquake" }],
          },
          {
            method: "TM/TR",
            moves: [{ slug: "protect", displayName: "Protect" }],
          },
        ]}
      />,
    );
    expect(screen.getByText("Level-up")).toBeInTheDocument();
    expect(screen.getByText("TM/TR")).toBeInTheDocument();
  });

  it("links each move to its /moves/[slug] page", () => {
    render(
      <LearnsetTable
        groups={[
          {
            method: "Level-up",
            moves: [{ slug: "earthquake", displayName: "Earthquake" }],
          },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Earthquake" })).toHaveAttribute(
      "href",
      "/moves/earthquake",
    );
  });

  it("renders a type badge only when the move's type is known", () => {
    render(
      <LearnsetTable
        groups={[
          {
            method: "Level-up",
            moves: [
              { slug: "earthquake", displayName: "Earthquake", type: "ground" },
              { slug: "mystery-move", displayName: "Mystery Move" },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByTestId("type-badge-ground")).toBeInTheDocument();
    expect(screen.getByText("Mystery Move")).toBeInTheDocument();
  });

  it("falls back to an em dash for missing power/class", () => {
    render(
      <LearnsetTable
        groups={[
          {
            method: "Level-up",
            moves: [{ slug: "protect", displayName: "Protect" }],
          },
        ]}
      />,
    );
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBe(2);
  });
});
