import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());

import NamesExplorer from "./NamesExplorer";
import type { NameRow } from "@/lib/reference-pages-types";

const ROWS: NameRow[] = [
  { slug: "overgrow", displayName: "Overgrow" },
  { slug: "blaze", displayName: "Blaze" },
  { slug: "torrent", displayName: "Torrent" },
];

describe("NamesExplorer", () => {
  it("links each row under the given basePath", () => {
    const { unmount } = render(
      <NamesExplorer
        rows={ROWS}
        basePath="/abilities"
        noun="ABILITIES"
        searchPlaceholder="Search abilities"
      />,
    );
    expect(screen.getByRole("link", { name: "Blaze" })).toHaveAttribute(
      "href",
      "/abilities/blaze",
    );
    expect(screen.getByRole("status")).toHaveTextContent("3 ABILITIES");
    unmount();

    render(
      <NamesExplorer
        rows={ROWS}
        basePath="/items"
        noun="ITEMS"
        searchPlaceholder="Search items"
      />,
    );
    expect(screen.getByRole("link", { name: "Torrent" })).toHaveAttribute(
      "href",
      "/items/torrent",
    );
  });

  it("has no facet chips (search-only)", () => {
    render(
      <NamesExplorer
        rows={ROWS}
        basePath="/abilities"
        noun="ABILITIES"
        searchPlaceholder="Search abilities"
      />,
    );
    // Idle: only the search field, no chip/clear buttons.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("filters to matching rows on search", async () => {
    render(
      <NamesExplorer
        rows={ROWS}
        basePath="/abilities"
        noun="ABILITIES"
        searchPlaceholder="Search abilities"
      />,
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "bla" },
    });
    expect(await screen.findByRole("link", { name: "Blaze" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Torrent" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("1 RESULTS");
  });

  it("empty search says nothing on the Champions roster matched (CF-DEX-AC-1.3, CF-UI-AC-7.2)", () => {
    render(
      <NamesExplorer
        rows={ROWS}
        basePath="/abilities"
        noun="ABILITIES"
        searchPlaceholder="Search abilities"
      />,
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "zzzznope" },
    });
    expect(screen.getByTestId("ref-empty")).toHaveTextContent(
      /champions roster/i,
    );
    expect(screen.queryByText(/National Dex/i)).toBeNull();
    expect(screen.queryByText(/Scarlet/i)).toBeNull();
  });
});
