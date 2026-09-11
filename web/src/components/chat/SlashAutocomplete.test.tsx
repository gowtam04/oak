/**
 * SlashAutocomplete — composer `/` picker listbox (slash-discovery P2).
 *
 * Presentational only: command rows OR name rows OR an empty line, plus
 * caption. Keyboard, debounce, and search live on Composer.
 *
 * Expected props (implementer must match):
 *   commands?: readonly CommandRow[]
 *     Command-phase rows from slashPickerPhase / SLASH_COMMANDS.
 *   names?: DexNameRow[]
 *     Arg-phase Dex / Usage name rows (displayName + kind; sprite optional).
 *   empty?: string | null
 *     Arg-phase empty line: EMPTY_DEX / EMPTY_USAGE / EMPTY_TEAMS /
 *     EMPTY_TEAMS_GUEST. No role="option" when set.
 *   guest?: boolean
 *     When true, `/team` uses hintGuest; otherwise `hint`.
 *   highlightedIndex?: number
 *     0-based; that option gets aria-selected="true".
 *   onPick: (
 *     pick:
 *       | { type: "command"; token: string }
 *       | { type: "name"; row: DexNameRow }
 *       | { type: "calc-skip-move" },
 *   ) => void
 *   caption?: string — defaults to PICKER_CAPTION
 *   skipMove?: boolean — pinned vs … row
 *
 * Container: data-testid="slash-autocomplete", role="listbox",
 * accessible name "Slash commands". Caption defaults to PICKER_CAPTION.
 * Rows are role="option". Do not add extra chrome.
 *
 * Refs: SD-AC-1.1, SD-AC-1.5, SD-AC-3.5, SD-AC-3.7, SD-BR-9, SD-BR-13.
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());

import SlashAutocomplete from "./SlashAutocomplete";
import {
  EMPTY_DEX,
  EMPTY_TEAMS,
  EMPTY_TEAMS_GUEST,
  EMPTY_USAGE,
  PICKER_CAPTION,
  SLASH_COMMANDS,
  type DexNameRow,
} from "@/lib/chat/slash-picker";
import {
  CALC_CAPTION_MOVE,
  CALC_SKIP_MOVE,
  CALC_SKIP_MOVE_HINT,
} from "@/lib/chat/slash-calc";

const NAMES: DexNameRow[] = [
  { slug: "garchomp", displayName: "Garchomp", kind: "pokemon" },
  { slug: "earthquake", displayName: "Earthquake", kind: "move" },
];

describe("SlashAutocomplete", () => {
  it("is a listbox named Slash commands with the insert caption (SD-AC-1.1, SD-AC-1.5, SD-BR-9)", () => {
    render(
      <SlashAutocomplete commands={[...SLASH_COMMANDS]} onPick={vi.fn()} />,
    );
    const list = screen.getByTestId("slash-autocomplete");
    expect(list).toHaveAttribute("role", "listbox");
    expect(
      screen.getByRole("listbox", { name: "Slash commands" }),
    ).toBe(list);
    expect(within(list).getByText(PICKER_CAPTION)).toBeInTheDocument();
    expect(PICKER_CAPTION).toBe("Insert, then send");
  });

  it("renders six command rows as token + hint (SD-AC-1.1)", () => {
    render(
      <SlashAutocomplete
        commands={[...SLASH_COMMANDS]}
        guest={false}
        onPick={vi.fn()}
      />,
    );
    const list = screen.getByTestId("slash-autocomplete");
    const options = within(list).getAllByRole("option");
    expect(options).toHaveLength(6);
    for (const row of SLASH_COMMANDS) {
      const option = within(list).getByRole("option", {
        name: new RegExp(row.token.replace("/", "\\/")),
      });
      expect(option).toHaveTextContent(row.token);
      expect(option).toHaveTextContent(row.hint);
    }
  });

  it("uses hintGuest on /team when guest (SD-AC-1.1, SD-BR-13)", () => {
    render(
      <SlashAutocomplete commands={[...SLASH_COMMANDS]} guest onPick={vi.fn()} />,
    );
    const team = screen.getByRole("option", { name: /\/team/ });
    expect(team).toHaveTextContent("Open Teams · sign in to save");
    expect(screen.queryByText("Open Teams")).toBeNull();
  });

  it("uses the signed-in /team hint when guest is false", () => {
    render(
      <SlashAutocomplete
        commands={[...SLASH_COMMANDS]}
        guest={false}
        onPick={vi.fn()}
      />,
    );
    const team = screen.getByRole("option", { name: /\/team/ });
    expect(team).toHaveTextContent("Open Teams");
    expect(team).not.toHaveTextContent("sign in to save");
  });

  it("renders name rows as displayName + kind (SD-AC-3.2)", () => {
    render(<SlashAutocomplete names={NAMES} onPick={vi.fn()} />);
    const list = screen.getByTestId("slash-autocomplete");
    expect(within(list).getByText(PICKER_CAPTION)).toBeInTheDocument();
    const garchomp = within(list).getByRole("option", { name: /garchomp/i });
    expect(garchomp).toHaveTextContent("Garchomp");
    expect(garchomp).toHaveTextContent(/pokemon|pokémon/i);
    const quake = within(list).getByRole("option", { name: /earthquake/i });
    expect(quake).toHaveTextContent("Earthquake");
    expect(quake).toHaveTextContent(/move/i);
  });

  it("shows EMPTY_DEX / EMPTY_USAGE / EMPTY_TEAMS / EMPTY_TEAMS_GUEST with no options (SD-AC-3.5, SD-AC-3.7)", () => {
    for (const copy of [EMPTY_DEX, EMPTY_USAGE, EMPTY_TEAMS, EMPTY_TEAMS_GUEST]) {
      const { unmount } = render(
        <SlashAutocomplete empty={copy} onPick={vi.fn()} />,
      );
      const list = screen.getByTestId("slash-autocomplete");
      expect(within(list).getByText(copy)).toBeInTheDocument();
      expect(within(list).getByText(PICKER_CAPTION)).toBeInTheDocument();
      expect(within(list).queryByRole("option")).toBeNull();
      unmount();
    }
    expect(EMPTY_DEX).toBe("No Dex matches");
    expect(EMPTY_USAGE).toBe("No usage matches");
    expect(EMPTY_TEAMS).toBe("No saved teams match");
    expect(EMPTY_TEAMS_GUEST).toBe("Sign in to save teams");
  });

  it("clicking a command row calls onPick with that token (SD-BR-7)", () => {
    const onPick = vi.fn();
    render(
      <SlashAutocomplete commands={[...SLASH_COMMANDS]} onPick={onPick} />,
    );
    fireEvent.click(screen.getByRole("option", { name: /\/dex/ }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith({ type: "command", token: "/dex" });
  });

  it("clicking a name row calls onPick with that DexNameRow (SD-AC-2.3)", () => {
    const onPick = vi.fn();
    render(<SlashAutocomplete names={NAMES} onPick={onPick} />);
    fireEvent.click(screen.getByRole("option", { name: /garchomp/i }));
    expect(onPick).toHaveBeenCalledWith({ type: "name", row: NAMES[0] });
  });

  it("overrides the caption when caption is passed (SD-US-10)", () => {
    render(
      <SlashAutocomplete
        names={NAMES}
        caption={CALC_CAPTION_MOVE}
        onPick={vi.fn()}
      />,
    );
    expect(screen.getByText(CALC_CAPTION_MOVE)).toBeInTheDocument();
    expect(screen.queryByText(PICKER_CAPTION)).toBeNull();
  });

  it("renders a skip-move row that picks calc-skip-move (SD-US-10)", () => {
    const onPick = vi.fn();
    render(
      <SlashAutocomplete
        names={NAMES}
        skipMove
        highlightedIndex={0}
        onPick={onPick}
      />,
    );
    const skip = screen.getByTestId("slash-ac-skip-move");
    expect(skip).toHaveTextContent(CALC_SKIP_MOVE);
    expect(skip).toHaveTextContent(CALC_SKIP_MOVE_HINT);
    expect(skip).toHaveAttribute("aria-selected", "true");
    fireEvent.click(skip);
    expect(onPick).toHaveBeenCalledWith({ type: "calc-skip-move" });
  });

  it("marks the highlighted row aria-selected=true", () => {
    render(
      <SlashAutocomplete
        commands={[...SLASH_COMMANDS]}
        highlightedIndex={2}
        onPick={vi.fn()}
      />,
    );
    const options = screen.getAllByRole("option");
    const selected = options.filter(
      (el) => el.getAttribute("aria-selected") === "true",
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent("/dex");
    expect(options[2]).toHaveAttribute("aria-selected", "true");
  });
});
