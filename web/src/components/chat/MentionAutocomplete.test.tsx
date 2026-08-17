/**
 * MentionAutocomplete — `@` team picker (MEN-US-1). Parent mounts this only
 * for signed-in users; guests never see it (MEN-AC-1.5, MEN-BR-4).
 *
 * Expected props:
 *   query: string
 *   teams: { id: string; name: string }[]
 *   onSelect: (team: { id: string; name: string }) => void
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());

import MentionAutocomplete from "./MentionAutocomplete";

const TEAMS = [
  { id: "team-rain", name: "Rain Offense" },
  { id: "team-sun", name: "Sun Offense" },
  { id: "team-balance", name: "Balance Core" },
];

describe("MentionAutocomplete (MEN-US-1)", () => {
  it("lists saved teams by current name (MEN-AC-1.1)", () => {
    render(
      <MentionAutocomplete query="" teams={TEAMS} onSelect={vi.fn()} />,
    );
    const list = screen.getByTestId("mention-autocomplete");
    expect(within(list).getByText("Rain Offense")).toBeInTheDocument();
    expect(within(list).getByText("Sun Offense")).toBeInTheDocument();
    expect(within(list).getByText("Balance Core")).toBeInTheDocument();
  });

  it("filters the list by the text after @", () => {
    render(
      <MentionAutocomplete query="sun" teams={TEAMS} onSelect={vi.fn()} />,
    );
    expect(screen.getByText("Sun Offense")).toBeInTheDocument();
    expect(screen.queryByText("Rain Offense")).toBeNull();
    expect(screen.queryByText("Balance Core")).toBeNull();
  });

  it("inserts the chosen team via onSelect (MEN-AC-1.1)", () => {
    const onSelect = vi.fn();
    render(
      <MentionAutocomplete query="" teams={TEAMS} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByRole("option", { name: "Rain Offense" }));
    expect(onSelect).toHaveBeenCalledWith({
      id: "team-rain",
      name: "Rain Offense",
    });
  });

  it("shows an empty/no-teams state instead of crashing (edge table)", () => {
    render(<MentionAutocomplete query="" teams={[]} onSelect={vi.fn()} />);
    expect(screen.getByTestId("mention-autocomplete")).toBeInTheDocument();
    expect(screen.getByTestId("mention-empty")).toBeInTheDocument();
    expect(screen.queryByRole("option")).toBeNull();
  });
});
