import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import FormatChips from "./FormatChips";
import { scopeLabelShort } from "@/lib/scope/scope-label";
import type { Format } from "@/data/formats";

describe("FormatChips", () => {
  it("renders a chip per format using scopeLabelShort", () => {
    render(<FormatChips formats={["champions", "scarlet-violet"]} />);
    expect(
      screen.getByText(scopeLabelShort("champions" as Format)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(scopeLabelShort("scarlet-violet" as Format)),
    ).toBeInTheDocument();
  });

  it("renders nothing for an empty format list", () => {
    const { container } = render(<FormatChips formats={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders non-interactive chips when hrefFor is omitted", () => {
    render(<FormatChips formats={["gen-7"]} />);
    const chip = screen.getByText(scopeLabelShort("gen-7" as Format));
    expect(chip.closest("a")).toBeNull();
  });

  it("renders linked chips with active state when hrefFor is set", () => {
    render(
      <FormatChips
        formats={["scarlet-violet", "gen-7"]}
        activeFormat="gen-7"
        hrefFor={(f) => `/pokedex/garchomp?format=${f}`}
      />,
    );

    const gen7 = screen.getByText(scopeLabelShort("gen-7" as Format));
    const gen9 = screen.getByText(scopeLabelShort("scarlet-violet" as Format));

    const gen7Link = gen7.closest("a");
    const gen9Link = gen9.closest("a");
    expect(gen7Link).toHaveAttribute(
      "href",
      "/pokedex/garchomp?format=gen-7",
    );
    expect(gen9Link).toHaveAttribute(
      "href",
      "/pokedex/garchomp?format=scarlet-violet",
    );
    expect(gen7Link).toHaveAttribute("aria-current", "true");
    expect(gen9Link).not.toHaveAttribute("aria-current");
    expect(gen7.closest("li")).toHaveClass("ref-formats__chip--active");
    expect(gen9.closest("li")).not.toHaveClass("ref-formats__chip--active");
  });
});
