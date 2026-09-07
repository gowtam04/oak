import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";

import { createTeam, updateTeam, listTeams } from "@/lib/api/teams-client";
import type { TeamMember } from "@/data/teams/team-schema";
import type { ProposedTeam } from "@/components/types";

vi.mock("@/lib/api/teams-client", () => ({
  createTeam: vi.fn(),
  updateTeam: vi.fn(),
  listTeams: vi.fn().mockResolvedValue([]),
}));

import { proposedTeamToShowdownPaste } from "@/lib/proposed-team-showdown";
import ProposedTeamCard from "./ProposedTeamCard";

const createMock = vi.mocked(createTeam);
const updateMock = vi.mocked(updateTeam);
const listMock = vi.mocked(listTeams);

function member(over: Partial<TeamMember>): TeamMember {
  return {
    species: "great-tusk",
    ability: "protosynthesis",
    item: "booster-energy",
    moves: ["headlong-rush", "close-combat", "ice-spinner", "rapid-spin"],
    nature: "Jolly",
    evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    tera_type: "steel",
    level: 100,
    ...over,
  };
}

function proposed(over: Partial<ProposedTeam> = {}): ProposedTeam {
  return {
    name: "Hyper Offense",
    format: "scarlet-violet",
    members: [member({}), member({ species: "kingambit" })],
    ...over,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  listMock.mockResolvedValue([]);
});

describe("ProposedTeamCard", () => {
  it("renders the proposed team name and members", async () => {
    render(<ProposedTeamCard proposedTeam={proposed()} />);
    expect(screen.getByTestId("proposed-team-name")).toHaveTextContent(
      "Hyper Offense",
    );
    const members = screen.getByTestId("proposed-team-members");
    expect(members).toHaveTextContent("Great Tusk");
    expect(members).toHaveTextContent("Kingambit");
  });

  it("Save as new team calls createTeam with the proposed shape", async () => {
    createMock.mockResolvedValue({
      id: "new-1",
      name: "Hyper Offense",
      format: "scarlet-violet",
      members: [],
      validation: [],
    });
    const team = proposed();
    render(<ProposedTeamCard proposedTeam={team} />);

    fireEvent.click(screen.getByTestId("proposed-team-save-new"));

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith({
        name: team.name,
        format: team.format,
        members: team.members,
      }),
    );
    expect(await screen.findByTestId("proposed-team-status")).toHaveTextContent(
      "Saved as a new team",
    );
  });

  it("shows an error when the save fails (e.g. a guest gets 401 → null)", async () => {
    createMock.mockResolvedValue(null);
    render(<ProposedTeamCard proposedTeam={proposed()} />);

    fireEvent.click(screen.getByTestId("proposed-team-save-new"));

    expect(await screen.findByTestId("proposed-team-status")).toHaveTextContent(
      "Sign in to save teams",
    );
  });

  it("applies onto an existing same-format team via updateTeam", async () => {
    listMock.mockResolvedValue([
      {
        id: "existing-1",
        name: "Old Team",
        format: "scarlet-violet",
        memberCount: 6,
        incomplete: false,
        updatedAt: Date.now(),
      },
    ]);
    updateMock.mockResolvedValue({
      id: "existing-1",
      name: "Old Team",
      format: "scarlet-violet",
      members: [],
      validation: [],
    });
    const team = proposed();
    render(<ProposedTeamCard proposedTeam={team} />);

    // Same-format teams are listed for the apply-existing path.
    await waitFor(() =>
      expect(listMock).toHaveBeenCalledWith({ format: "scarlet-violet" }),
    );
    const target = await screen.findByTestId("proposed-team-target");
    fireEvent.change(target, { target: { value: "existing-1" } });
    fireEvent.click(screen.getByTestId("proposed-team-apply-existing"));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith("existing-1", {
        members: team.members,
      }),
    );
    expect(await screen.findByTestId("proposed-team-status")).toHaveTextContent(
      "Applied onto",
    );
  });

  it("hides the apply-existing picker when the account has no same-format teams", async () => {
    listMock.mockResolvedValue([]);
    render(<ProposedTeamCard proposedTeam={proposed()} />);
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    expect(screen.queryByTestId("proposed-team-apply-existing")).toBeNull();
  });

  it("renders a species_illegal legality badge when warnings are present", async () => {
    render(
      <ProposedTeamCard
        proposedTeam={proposed()}
        warnings={[
          {
            code: "species_illegal",
            message: 'Species "heatran" is not legal in this format.',
            slot: 0,
            field: "species",
          },
        ]}
      />,
    );
    const block = screen.getByTestId("proposed-team-warnings");
    expect(block).toHaveTextContent("not legal in this format");
    expect(screen.getByTestId("team-warning")).toHaveAttribute(
      "data-code",
      "species_illegal",
    );
  });

  it("renders no legality block for a clean proposal (no warnings)", async () => {
    render(<ProposedTeamCard proposedTeam={proposed()} />);
    expect(screen.queryByTestId("proposed-team-warnings")).toBeNull();
  });
});

describe("ProposedTeamCard — Add to team (ADD-US-1)", () => {
  it("shows Add to team on each member when signed in (ADD-AC-1.1)", () => {
    render(<ProposedTeamCard proposedTeam={proposed()} signedIn />);
    expect(screen.getAllByRole("button", { name: /add to team/i })).toHaveLength(
      2,
    );
  });

  it("hides Add to team for guests (ADD-AC-1.2, AUTH-BR-1)", () => {
    render(<ProposedTeamCard proposedTeam={proposed()} signedIn={false} />);
    expect(screen.queryByRole("button", { name: /add to team/i })).toBeNull();
  });
});

describe("ProposedTeamCard — Copy Showdown paste (PASTE-US-1)", () => {
  it("copies only the Showdown paste, not the full human markdown (PASTE-AC-1.1, PASTE-BR-2)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const team = proposed();
    render(<ProposedTeamCard proposedTeam={team} />);
    fireEvent.click(
      screen.getByRole("button", { name: /copy showdown paste/i }),
    );
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const pasted = writeText.mock.calls[0]![0] as string;
    expect(pasted).toBe(proposedTeamToShowdownPaste(team));
    expect(pasted).toMatch(/Great Tusk/i);
    expect(pasted).not.toContain("# Oak answer");
    expect(pasted).not.toContain("**Status:**");
    expect(createMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("confirms success and does not open Teams (PASTE-AC-1.2, PASTE-BR-1)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<ProposedTeamCard proposedTeam={proposed()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /copy showdown paste/i }),
    );
    expect(
      await screen.findByText(/copied/i),
    ).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("is available to guests (PASTE-BR-3)", () => {
    render(<ProposedTeamCard proposedTeam={proposed()} />);
    expect(
      screen.getByRole("button", { name: /copy showdown paste/i }),
    ).toBeInTheDocument();
  });
});

describe("ProposedTeamCard — living Champions apply (CF-TEAM-AC-5.3, CF-AS-11)", () => {
  it("does not offer archived teams as apply-existing targets (CF-TEAM-AC-5.3)", async () => {
    listMock.mockResolvedValue([
      {
        id: "live",
        name: "Rain",
        format: "champions",
        memberCount: 1,
        incomplete: true,
        updatedAt: Date.now(),
      },
      {
        id: "old",
        name: "Gen 7 rain",
        format: "gen-7",
        memberCount: 6,
        incomplete: false,
        updatedAt: Date.now(),
      },
    ]);
    render(
      <ProposedTeamCard
        proposedTeam={proposed({ format: "champions" })}
        signedIn
      />,
    );
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    const arg = listMock.mock.calls[0]?.[0];
    expect(arg?.archived).not.toBe(true);
    const target = screen.queryByTestId("proposed-team-target");
    if (target) {
      expect(target).not.toHaveTextContent(/Gen 7 rain/);
      const options = Array.from(target.querySelectorAll("option")).map(
        (o) => o.textContent ?? "",
      );
      expect(options.some((t) => /Gen 7/i.test(t))).toBe(false);
    }
  });

  it("guest save asks to sign in and does not create a team (CF-AUTH-AC-1.2, CF-AS-11)", async () => {
    createMock.mockResolvedValue(null);
    render(
      <ProposedTeamCard
        proposedTeam={proposed({ format: "champions" })}
        signedIn={false}
      />,
    );
    fireEvent.click(screen.getByTestId("proposed-team-save-new"));
    expect(await screen.findByTestId("proposed-team-status")).toHaveTextContent(
      /sign in/i,
    );
    expect(updateMock).not.toHaveBeenCalled();
  });
});
