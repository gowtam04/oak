/**
 * FollowUpChipRow — render derived hop chips (CHIP-US-1, ADR-9).
 * Caps / kinds are owned by `deriveFollowUpChips`; this row only renders.
 *
 * Expected props:
 *   chips: FollowUpChip[]
 *   onSelect: (chip: FollowUpChip) => void
 *   disabled?: boolean
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());

import FollowUpChipRow from "./FollowUpChipRow";
import {
  deriveFollowUpChips,
  type FollowUpChip,
} from "@/lib/chat/follow-up-chips";
import { MINIMAL_ANSWER, CANONICAL_ANSWER } from "@/components/test-fixtures";

describe("FollowUpChipRow (CHIP-US-1)", () => {
  it("renders nothing when there are no chips (CHIP-AC-1.5)", () => {
    const { container } = render(
      <FollowUpChipRow chips={[]} onSelect={vi.fn()} />,
    );
    expect(screen.queryByTestId("follow-up-chip-row")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders derived Dex / team labels and reports the chip on click", () => {
    const chips = deriveFollowUpChips({
      answer: CANONICAL_ANSWER,
      impliedFormat: "scarlet-violet",
      mentionedTeam: { id: "team-rain", name: "Rain Offense" },
    });
    const onSelect = vi.fn();
    render(<FollowUpChipRow chips={chips} onSelect={onSelect} />);

    const row = screen.getByTestId("follow-up-chip-row");
    expect(row).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Switch to /i }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Open Garchomp in Dex" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open Rain Offense" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Garchomp in Dex" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const sent = onSelect.mock.calls[0]![0] as FollowUpChip;
    expect(sent.kind).toBe("dex");
    expect(sent.target).toBe("Garchomp");
  });

  it("never shows calc / add-to-team / tell-me-more chrome (CHIP-AC-1.4)", () => {
    const chips = deriveFollowUpChips({
      answer: { ...MINIMAL_ANSWER, subjects: CANONICAL_ANSWER.subjects },
      impliedFormat: "gen-7",
    });
    render(<FollowUpChipRow chips={chips} onSelect={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /calc/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /add .+ to a team/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /tell me more/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /compare/i })).toBeNull();
  });

  it("disables chips while a turn is streaming", () => {
    const chips = deriveFollowUpChips({ answer: CANONICAL_ANSWER });
    const onSelect = vi.fn();
    render(<FollowUpChipRow chips={chips} onSelect={onSelect} disabled />);
    const chip = screen.getByRole("button", { name: "Open Garchomp in Dex" });
    expect(chip).toBeDisabled();
    fireEvent.click(chip);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
