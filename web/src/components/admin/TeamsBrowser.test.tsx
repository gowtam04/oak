import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

import TeamsBrowser, { type TeamsBrowserProps } from "./TeamsBrowser";
import type { TeamDetail, TeamSummary } from "@/lib/admin/admin-types";
import type { StatSpread, TeamMember } from "@/data/teams/team-schema";

// ---------------------------------------------------------------------------
// Fixtures — TeamSummary rows (the GET /api/admin/teams projection) + a
// TeamDetail (GET /api/admin/teams/{id}). Components render fixtures only; no
// db/repos imported (admin component-test rule).
// ---------------------------------------------------------------------------

const ZERO_EVS: StatSpread = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const MAX_IVS: StatSpread = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

/** A complete, signed-in, Scarlet/Violet team. */
const TEAM_FULL: TeamSummary = {
  id: "team-1",
  accountId: "a-1",
  accountEmail: "trainer@example.com",
  name: "Sand Offense",
  format: "scarlet-violet",
  memberCount: 6,
  incomplete: false,
  species: ["garchomp", "tyranitar", "excadrill", "rotom-wash", "ferrothorn", "landorus-therian"],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_900_000,
};

/** An incomplete team owned by an account with no joined email. */
const TEAM_PARTIAL: TeamSummary = {
  id: "team-2",
  accountId: "a-2",
  accountEmail: null,
  name: "WIP Champions Squad",
  format: "champions",
  memberCount: 3,
  incomplete: true,
  species: ["miraidon", "flutter-mane", "ogerpon-wellspring"],
  createdAt: 1_700_000_500_000,
  updatedAt: 1_700_000_600_000,
};

const ROWS = [TEAM_FULL, TEAM_PARTIAL];

const GARCHOMP: TeamMember = {
  species: "garchomp",
  ability: "rough-skin",
  item: "loaded-dice",
  moves: ["earthquake", "scale-shot", "stealth-rock", "swords-dance"],
  nature: "jolly",
  evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
  ivs: MAX_IVS,
  tera_type: "steel",
  level: 50,
};

/** An empty (unfilled) slot — species null. */
const EMPTY_SLOT: TeamMember = {
  species: null,
  ability: null,
  item: null,
  moves: [],
  nature: null,
  evs: ZERO_EVS,
  ivs: MAX_IVS,
  tera_type: null,
  level: 50,
};

const TEAM_DETAIL: TeamDetail = {
  id: "team-1",
  accountId: "a-1",
  accountEmail: "trainer@example.com",
  name: "Sand Offense",
  format: "scarlet-violet",
  members: [GARCHOMP, EMPTY_SLOT],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_900_000,
};

function renderBrowser(overrides: Partial<TeamsBrowserProps> = {}) {
  const props: TeamsBrowserProps = {
    query: "",
    onQueryChange: vi.fn(),
    format: "",
    onFormatChange: vi.fn(),
    teams: ROWS,
    ...overrides,
  };
  render(<TeamsBrowser {...props} />);
  return props;
}

describe("TeamsBrowser", () => {
  it("renders the Teams title, the search/format filters, and the teams table", () => {
    renderBrowser();
    expect(screen.getByTestId("teams-browser")).toBeInTheDocument();
    expect(screen.getByText("Teams")).toBeInTheDocument();
    expect(screen.getByTestId("teams-search")).toBeInTheDocument();
    expect(screen.getByTestId("teams-format")).toBeInTheDocument();
    expect(screen.getByTestId("admin-data-table")).toBeInTheDocument();
  });

  it("renders a row per team with its name, owner, and format (cross-account)", () => {
    renderBrowser();
    expect(screen.getByTestId("admin-row-team-1")).toBeInTheDocument();
    expect(screen.getByTestId("admin-row-team-2")).toBeInTheDocument();
    expect(screen.getByTestId("admin-cell-team-1-name")).toHaveTextContent(
      "Sand Offense",
    );
    expect(screen.getByTestId("admin-cell-team-1-owner")).toHaveTextContent(
      "trainer@example.com",
    );
    expect(screen.getByTestId("admin-cell-team-1-format")).toHaveTextContent(
      "Scarlet/Violet",
    );
  });

  it("falls back to the account id when the owner email is null", () => {
    renderBrowser();
    expect(screen.getByTestId("admin-cell-team-2-owner")).toHaveTextContent("a-2");
  });

  it("shows the member count and an 'incomplete' badge only on incomplete teams", () => {
    renderBrowser();
    expect(screen.getByTestId("admin-cell-team-1-members")).toHaveTextContent("6");
    expect(screen.queryByTestId("teams-incomplete-team-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("teams-incomplete-team-2")).toBeInTheDocument();
  });

  it("renders species chips for each team (slot order)", () => {
    renderBrowser();
    const chips = screen.getByTestId("teams-species-team-1");
    expect(chips).toHaveTextContent("Garchomp");
    expect(chips).toHaveTextContent("Rotom Wash");
    expect(chips).toHaveTextContent("Landorus Therian");
  });

  it("emits the typed search text via onQueryChange", () => {
    const onQueryChange = vi.fn();
    renderBrowser({ onQueryChange });
    fireEvent.change(screen.getByTestId("teams-search"), {
      target: { value: "sand" },
    });
    expect(onQueryChange).toHaveBeenCalledWith("sand");
  });

  it("emits the selected format via onFormatChange", () => {
    const onFormatChange = vi.fn();
    renderBrowser({ onFormatChange });
    fireEvent.change(screen.getByTestId("teams-format"), {
      target: { value: "champions" },
    });
    expect(onFormatChange).toHaveBeenCalledWith("champions");
  });

  it("hides the clear button when no filter is active, shows it once one is", () => {
    renderBrowser();
    expect(screen.queryByTestId("teams-clear")).not.toBeInTheDocument();
    cleanup();
    renderBrowser({ query: "sand" });
    expect(screen.getByTestId("teams-clear")).toBeInTheDocument();
  });

  it("clears both the query and the format when Clear is activated", () => {
    const onQueryChange = vi.fn();
    const onFormatChange = vi.fn();
    renderBrowser({ query: "sand", format: "champions", onQueryChange, onFormatChange });
    fireEvent.click(screen.getByTestId("teams-clear"));
    expect(onQueryChange).toHaveBeenCalledWith("");
    expect(onFormatChange).toHaveBeenCalledWith("");
  });

  it("calls onSelectTeam with the team when a row is clicked (read-only drill-down)", () => {
    const onSelectTeam = vi.fn();
    renderBrowser({ onSelectTeam });
    fireEvent.click(screen.getByTestId("admin-row-team-1"));
    expect(onSelectTeam).toHaveBeenCalledTimes(1);
    expect(onSelectTeam.mock.calls[0][0]).toMatchObject({ id: "team-1" });
  });

  it("hides the detail panel until a team is selected", () => {
    renderBrowser();
    expect(screen.queryByTestId("team-detail")).not.toBeInTheDocument();
  });

  it("renders the selected team's members with display names, moves, ability, and EVs", () => {
    renderBrowser({ selectedTeamId: "team-1", detail: TEAM_DETAIL });
    expect(screen.getByTestId("team-detail")).toBeInTheDocument();
    expect(screen.getByTestId("team-detail-name")).toHaveTextContent("Sand Offense");
    // Member 0: Garchomp, full set.
    expect(screen.getByTestId("team-member-0-species")).toHaveTextContent("Garchomp");
    expect(screen.getByTestId("team-member-0-moves")).toHaveTextContent("Earthquake");
    expect(screen.getByTestId("team-member-0-moves")).toHaveTextContent("Swords Dance");
    expect(screen.getByTestId("team-member-0-evs")).toHaveTextContent(
      "HP 4 / Atk 252 / Spe 252",
    );
  });

  it("renders an unfilled slot as 'Empty slot'", () => {
    renderBrowser({ selectedTeamId: "team-1", detail: TEAM_DETAIL });
    expect(screen.getByTestId("team-member-1-species")).toHaveTextContent(
      "Empty slot",
    );
  });

  it("shows a loading state in the detail panel while the team loads", () => {
    renderBrowser({ selectedTeamId: "team-1", detail: null, detailLoading: true });
    expect(screen.getByTestId("team-detail-loading")).toBeInTheDocument();
  });

  it("shows a detail error (e.g. 404) in the detail panel", () => {
    renderBrowser({ detailError: "Team not found." });
    const err = screen.getByTestId("team-detail-error");
    expect(err).toHaveTextContent("Team not found.");
    expect(err).toHaveAttribute("role", "alert");
  });

  it("invokes onCloseDetail when the detail Close affordance is used", () => {
    const onCloseDetail = vi.fn();
    renderBrowser({ selectedTeamId: "team-1", detail: TEAM_DETAIL, onCloseDetail });
    fireEvent.click(screen.getByTestId("team-detail-close"));
    expect(onCloseDetail).toHaveBeenCalledTimes(1);
  });

  it("surfaces a Load more affordance and invokes onLoadMore (keyset pagination)", () => {
    const onLoadMore = vi.fn();
    renderBrowser({ hasMore: true, onLoadMore });
    fireEvent.click(screen.getByTestId("admin-table-load-more"));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("shows the no-match empty-state when there are no rows and not loading", () => {
    renderBrowser({ teams: [], loading: false });
    expect(screen.getByTestId("admin-table-empty")).toHaveTextContent(
      "No teams match this search.",
    );
  });

  it("shows a loading empty-state while the first page loads", () => {
    renderBrowser({ teams: [], loading: true });
    expect(screen.getByTestId("admin-table-empty")).toHaveTextContent(
      "Loading teams…",
    );
  });

  it("renders an error banner when a transport error is present", () => {
    renderBrowser({ teams: [], error: "Failed to load teams." });
    const banner = screen.getByTestId("teams-error");
    expect(banner).toHaveTextContent("Failed to load teams.");
    expect(banner).toHaveAttribute("role", "alert");
  });

  it("exposes NO mutating controls (read-only, ADMIN-BR-2 / ADMIN-AC-10.1)", () => {
    renderBrowser({ selectedTeamId: "team-1", detail: TEAM_DETAIL, hasMore: true });
    const mutating = /\b(delete|remove|edit|rename|save|ban|suspend|revoke|update|create|add)\b/i;
    for (const btn of screen.getAllByRole("button")) {
      expect(btn.textContent ?? "").not.toMatch(mutating);
    }
  });
});
