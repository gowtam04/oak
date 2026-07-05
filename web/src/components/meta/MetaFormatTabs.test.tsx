import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import MetaFormatTabs from "./MetaFormatTabs";

describe("MetaFormatTabs", () => {
  it("renders a link per tab", () => {
    render(
      <MetaFormatTabs
        tabs={[
          { id: "gen9ou", shortLabel: "Gen 9 OU", href: "/meta/gen9ou", current: true },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Gen 9 OU" })).toHaveAttribute(
      "href",
      "/meta/gen9ou",
    );
  });

  it("marks the current tab with aria-current", () => {
    render(
      <MetaFormatTabs
        tabs={[
          { id: "gen9ou", shortLabel: "Gen 9 OU", href: "/meta/gen9ou", current: true },
          { id: "gen9vgc", shortLabel: "VGC", href: "/meta/gen9vgc", current: false },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Gen 9 OU" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "VGC" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("renders nothing for an empty tab list", () => {
    const { container } = render(<MetaFormatTabs tabs={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
