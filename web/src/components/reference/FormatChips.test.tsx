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
});
