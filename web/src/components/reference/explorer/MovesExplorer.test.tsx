import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());

import MovesExplorer from "./MovesExplorer";
import type { MoveIndexRow } from "@/lib/reference-pages-types";

const ROWS: MoveIndexRow[] = [
  { slug: "ember", displayName: "Ember", type: "fire", power: 40, damageClass: "special" },
  { slug: "surf", displayName: "Surf", type: "water", power: 90, damageClass: "special" },
  { slug: "tackle", displayName: "Tackle", type: "normal", power: 40, damageClass: "physical" },
  { slug: "growl", displayName: "Growl", type: "normal", power: null, damageClass: "status" },
];

describe("MovesExplorer", () => {
  it("renders a status move's power as an em dash", () => {
    render(<MovesExplorer rows={ROWS} />);
    const growl = screen.getByRole("link", { name: /Growl/ });
    expect(growl).toHaveTextContent("—");
  });

  it("composes the category and type facets (AND across)", () => {
    render(<MovesExplorer rows={ROWS} />);
    fireEvent.click(screen.getByRole("button", { name: "Special" }));
    fireEvent.click(screen.getByRole("button", { name: "fire" }));
    // special ∩ fire → Ember only (Surf is special but water).
    expect(screen.getByRole("link", { name: /Ember/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Surf/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Tackle/ })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("1 RESULTS");
  });

  it("flattens on a query", async () => {
    render(<MovesExplorer rows={ROWS} />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "surf" },
    });
    expect(await screen.findByRole("link", { name: /Surf/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Ember/ })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("1 RESULTS");
  });

  it("empty search says nothing on the Champions roster matched (CF-DEX-AC-1.3, CF-UI-AC-7.2)", () => {
    render(<MovesExplorer rows={ROWS} />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "zzzznope" },
    });
    expect(screen.getByTestId("ref-empty")).toHaveTextContent(
      /champions roster/i,
    );
    expect(screen.queryByText(/National Dex/i)).toBeNull();
  });
});
