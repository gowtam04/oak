/**
 * CommandPalette — web ⌘K overlay (NAV-US-1, ADR-10). Native has none.
 *
 * Expected props:
 *   open: boolean
 *   onClose: () => void
 *   signedIn: boolean
 *   query?: string
 *   onQueryChange?: (q: string) => void
 *   conversations?: { id: string; title: string }[]
 *   teams?: { id: string; name: string }[]
 *   onNewChat: () => void
 *   onOpenConversation?: (id: string) => void
 *   onOpenDex: (q?: string) => void
 *   onOpenTeam?: (id?: string) => void
 *   onOpenUsage: () => void
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());

import CommandPalette from "./CommandPalette";

const CONVOS = [
  { id: "c-rain", title: "Rain vs sun" },
  { id: "c-speed", title: "Garchomp Speed" },
];
const TEAMS = [{ id: "team-rain", name: "Rain Offense" }];

function renderPalette(
  over: Partial<Parameters<typeof CommandPalette>[0]> = {},
) {
  const handlers = {
    onClose: vi.fn(),
    onNewChat: vi.fn(),
    onOpenConversation: vi.fn(),
    onOpenDex: vi.fn(),
    onOpenTeam: vi.fn(),
    onOpenUsage: vi.fn(),
    onQueryChange: vi.fn(),
  };
  render(
    <CommandPalette
      open
      signedIn
      query=""
      conversations={CONVOS}
      teams={TEAMS}
      {...handlers}
      {...over}
    />,
  );
  return handlers;
}

describe("CommandPalette (NAV-US-1)", () => {
  it("renders nothing when closed", () => {
    render(
      <CommandPalette
        open={false}
        signedIn
        onClose={vi.fn()}
        onNewChat={vi.fn()}
        onOpenDex={vi.fn()}
        onOpenUsage={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("command-palette")).toBeNull();
  });

  it("lists New chat, Dex, and usage for everyone (NAV-AC-1.1)", () => {
    const h = renderPalette({ signedIn: false, conversations: [], teams: [] });
    const palette = screen.getByTestId("command-palette");
    expect(palette).toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: /new chat/i }));
    expect(h.onNewChat).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("option", { name: /dex|pok[eé]dex/i }));
    expect(h.onOpenDex).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("option", { name: /usage|meta/i }));
    expect(h.onOpenUsage).toHaveBeenCalledTimes(1);
  });

  it("lists conversations and saved teams when signed in (NAV-AC-1.1)", () => {
    const h = renderPalette({ signedIn: true });
    fireEvent.click(screen.getByRole("option", { name: "Rain vs sun" }));
    expect(h.onOpenConversation).toHaveBeenCalledWith("c-rain");
    fireEvent.click(screen.getByRole("option", { name: "Rain Offense" }));
    expect(h.onOpenTeam).toHaveBeenCalledWith("team-rain");
  });

  it("omits conversation and saved-team jumps for guests (NAV-AC-1.2)", () => {
    renderPalette({
      signedIn: false,
      conversations: CONVOS,
      teams: TEAMS,
    });
    expect(screen.queryByRole("option", { name: "Rain vs sun" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Rain Offense" })).toBeNull();
    expect(screen.queryByText("Rain vs sun")).toBeNull();
    expect(screen.getByRole("option", { name: /new chat/i })).toBeInTheDocument();
  });

  it("has no prompt-library entry (NAV-AC-1.4)", () => {
    renderPalette();
    expect(screen.queryByRole("option", { name: /prompt/i })).toBeNull();
    expect(screen.queryByText(/saved prompt/i)).toBeNull();
    expect(screen.queryByText(/prompt library/i)).toBeNull();
  });

  it("filters listed items by the search query", () => {
    renderPalette({ query: "Garchomp" });
    expect(screen.getByRole("option", { name: "Garchomp Speed" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Rain vs sun" })).toBeNull();
  });
});
