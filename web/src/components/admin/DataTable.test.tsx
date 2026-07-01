import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import DataTable, { type Column } from "./DataTable";

afterEach(() => cleanup());

// A tiny, self-contained row shape — component tests render fixtures only and
// never import db/repos (CLAUDE.md jsdom rule).
interface Row {
  id: string;
  name: string;
  turns: number;
  email: string | null;
}

const ROWS: Row[] = [
  { id: "a", name: "Charizard", turns: 12, email: "c@x.io" },
  { id: "b", name: "Blastoise", turns: 5, email: null },
  { id: "c", name: "Alakazam", turns: 30, email: "a@x.io" },
];

const COLUMNS: Column<Row>[] = [
  { key: "name", header: "Name", sortValue: (r) => r.name },
  { key: "turns", header: "Turns", align: "right", sortValue: (r) => r.turns },
  // computed/joined column with a custom renderer and NO sortValue (not sortable)
  {
    key: "email",
    header: "Email",
    render: (r) => r.email ?? "(guest)",
  },
];

function rowOrder(): string[] {
  // Read the rendered <tbody> rows top-to-bottom by their first (Name) cell.
  return screen
    .getAllByRole("row")
    .filter((tr) => within(tr).queryAllByTestId(/^admin-cell-/).length > 0)
    .map((tr) => within(tr).getAllByRole("cell")[0].textContent ?? "");
}

describe("DataTable", () => {
  it("renders a header for every column", () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
    expect(screen.getByTestId("admin-th-name")).toHaveTextContent("Name");
    expect(screen.getByTestId("admin-th-turns")).toHaveTextContent("Turns");
    expect(screen.getByTestId("admin-th-email")).toHaveTextContent("Email");
  });

  it("renders a row per data entry, keyed by rowKey", () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
    expect(screen.getByTestId("admin-row-a")).toBeInTheDocument();
    expect(screen.getByTestId("admin-row-b")).toBeInTheDocument();
    expect(screen.getByTestId("admin-row-c")).toBeInTheDocument();
  });

  it("renders cell bodies via the default accessor", () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
    expect(screen.getByTestId("admin-cell-a-name")).toHaveTextContent("Charizard");
    expect(screen.getByTestId("admin-cell-a-turns")).toHaveTextContent("12");
  });

  it("uses a column's custom render and shows the fallback for null values", () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
    expect(screen.getByTestId("admin-cell-a-email")).toHaveTextContent("c@x.io");
    // b.email is null → render() supplies the "(guest)" fallback
    expect(screen.getByTestId("admin-cell-b-email")).toHaveTextContent("(guest)");
  });

  describe("client-side sorting", () => {
    it("preserves the parent's row order when unsorted", () => {
      render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
      expect(rowOrder()).toEqual(["Charizard", "Blastoise", "Alakazam"]);
    });

    it("sorts ascending on first click of a sortable header", () => {
      render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
      fireEvent.click(screen.getByTestId("admin-sort-turns"));
      expect(rowOrder()).toEqual(["Blastoise", "Charizard", "Alakazam"]); // 5,12,30
    });

    it("toggles to descending on a second click of the same header", () => {
      render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
      fireEvent.click(screen.getByTestId("admin-sort-turns"));
      fireEvent.click(screen.getByTestId("admin-sort-turns"));
      expect(rowOrder()).toEqual(["Alakazam", "Charizard", "Blastoise"]); // 30,12,5
    });

    it("sorts strings via locale compare", () => {
      render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
      fireEvent.click(screen.getByTestId("admin-sort-name"));
      expect(rowOrder()).toEqual(["Alakazam", "Blastoise", "Charizard"]);
    });

    it("reflects the active sort via aria-sort and a direction indicator", () => {
      render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
      const th = screen.getByTestId("admin-th-turns");
      expect(th).toHaveAttribute("aria-sort", "none");
      fireEvent.click(screen.getByTestId("admin-sort-turns"));
      expect(th).toHaveAttribute("aria-sort", "ascending");
      expect(screen.getByTestId("admin-sort-indicator-turns")).toHaveTextContent(
        "▲",
      );
      fireEvent.click(screen.getByTestId("admin-sort-turns"));
      expect(th).toHaveAttribute("aria-sort", "descending");
      expect(screen.getByTestId("admin-sort-indicator-turns")).toHaveTextContent(
        "▼",
      );
    });

    it("honors initialSort", () => {
      render(
        <DataTable
          columns={COLUMNS}
          rows={ROWS}
          rowKey={(r) => r.id}
          initialSort={{ key: "turns", dir: "desc" }}
        />,
      );
      expect(rowOrder()).toEqual(["Alakazam", "Charizard", "Blastoise"]);
    });

    it("does not make a column without sortValue sortable (plain-text header)", () => {
      render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
      expect(screen.queryByTestId("admin-sort-email")).not.toBeInTheDocument();
      expect(screen.getByTestId("admin-th-email")).not.toHaveAttribute("aria-sort");
    });
  });

  describe("empty state", () => {
    it("shows the default empty message with no rows", () => {
      render(<DataTable columns={COLUMNS} rows={[]} rowKey={(r) => r.id} />);
      expect(screen.getByTestId("admin-table-empty")).toHaveTextContent("No rows.");
    });

    it("shows a custom empty message", () => {
      render(
        <DataTable
          columns={COLUMNS}
          rows={[]}
          rowKey={(r) => r.id}
          emptyMessage="No turns recorded yet."
        />,
      );
      expect(screen.getByTestId("admin-table-empty")).toHaveTextContent(
        "No turns recorded yet.",
      );
    });
  });

  describe("keyset 'Load more' affordance", () => {
    it("is hidden when hasMore is false/absent", () => {
      render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
      expect(
        screen.queryByTestId("admin-table-load-more"),
      ).not.toBeInTheDocument();
    });

    it("renders and fires onLoadMore when hasMore is true", () => {
      const onLoadMore = vi.fn();
      render(
        <DataTable
          columns={COLUMNS}
          rows={ROWS}
          rowKey={(r) => r.id}
          hasMore
          onLoadMore={onLoadMore}
        />,
      );
      fireEvent.click(screen.getByTestId("admin-table-load-more"));
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    it("disables the button and shows a loading label while loadingMore", () => {
      render(
        <DataTable
          columns={COLUMNS}
          rows={ROWS}
          rowKey={(r) => r.id}
          hasMore
          loadingMore
          onLoadMore={() => {}}
        />,
      );
      const btn = screen.getByTestId("admin-table-load-more");
      expect(btn).toBeDisabled();
      expect(btn).toHaveTextContent("Loading…");
    });
  });

  describe("read-only row drill-down (navigation, never a mutation)", () => {
    it("fires onRowClick with the clicked row", () => {
      const onRowClick = vi.fn();
      render(
        <DataTable
          columns={COLUMNS}
          rows={ROWS}
          rowKey={(r) => r.id}
          onRowClick={onRowClick}
        />,
      );
      fireEvent.click(screen.getByTestId("admin-row-c"));
      expect(onRowClick).toHaveBeenCalledTimes(1);
      expect(onRowClick).toHaveBeenCalledWith(ROWS[2]);
    });

    it("exposes no mutating controls — only sort + load-more buttons exist", () => {
      render(
        <DataTable
          columns={COLUMNS}
          rows={ROWS}
          rowKey={(r) => r.id}
          hasMore
          onLoadMore={() => {}}
          onRowClick={() => {}}
        />,
      );
      // Every button in the table is a sort header or the load-more affordance —
      // there are no edit/delete/save controls (ADMIN-BR-2 read-only).
      const buttons = screen.getAllByRole("button");
      for (const b of buttons) {
        const testid = b.getAttribute("data-testid") ?? "";
        expect(
          testid.startsWith("admin-sort-") || testid === "admin-table-load-more",
        ).toBe(true);
      }
    });
  });
});
