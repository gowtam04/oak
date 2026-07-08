/**
 * jsdom tests for TeamAnalysisPanel. The fetch helper is mocked (no network, no
 * db/repos), so these pin the panel's states off a fixture payload: the
 * no-species hint (no call fired), the ok render (defense / coverage / speed /
 * caveat), and the error → Retry path (a second call fires).
 */

import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";

import type { TeamMember } from "@/data/teams/team-schema";
import type { TeamAnalysisOk } from "@/lib/teams/team-analysis";

// Mock the fetch helper — the panel's only outward dependency.
vi.mock("@/lib/api/team-analysis-client", () => ({
  fetchTeamAnalysis: vi.fn(),
}));
import { fetchTeamAnalysis } from "@/lib/api/team-analysis-client";
import TeamAnalysisPanel from "./TeamAnalysisPanel";

const mockFetch = vi.mocked(fetchTeamAnalysis);

function member(overrides: Partial<TeamMember>): TeamMember {
  return {
    species: null,
    ability: null,
    item: null,
    moves: [],
    nature: null,
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    tera_type: null,
    level: 50,
    ...overrides,
  };
}

const OK: TeamAnalysisOk = {
  status: "ok",
  format: "scarlet-violet",
  members: [
    {
      slug: "garchomp",
      found: true,
      display_name: "Garchomp",
      types: ["dragon", "ground"],
      bst: 600,
      stats: { hp: 183, atk: 130, def: 115, spa: 80, spd: 105, spe: 122 },
      level: 50,
      nature: "jolly",
    },
  ],
  defense: [
    { type: "ice", weak: ["garchomp"], resists: [], immune: [] },
    { type: "electric", weak: [], resists: [], immune: ["garchomp"] },
  ],
  offense: {
    covered: [{ type: "fire", by: [{ member: "garchomp", move: "earthquake" }] }],
    uncovered: ["water"],
  },
  speed_tiers: [{ member: "garchomp", speed: 122 }],
  notes: ["Coverage is type-based only."],
};

beforeEach(() => mockFetch.mockReset());
afterEach(() => cleanup());

describe("TeamAnalysisPanel", () => {
  it("shows the hint and fires no request when no member has a species", () => {
    render(
      <TeamAnalysisPanel members={[member({})]} format="scarlet-violet" />,
    );
    expect(screen.getByTestId("team-analysis-hint")).toHaveTextContent(
      /Add a Pokémon/,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("renders the analysis after the debounce settles", async () => {
    mockFetch.mockResolvedValue(OK);
    render(
      <TeamAnalysisPanel
        members={[member({ species: "garchomp" })]}
        format="scarlet-violet"
      />,
    );

    // Defensive weakness row for Ice, with the member listed.
    const iceRow = await screen.findByTestId("defense-ice");
    expect(iceRow).toHaveTextContent("×1");
    expect(iceRow).toHaveTextContent("Garchomp");

    // Offensive coverage — covered Fire chip and an uncovered Water chip.
    expect(screen.getByTestId("team-analysis-offense")).toBeInTheDocument();
    const uncovered = screen.getByTestId("team-analysis-uncovered");
    expect(uncovered).toHaveTextContent("water");

    // Speed order + caveat note.
    expect(screen.getByTestId("team-analysis-speed")).toHaveTextContent("122");
    expect(screen.getByTestId("team-analysis-caveat")).toHaveTextContent(
      /type-based only/,
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("shows an error with Retry, and Retry fires a second request", async () => {
    mockFetch.mockResolvedValue(null);
    render(
      <TeamAnalysisPanel
        members={[member({ species: "garchomp" })]}
        format="scarlet-violet"
      />,
    );

    const retry = await screen.findByTestId("team-analysis-retry");
    expect(screen.getByTestId("team-analysis-error")).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockResolvedValue(OK);
    fireEvent.click(retry);

    // The retry re-runs the debounced fetch, and the ok content appears.
    await screen.findByTestId("defense-ice");
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });
});
