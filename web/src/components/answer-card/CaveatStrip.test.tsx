import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import CaveatStrip from "./CaveatStrip";
import {
  GENERATION_BASIS_GEN9,
  GENERATION_BASIS_FALLBACK,
} from "@/components/test-fixtures";

describe("CaveatStrip", () => {
  it("renders nothing when no flags and fallback=false", () => {
    const { container } = render(
      <CaveatStrip
        uncertaintyFlags={[]}
        generationBasis={GENERATION_BASIS_GEN9}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the strip when fallback=true", () => {
    render(
      <CaveatStrip
        uncertaintyFlags={[]}
        generationBasis={GENERATION_BASIS_FALLBACK}
      />,
    );
    expect(screen.getByTestId("caveat-strip")).toBeInTheDocument();
  });

  it("renders the fallback note text when fallback=true", () => {
    render(
      <CaveatStrip
        uncertaintyFlags={[]}
        generationBasis={GENERATION_BASIS_FALLBACK}
      />,
    );
    const banner = screen.getByTestId("caveat-fallback");
    expect(banner).toHaveTextContent(GENERATION_BASIS_FALLBACK.note!);
  });

  it("renders a default fallback message when note is absent", () => {
    const basisNoNote = { generation: "gen-8", fallback: true };
    render(<CaveatStrip uncertaintyFlags={[]} generationBasis={basisNoNote} />);
    const banner = screen.getByTestId("caveat-fallback");
    expect(banner).toHaveTextContent("gen-8");
  });

  it("renders each uncertainty flag", () => {
    const flags = ["Couldn't fetch item data", "Assumed standard ability"];
    render(
      <CaveatStrip
        uncertaintyFlags={flags}
        generationBasis={GENERATION_BASIS_GEN9}
      />,
    );
    expect(screen.getByTestId("caveat-flag-0")).toHaveTextContent(flags[0]);
    expect(screen.getByTestId("caveat-flag-1")).toHaveTextContent(flags[1]);
  });

  it("maps internal give-up flag codes to friendly text (not the raw code)", () => {
    render(
      <CaveatStrip
        uncertaintyFlags={["max_iterations_reached"]}
        generationBasis={GENERATION_BASIS_GEN9}
      />,
    );
    const flag = screen.getByTestId("caveat-flag-0");
    expect(flag).toHaveTextContent("Couldn't complete this answer");
    expect(flag).not.toHaveTextContent("max_iterations_reached");
  });

  it("maps the best-effort-team salvage flag to a slot-legality caveat", () => {
    render(
      <CaveatStrip
        uncertaintyFlags={["team_may_have_illegal_slots"]}
        generationBasis={GENERATION_BASIS_GEN9}
      />,
    );
    expect(screen.getByTestId("caveat-flag-0")).toHaveTextContent(
      "Some team slots may not be fully legal",
    );
  });

  it("renders an unknown (model-authored) flag verbatim", () => {
    const custom = "Assumed Gen 9 mechanics for this matchup";
    render(
      <CaveatStrip
        uncertaintyFlags={[custom]}
        generationBasis={GENERATION_BASIS_GEN9}
      />,
    );
    expect(screen.getByTestId("caveat-flag-0")).toHaveTextContent(custom);
  });

  it("renders the strip when there are flags but fallback=false", () => {
    render(
      <CaveatStrip
        uncertaintyFlags={["Couldn't reach PokeAPI"]}
        generationBasis={GENERATION_BASIS_GEN9}
      />,
    );
    expect(screen.getByTestId("caveat-strip")).toBeInTheDocument();
    expect(screen.queryByTestId("caveat-fallback")).not.toBeInTheDocument();
  });

  it("renders both fallback and flags when both are present", () => {
    render(
      <CaveatStrip
        uncertaintyFlags={["Some flag"]}
        generationBasis={GENERATION_BASIS_FALLBACK}
      />,
    );
    expect(screen.getByTestId("caveat-fallback")).toBeInTheDocument();
    expect(screen.getByTestId("caveat-flag-0")).toBeInTheDocument();
  });
});
