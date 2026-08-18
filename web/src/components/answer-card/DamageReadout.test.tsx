import type { ComponentProps } from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
import DamageReadout from "./DamageReadout";
import { DAMAGE_CALC_GARCHOMP } from "@/components/test-fixtures";
import type { DamageCalc } from "@/components/types";

type DamageReadoutP6Props = ComponentProps<typeof DamageReadout> & {
  onOpenCalculator?: () => void;
};

function renderReadout(over: DamageReadoutP6Props) {
  render(<DamageReadout {...(over as ComponentProps<typeof DamageReadout>)} />);
}

describe("DamageReadout", () => {
  it("always shows the 'Estimate' tag", () => {
    render(<DamageReadout damageCalc={DAMAGE_CALC_GARCHOMP} />);
    expect(screen.getByTestId("damage-estimate-tag")).toHaveTextContent(
      "Estimate",
    );
  });

  it("renders all result key-value pairs", () => {
    render(<DamageReadout damageCalc={DAMAGE_CALC_GARCHOMP} />);
    const result = screen.getByTestId("damage-result");
    expect(result).toHaveTextContent("min_damage");
    expect(result).toHaveTextContent("142");
    expect(result).toHaveTextContent("max_damage");
    expect(result).toHaveTextContent("168");
  });

  it("renders the breakdown when present", () => {
    render(<DamageReadout damageCalc={DAMAGE_CALC_GARCHOMP} />);
    const breakdown = screen.getByTestId("damage-breakdown");
    expect(breakdown).toHaveTextContent(DAMAGE_CALC_GARCHOMP.breakdown!);
  });

  it("does not render a breakdown element when breakdown is absent", () => {
    const noBreakdown: DamageCalc = {
      ...DAMAGE_CALC_GARCHOMP,
      breakdown: undefined,
    };
    render(<DamageReadout damageCalc={noBreakdown} />);
    expect(screen.queryByTestId("damage-breakdown")).not.toBeInTheDocument();
  });

  it("renders assumptions in the collapsible section", () => {
    render(<DamageReadout damageCalc={DAMAGE_CALC_GARCHOMP} />);
    const assumptions = screen.getByTestId("damage-assumptions");
    expect(assumptions.tagName).toBe("DETAILS");
    // assumptions should contain each key
    expect(assumptions).toHaveTextContent("level");
    expect(assumptions).toHaveTextContent("50");
    expect(assumptions).toHaveTextContent("attacker");
    expect(assumptions).toHaveTextContent("Garchomp");
  });

  it("renders a stat-calc result as well as a damage result", () => {
    const statCalc: DamageCalc = {
      assumptions: {
        level: 50,
        base_stat: 102,
        iv: 31,
        ev: 0,
        nature: "neutral",
      },
      result: { stat: "speed", value: 169 },
      is_estimate: true,
      breakdown: "floor((floor((2*102+31+0)*50/100)+5)*1.0) = 169",
    };
    render(<DamageReadout damageCalc={statCalc} />);
    expect(screen.getByTestId("damage-result")).toHaveTextContent("169");
    expect(screen.getByTestId("damage-result")).toHaveTextContent("speed");
  });
});

describe("DamageReadout — Open in calculator (CALC-US-2, CALC-AC-2.1)", () => {
  it("offers Open in calculator to every user", () => {
    renderReadout({ damageCalc: DAMAGE_CALC_GARCHOMP });
    expect(
      screen.getByRole("button", { name: /open in calculator/i }),
    ).toBeInTheDocument();
  });

  it("fires onOpenCalculator with the block's assumptions when activated", () => {
    const onOpenCalculator = vi.fn();
    renderReadout({
      damageCalc: DAMAGE_CALC_GARCHOMP,
      onOpenCalculator,
    });
    fireEvent.click(screen.getByRole("button", { name: /open in calculator/i }));
    expect(onOpenCalculator).toHaveBeenCalledTimes(1);
    expect(onOpenCalculator).toHaveBeenCalledWith(DAMAGE_CALC_GARCHOMP);
  });
});
