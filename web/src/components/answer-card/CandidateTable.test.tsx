import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";

// Spy on the artifact viewer: every row now opens that Pokémon's artifact, so
// assert against openEntity. Hoisted so the vi.mock factory can close over it.
const { openEntity } = vi.hoisted(() => ({ openEntity: vi.fn() }));
vi.mock("@/components/artifact/useArtifactViewer", () => ({
  useArtifactViewer: () => ({
    isOpen: false,
    current: null,
    canGoBack: false,
    openEntity,
    openStructured: () => {},
    openTeam: () => {},
    back: () => {},
    close: () => {},
  }),
}));

afterEach(() => {
  cleanup();
  openEntity.mockClear();
});
import CandidateTable from "./CandidateTable";
import {
  CANDIDATES_TRUNCATED,
  CANDIDATES_TRUNCATED_WITH_HIDDEN,
  CANDIDATES_EXACT,
  CANDIDATES_KEYSTATS_ONLY,
} from "@/components/test-fixtures";
import type { Candidates } from "@/components/types";

describe("CandidateTable", () => {
  describe("N-of-M header when truncated", () => {
    it("shows 'Showing N of M' when truncated=true", () => {
      render(<CandidateTable candidates={CANDIDATES_TRUNCATED} />);
      expect(screen.getByTestId("candidate-table-count")).toHaveTextContent(
        "Showing 2 of 50",
      );
    });

    it("shows a humanized sort label when present", () => {
      // Raw sort is the technical "speed desc"; the chip must read the friendly
      // "sorted by Speed ↓", never the shouty slug.
      render(<CandidateTable candidates={CANDIDATES_TRUNCATED} />);
      const sort = screen.getByTestId("candidate-table-sort");
      expect(sort).toHaveTextContent("sorted by Speed");
      expect(sort).not.toHaveTextContent("speed desc");
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

  it("opens the Pokémon's artifact in the viewer on row click", () => {
    render(<CandidateTable candidates={CANDIDATES_TRUNCATED} />);
    fireEvent.click(screen.getByTestId("candidate-row-0"));
    expect(openEntity).toHaveBeenCalledWith({ kind: "pokemon", q: "Garchomp" });
  });

  it("opens the correct Pokémon when the second row is clicked", () => {
    render(<CandidateTable candidates={CANDIDATES_TRUNCATED} />);
    fireEvent.click(screen.getByTestId("candidate-row-1"));
    expect(openEntity).toHaveBeenCalledWith({ kind: "pokemon", q: "Dragonite" });
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

  describe("local expansion via server-enriched hidden_rows (T2)", () => {
    it("shows a Show-all button (from hidden_rows) even without an onShowAll handler", () => {
      render(
        <CandidateTable candidates={CANDIDATES_TRUNCATED_WITH_HIDDEN} />,
      );
      expect(
        screen.getByTestId("candidate-table-show-all"),
      ).toHaveTextContent("Show all 4");
      // Only the 2 shown rows are present before expansion.
      expect(screen.getByTestId("candidate-row-1")).toBeInTheDocument();
      expect(screen.queryByTestId("candidate-row-2")).not.toBeInTheDocument();
    });

    it("expands in place on Show all — appends hidden rows, flips footer, hides button", () => {
      const onShowAll = vi.fn();
      render(
        <CandidateTable
          candidates={CANDIDATES_TRUNCATED_WITH_HIDDEN}
          onShowAll={onShowAll}
        />,
      );
      fireEvent.click(screen.getByTestId("candidate-table-show-all"));

      // All four rows now render, footer flips to the untruncated wording, the
      // button is gone, and the follow-up handler was NOT invoked.
      expect(screen.getByTestId("candidate-row-3")).toBeInTheDocument();
      expect(screen.getByText("Salamence")).toBeInTheDocument();
      expect(screen.getByText("Hydreigon")).toBeInTheDocument();
      expect(screen.getByTestId("candidate-table-count")).toHaveTextContent(
        "4 results",
      );
      expect(
        screen.queryByTestId("candidate-table-show-all"),
      ).not.toBeInTheDocument();
      expect(onShowAll).not.toHaveBeenCalled();
    });

    it("still fires the onShowAll follow-up when there are no hidden_rows", () => {
      const onShowAll = vi.fn();
      render(
        <CandidateTable candidates={CANDIDATES_TRUNCATED} onShowAll={onShowAll} />,
      );
      fireEvent.click(screen.getByTestId("candidate-table-show-all"));
      expect(onShowAll).toHaveBeenCalledTimes(1);
      // No local expansion: still only the 2 shown rows.
      expect(screen.queryByTestId("candidate-row-2")).not.toBeInTheDocument();
    });
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

/**
 * P6 — operate on the shown set only. Sort / filter / in-table pin / TSV
 * never fetch the hidden remainder (TBL-BR-1). N of M stays the unfiltered
 * shown vs total.
 *
 * Requirement refs: TBL-US-1–4, TBL-AC-1.1–1.2, TBL-AC-2.1–2.4, TBL-AC-3.1–3.2,
 * TBL-AC-4.1, TBL-AC-4.4, TBL-BR-1.
 */
describe("CandidateTable — shown-set tools (TBL-US-1–4)", () => {
  const fetchSpy = vi.fn();

  afterEach(() => {
    fetchSpy.mockReset();
    vi.unstubAllGlobals();
  });

  it("sorts only the currently shown rows and does not fetch M (TBL-AC-1.1, TBL-BR-1)", () => {
    vi.stubGlobal("fetch", fetchSpy);
    render(<CandidateTable candidates={CANDIDATES_TRUNCATED} />);
    // Fixture is already Speed desc: Garchomp (102) then Dragonite (80).
    expect(screen.getByTestId("candidate-row-0")).toHaveTextContent("Garchomp");
    fireEvent.click(screen.getByTestId("candidate-sort-speed"));
    expect(screen.getByTestId("candidate-row-0")).toHaveTextContent("Dragonite");
    expect(screen.getByTestId("candidate-row-1")).toHaveTextContent("Garchomp");
    expect(screen.queryByText("Salamence")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("keeps N of M honest after sort (TBL-AC-1.2)", () => {
    render(<CandidateTable candidates={CANDIDATES_TRUNCATED} />);
    fireEvent.click(screen.getByTestId("candidate-sort-speed"));
    expect(screen.getByTestId("candidate-table-count")).toHaveTextContent(
      "Showing 2 of 50",
    );
  });

  it("filters shown rows by type without fetching the remainder (TBL-AC-2.1, TBL-BR-1)", () => {
    vi.stubGlobal("fetch", fetchSpy);
    render(<CandidateTable candidates={CANDIDATES_TRUNCATED} />);
    fireEvent.change(screen.getByTestId("candidate-table-type-filter"), {
      target: { value: "flying" },
    });
    expect(screen.getByText("Dragonite")).toBeInTheDocument();
    expect(screen.queryByText("Garchomp")).toBeNull();
    expect(screen.queryByText("Salamence")).toBeNull();
    expect(screen.getByTestId("candidate-table-count")).toHaveTextContent(
      "Showing 2 of 50",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("filters shown rows by name fragment (TBL-AC-2.2)", () => {
    render(<CandidateTable candidates={CANDIDATES_TRUNCATED} />);
    fireEvent.change(screen.getByTestId("candidate-table-name-search"), {
      target: { value: "garch" },
    });
    expect(screen.getByText("Garchomp")).toBeInTheDocument();
    expect(screen.queryByText("Dragonite")).toBeNull();
  });

  it("composes type filter AND name search (TBL-AC-2.3)", () => {
    render(<CandidateTable candidates={CANDIDATES_TRUNCATED} />);
    fireEvent.change(screen.getByTestId("candidate-table-type-filter"), {
      target: { value: "dragon" },
    });
    fireEvent.change(screen.getByTestId("candidate-table-name-search"), {
      target: { value: "nite" },
    });
    expect(screen.getByText("Dragonite")).toBeInTheDocument();
    expect(screen.queryByText("Garchomp")).toBeNull();
  });

  it("clearing filters restores the full shown set, still not M (TBL-AC-2.4)", () => {
    render(<CandidateTable candidates={CANDIDATES_TRUNCATED} />);
    fireEvent.change(screen.getByTestId("candidate-table-type-filter"), {
      target: { value: "flying" },
    });
    fireEvent.change(screen.getByTestId("candidate-table-type-filter"), {
      target: { value: "" },
    });
    expect(screen.getByText("Garchomp")).toBeInTheDocument();
    expect(screen.getByText("Dragonite")).toBeInTheDocument();
    expect(screen.queryByText("Salamence")).toBeNull();
    expect(screen.getByTestId("candidate-table-count")).toHaveTextContent(
      "Showing 2 of 50",
    );
  });

  it("keeps a pinned row visible above filter matches (TBL-AC-3.1)", () => {
    render(<CandidateTable candidates={CANDIDATES_TRUNCATED} />);
    fireEvent.click(screen.getByTestId("candidate-row-pin-0"));
    fireEvent.change(screen.getByTestId("candidate-table-type-filter"), {
      target: { value: "flying" },
    });
    expect(screen.getByTestId("candidate-row-0")).toHaveTextContent("Garchomp");
    expect(screen.getByText("Dragonite")).toBeInTheDocument();
    expect(screen.getByTestId("candidate-table-count")).toHaveTextContent(
      "Showing 2 of 50",
    );
  });

  it("unpinning returns the row to normal filter rules (TBL-AC-3.2)", () => {
    render(<CandidateTable candidates={CANDIDATES_TRUNCATED} />);
    fireEvent.click(screen.getByTestId("candidate-row-pin-0"));
    fireEvent.change(screen.getByTestId("candidate-table-type-filter"), {
      target: { value: "flying" },
    });
    fireEvent.click(screen.getByTestId("candidate-row-pin-0"));
    expect(screen.queryByText("Garchomp")).toBeNull();
    expect(screen.getByText("Dragonite")).toBeInTheDocument();
  });

  it("copies TSV of the currently visible rows (TBL-AC-4.1)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<CandidateTable candidates={CANDIDATES_TRUNCATED} />);
    fireEvent.change(screen.getByTestId("candidate-table-type-filter"), {
      target: { value: "flying" },
    });
    fireEvent.click(screen.getByTestId("candidate-table-copy-tsv"));
    expect(writeText).toHaveBeenCalledTimes(1);
    const tsv = writeText.mock.calls[0]![0] as string;
    expect(tsv).toContain("Dragonite");
    expect(tsv).not.toContain("Garchomp");
    expect(tsv).toContain("\t");
    expect(tsv).not.toContain(",");
  });

  it("explains and copies nothing useful when the filtered set is empty (TBL-AC-4.4)", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<CandidateTable candidates={CANDIDATES_TRUNCATED} />);
    fireEvent.change(screen.getByTestId("candidate-table-name-search"), {
      target: { value: "zzz-no-match" },
    });
    fireEvent.click(screen.getByTestId("candidate-table-copy-tsv"));
    expect(screen.getByTestId("candidate-table-copy-empty")).toHaveTextContent(
      /no rows/i,
    );
    if (writeText.mock.calls.length > 0) {
      expect(writeText.mock.calls[0]![0]).toBe("");
    }
  });
});
