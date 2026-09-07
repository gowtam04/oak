/**
 * P6 — Calculator overlay + shared form (CALC-US-1–2, CALC-US-8–9).
 *
 * Imports the intended P6 components (`CalculatorPanel`, `CalculatorOverlay`).
 * A failed resolve is the intended red until those files exist.
 *
 * Requirement refs: CALC-US-1, CALC-AC-1.1, CALC-US-2, CALC-AC-2.1–2.4,
 * CALC-US-3 (dispatch, not parse), CALC-AC-3.1–3.3, CALC-BR-4,
 * CALC-US-4, CALC-AC-4.1 / 4.4, CALC-US-5, CALC-AC-5.3–5.4, CALC-BR-8,
 * CALC-US-6, CALC-AC-6.1 / 6.3, CALC-US-8, CALC-AC-8.1–8.3, CALC-BR-1.
 */

import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { explainCalcPrompt } from "@/lib/calc/explain-prompt";
import type { CalcResult, CalcScenario } from "@/lib/calc/calc-schema";

const { postCalc } = vi.hoisted(() => ({
  postCalc: vi.fn(),
}));
vi.mock("@/lib/api/calc-client", () => ({ postCalc }));

import CalculatorPanel from "./CalculatorPanel";
import CalculatorOverlay from "./CalculatorOverlay";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const EMPTY_SCENARIO: CalcScenario = {
  format: "champions",
  attacker: {},
  defender: {},
  move: {},
};

const COMPLETE_SCENARIO: CalcScenario = {
  format: "champions",
  attacker: {
    species: "garchomp",
    item: "life-orb",
    ability: "rough-skin",
    nature: "jolly",
    evs: { atk: 32, spe: 32, hp: 2 },
    level: 50,
  },
  defender: {
    species: "farigiraf",
    item: "leftovers",
    ability: "armor-tail",
    nature: "modest",
    evs: { hp: 32, spd: 32 },
    level: 50,
  },
  move: { slug: "earthquake", name: "Earthquake" },
  field: { weather: "sun", reflect: true, light_screen: false },
};

const SUCCESS: CalcResult = {
  ok: true,
  format: "champions",
  estimate: {
    min_damage: 100,
    max_damage: 120,
    percent_min: 30,
    percent_max: 36,
    ko: { hits: 3 },
    is_estimate: true,
  },
  breakdown: "estimate",
  applied: {
    stab: true,
    type_effectiveness: 1,
    other_modifier: 1.3,
    weather: "sun",
    screens: ["Reflect"],
    item: "life-orb",
    unsupported: ["leftovers"],
  },
};

const INCOMPLETE: CalcResult = {
  ok: false,
  error: "incomplete",
  detail: "attacker species and move are required",
};

type PanelProps = ComponentProps<typeof CalculatorPanel>;

function renderPanel(over: Partial<PanelProps> = {}) {
  const props = {
    format: "champions",
    scenario: EMPTY_SCENARIO,
    ...over,
  } as PanelProps;
  return render(<CalculatorPanel {...props} />);
}

describe("CalculatorPanel — first-class form (CALC-US-1, CALC-AC-1.1, CF-CALC-AC-1.1)", () => {
  beforeEach(() => {
    postCalc.mockResolvedValue(INCOMPLETE);
  });

  it("renders two empty sides, a move control, and field knobs — no format picker", () => {
    renderPanel();

    expect(screen.getByTestId("calculator-panel")).toBeInTheDocument();
    expect(screen.getByTestId("calc-side-attacker")).toBeInTheDocument();
    expect(screen.getByTestId("calc-side-defender")).toBeInTheDocument();
    expect(screen.getByTestId("calc-move")).toBeInTheDocument();
    expect(screen.getByTestId("calc-field")).toBeInTheDocument();
    expect(screen.queryByTestId("calc-format")).toBeNull();
    expect(screen.getByTestId("calc-side-attacker")).toHaveTextContent(/Level 50/);
    expect(screen.getByTestId("calc-side-attacker")).toHaveTextContent(
      /Stat Points/,
    );
  });

  it("exposes documented field knobs: weather + Reflect + Light Screen (CALC-AC-4.1, CALC-BR-3)", () => {
    renderPanel();
    const field = screen.getByTestId("calc-field");
    expect(field).toHaveTextContent(/weather/i);
    expect(field).toHaveTextContent(/sun/i);
    expect(field).toHaveTextContent(/rain/i);
    expect(field).toHaveTextContent(/sand/i);
    expect(field).toHaveTextContent(/snow/i);
    expect(screen.getByRole("checkbox", { name: /reflect/i })).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /light screen/i }),
    ).toBeInTheDocument();
  });

  it("does not POST a chat turn when knobs change (CALC-BR-1)", () => {
    const onExplain = vi.fn();
    renderPanel({ onExplain } as Partial<PanelProps>);
    fireEvent.click(screen.getByRole("radio", { name: /sun/i }));
    expect(onExplain).not.toHaveBeenCalled();
    expect(
      postCalc.mock.calls.every((call) => {
        const url = String(call[0] ?? "");
        return !url.includes("/api/chat");
      }),
    ).toBe(true);
  });
});

describe("CalculatorPanel — incomplete never invents 0 (CALC-AC-5.4, CALC-BR-8)", () => {
  beforeEach(() => {
    postCalc.mockResolvedValue(INCOMPLETE);
  });

  it("shows an empty/incomplete result area, not a fabricated 0 roll", () => {
    renderPanel();
    const result = screen.getByTestId("calculator-result");
    expect(
      screen.getByTestId("calculator-result-empty"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("calculator-estimate")).toBeNull();
    expect(result).not.toHaveTextContent(/\b0\s*[–-]\s*0\b/);
    expect(result).not.toHaveTextContent("min_damage");
  });

  it("keeps the empty state when postCalc returns incomplete (CALC-AC-5.4)", async () => {
    renderPanel({ scenario: { ...EMPTY_SCENARIO, attacker: { species: "garchomp" } } });
    await waitFor(() => expect(postCalc).toHaveBeenCalled());
    expect(screen.getByTestId("calculator-result-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("calculator-estimate")).toBeNull();
  });
});

describe("CalculatorPanel — successful estimate (CALC-AC-4.4, CALC-AC-5.1, CALC-AC-5.3)", () => {
  it("labels the result an estimate and shows range / percent / KO", async () => {
    postCalc.mockResolvedValue(SUCCESS);
    renderPanel({ scenario: COMPLETE_SCENARIO });
    const estimate = await screen.findByTestId("calculator-estimate");
    expect(estimate).toHaveTextContent(/estimate/i);
    expect(estimate).toHaveTextContent("100");
    expect(estimate).toHaveTextContent("120");
    expect(estimate).toHaveTextContent("30");
    expect(estimate).toHaveTextContent("36");
  });

  it("labels leftovers not modeled rather than applying a silent 1.0 (CALC-AC-4.3)", async () => {
    postCalc.mockResolvedValue(SUCCESS);
    renderPanel({ scenario: COMPLETE_SCENARIO });
    const unsupported = await screen.findByTestId("calculator-unsupported");
    expect(unsupported).toHaveTextContent(/leftovers/i);
    expect(unsupported).toHaveTextContent(/not modeled/i);
  });

  it("shows a persistent caveat when the result carries one (CALC-AC-6.3)", async () => {
    postCalc.mockResolvedValue({
      ...SUCCESS,
      caveat: "Modern estimate — not gen-accurate.",
    });
    renderPanel({ scenario: COMPLETE_SCENARIO });
    expect(await screen.findByTestId("calculator-caveat")).toHaveTextContent(
      /not gen-accurate/i,
    );
  });
});

describe("CalculatorOverlay — hops and /calc dispatch (CALC-US-2, CALC-US-3)", () => {
  beforeEach(() => {
    postCalc.mockResolvedValue(INCOMPLETE);
  });

  it("opens a compact overlay without sending a chat turn (CALC-AC-2.4, CALC-AC-3.1, CALC-BR-4)", () => {
    const onSend = vi.fn();
    const onDismiss = vi.fn();
    render(
      <CalculatorOverlay
        open
        format="champions"
        slashRest=""
        onSend={onSend}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByTestId("calculator-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("calculator-panel")).toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("opens from /calc rest without posting a turn even when tokens are unresolved (CALC-AC-3.2, CALC-AC-3.3)", () => {
    const onSend = vi.fn();
    render(
      <CalculatorOverlay
        open
        format="champions"
        slashRest="garchomp earthquake vs gholdengo"
        onSend={onSend}
      />,
    );
    expect(screen.getByTestId("calculator-overlay")).toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("has Expand and stays on the thread until Expand or dismiss (CALC-AC-2.3)", () => {
    const onExpand = vi.fn();
    render(
      <CalculatorOverlay
        open
        format="champions"
        scenario={COMPLETE_SCENARIO}
        onExpand={onExpand}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^expand$/i }));
    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(onExpand).toHaveBeenCalledWith(
      expect.objectContaining({ format: "champions" }),
    );
  });

  it("dismiss does not send a chat turn (CALC-AC-2.4)", () => {
    const onSend = vi.fn();
    const onDismiss = vi.fn();
    render(
      <CalculatorOverlay
        open
        format="champions"
        onSend={onSend}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /dismiss|close/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe("CalculatorOverlay — Explain this calc (CALC-US-8, CALC-AC-8.1–8.3)", () => {
  it("sends the deterministic explain prompt and does not close the overlay (CALC-AC-8.2, CALC-AC-8.3)", async () => {
    postCalc.mockResolvedValue(SUCCESS);
    const onExplain = vi.fn();
    const onDismiss = vi.fn();
    const onSend = vi.fn();
    render(
      <CalculatorOverlay
        open
        format="champions"
        scenario={COMPLETE_SCENARIO}
        onExplain={onExplain}
        onDismiss={onDismiss}
        onSend={onSend}
      />,
    );

    const explain = await screen.findByRole("button", {
      name: /explain this calc/i,
    });
    fireEvent.click(explain);

    expect(onExplain).toHaveBeenCalledTimes(1);
    expect(onExplain).toHaveBeenCalledWith(
      explainCalcPrompt(COMPLETE_SCENARIO, SUCCESS),
    );
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByTestId("calculator-overlay")).toBeInTheDocument();
    // Overlay stays configured — attacker species is still on the form.
    expect(screen.getByTestId("calc-side-attacker")).toHaveTextContent(
      /garchomp/i,
    );
  });
});
