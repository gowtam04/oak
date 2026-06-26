import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";

afterEach(() => cleanup());
import CandidateTable from "./CandidateTable";
import {
  CANDIDATES_TRUNCATED,
  CANDIDATES_EXACT,
  CANDIDATES_KEYSTATS_ONLY,
} from "./test-fixtures";
import type { Candidates } from "./types";

describe("CandidateTable", () => {
  describe("N-of-M header when truncated", () => {
    it("shows 'Showing N of M' when truncated=true", () => {
      render(<CandidateTable candidates={CANDIDATES_TRUNCATED} />);
      expect(screen.getByTestId("candidate-table-count")).toHaveTextContent(
        "Showing 2 of 50",
      );
    });

    it("shows the sort label when present", () => {
      render(<CandidateTable candidates={CANDIDATES_TRUNCATED} />);
      expect(screen.getByTestId("candidate-table-sort")).toHaveTextContent(
        "speed desc",
      );
    });
  });

  describe("exact result set (not truncated)", () => {
    it("shows total count without 'Showing … of' prefix", () => {
      render(<CandidateTable candidates={CANDIDATES_EXACT} />);
      const count = screen.getByTestId("candidate-table-count");
      expect(count.textContent).toMatch(/^2 results/);
    });

    it("does not show sort label when sort is null", () => {
      render(<CandidateTable candidates={CANDIDATES_EXACT} />);
      expect(
        screen.queryByTestId("candidate-table-sort"),
      ).not.toBeInTheDocument();
    });
  });

  it("renders a row for each shown entry", () => {
    render(<CandidateTable candidates={CANDIDATES_TRUNCATED} />);
    expect(screen.getByTestId("candidate-row-0")).toBeInTheDocument();
    expect(screen.getByTestId("candidate-row-1")).toBeInTheDocument();
  });

  it("renders Pokémon names in rows", () => {
    render(<CandidateTable candidates={CANDIDATES_TRUNCATED} />);
    expect(screen.getByText("Garchomp")).toBeInTheDocument();
    expect(screen.getByText("Dragonite")).toBeInTheDocument();
  });

  it("renders TypeBadges for each type in a row", () => {
    render(<CandidateTable candidates={CANDIDATES_TRUNCATED} />);
    // Both rows share the "dragon" type; use row-scoped queries
    const row0 = screen.getByTestId("candidate-row-0");
    const row1 = screen.getByTestId("candidate-row-1");
    expect(within(row0).getByTestId("type-badge-dragon")).toBeInTheDocument();
    expect(within(row0).getByTestId("type-badge-ground")).toBeInTheDocument();
    expect(within(row1).getByTestId("type-badge-dragon")).toBeInTheDocument();
    expect(within(row1).getByTestId("type-badge-flying")).toBeInTheDocument();
  });

  it("shows ability column when any row has an ability", () => {
    render(<CandidateTable candidates={CANDIDATES_EXACT} />);
    expect(screen.getByText("flash-fire")).toBeInTheDocument();
    expect(screen.getByText("drought")).toBeInTheDocument();
  });

  it("calls onSelect with the Pokémon name on row click", () => {
    const onSelect = vi.fn();
    render(
      <CandidateTable candidates={CANDIDATES_TRUNCATED} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByTestId("candidate-row-0"));
    expect(onSelect).toHaveBeenCalledWith("Garchomp");
  });

  it("calls onSelect for the correct row when the second row is clicked", () => {
    const onSelect = vi.fn();
    render(
      <CandidateTable candidates={CANDIDATES_TRUNCATED} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByTestId("candidate-row-1"));
    expect(onSelect).toHaveBeenCalledWith("Dragonite");
  });

  it("does not crash when onSelect is omitted", () => {
    render(<CandidateTable candidates={CANDIDATES_TRUNCATED} />);
    // click should not throw
    fireEvent.click(screen.getByTestId("candidate-row-0"));
  });

  it("renders all six base stats in fixed order with competitive labels", () => {
    render(<CandidateTable candidates={CANDIDATES_TRUNCATED} />);
    const row0 = screen.getByTestId("candidate-row-0");
    const items = within(row0)
      .getAllByText(/^(HP|Attack|Defense|SpA|SpD|Speed):/)
      .map((el) => el.textContent);
    expect(items).toEqual([
      "HP: 108",
      "Attack: 130",
      "Defense: 95",
      "SpA: 80",
      "SpD: 85",
      "Speed: 102",
    ]);
  });

  it("falls back to key_stats when a row has no base_stats", () => {
    render(<CandidateTable candidates={CANDIDATES_KEYSTATS_ONLY} />);
    expect(screen.getByText(/speed: 102/)).toBeInTheDocument();
  });

  it("renders singular 'result' for a single match", () => {
    const single: Candidates = {
      total_count: 1,
      truncated: false,
      sort: null,
      shown: [
        {
          name: "Garchomp",
          types: ["dragon", "ground"],
        },
      ],
    };
    render(<CandidateTable candidates={single} />);
    expect(screen.getByTestId("candidate-table-count")).toHaveTextContent(
      "1 result",
    );
  });
});
