/**
 * P6 — Add-to-team picker (ADD-US-1–4).
 *
 * Guest hide is the *caller's* job (AUTH-BR-1) — SpriteCard / artifact header
 * tests assert the verb is absent, not this picker. These cases assume the
 * signed-in path that mounted the picker.
 *
 * Requirement refs: ADD-US-1–4, ADD-AC-1.1, ADD-AC-1.3–1.4, ADD-AC-2.1–2.4,
 * ADD-AC-3.1–3.3, ADD-AC-4.1, ADD-BR-1, ADD-BR-5, ADD-BR-6.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { createTeam, getTeam, listTeams, updateTeam } from "@/lib/api/teams-client";
import { blankMember } from "@/data/teams/place-on-team";
import type { TeamMember } from "@/data/teams/team-schema";

vi.mock("@/lib/api/teams-client", () => ({
  listTeams: vi.fn(),
  getTeam: vi.fn(),
  createTeam: vi.fn(),
  updateTeam: vi.fn(),
}));

import AddToTeamPicker from "./AddToTeamPicker";

const listMock = vi.mocked(listTeams);
const getMock = vi.mocked(getTeam);
const createMock = vi.mocked(createTeam);
const updateMock = vi.mocked(updateTeam);

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  listMock.mockResolvedValue([]);
});

function incoming(over: Partial<TeamMember> = {}): TeamMember {
  return {
    ...blankMember(),
    species: "garchomp",
    ...over,
  };
}

function summary(
  over: Partial<{
    id: string;
    name: string;
    format: string;
    memberCount: number;
    incomplete: boolean;
  }> = {},
) {
  return {
    id: "team-rain",
    name: "Rain Offense",
    format: "scarlet-violet",
    memberCount: 2,
    incomplete: true,
    updatedAt: Date.now(),
    ...over,
  };
}

function detailMembers(count: number, filledSpecies = "pelipper"): TeamMember[] {
  return Array.from({ length: 6 }, (_, i) =>
    i < count
      ? { ...blankMember(), species: filledSpecies }
      : blankMember(),
  );
}

describe("AddToTeamPicker — list + create (ADD-US-2)", () => {
  it("lists the caller's teams with an honest empty/full indication and Create new team (ADD-AC-2.1)", async () => {
    listMock.mockResolvedValue([
      summary({ id: "open", name: "Open slots", memberCount: 2, incomplete: true }),
      summary({
        id: "full",
        name: "Full six",
        memberCount: 6,
        incomplete: false,
      }),
    ]);
    render(
      <AddToTeamPicker
        incoming={incoming()}
        format="scarlet-violet"
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText("Open slots")).toBeInTheDocument();
    expect(screen.getByText("Full six")).toBeInTheDocument();
    expect(screen.getByTestId("add-to-team-team-open")).toHaveTextContent(
      /empty|open|2/i,
    );
    expect(screen.getByTestId("add-to-team-team-full")).toHaveTextContent(/full/i);
    expect(
      screen.getByRole("button", { name: /create new team/i }),
    ).toBeInTheDocument();
    // Picker lists every team, not just the current format (api-design.md).
    expect(listMock).toHaveBeenCalled();
    const arg = listMock.mock.calls[0]?.[0];
    expect(arg === undefined || arg.format === undefined).toBe(true);
  });

  it("still opens with only Create new team when the account has zero teams (ADD-AC-2.3)", async () => {
    listMock.mockResolvedValue([]);
    render(
      <AddToTeamPicker
        incoming={incoming()}
        format="scarlet-violet"
        onClose={vi.fn()}
      />,
    );
    expect(
      await screen.findByRole("button", { name: /create new team/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId(/add-to-team-team-/)).toBeNull();
  });

  it("Create new team writes slot 1 in the current conversation scope and opens the editor (ADD-AC-2.2)", async () => {
    listMock.mockResolvedValue([]);
    createMock.mockResolvedValue({
      id: "new-1",
      name: "New team",
      format: "gen-5",
      members: [{ ...incoming() }],
      validation: [],
    });
    render(
      <AddToTeamPicker
        incoming={incoming()}
        format="gen-5"
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /create new team/i }),
    );

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          format: "gen-5",
          members: expect.arrayContaining([
            expect.objectContaining({ species: "garchomp" }),
          ]),
        }),
      ),
    );
    expect(pushMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/teams\?team=new-1&slot=0/),
    );
  });

  it("dismiss without choosing leaves teams unchanged (ADD-AC-2.4, ADD-BR-5)", async () => {
    listMock.mockResolvedValue([summary()]);
    const onClose = vi.fn();
    render(
      <AddToTeamPicker
        incoming={incoming()}
        format="scarlet-violet"
        onClose={onClose}
      />,
    );
    await screen.findByText("Rain Offense");
    fireEvent.click(screen.getByRole("button", { name: /cancel|dismiss|close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(createMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("AddToTeamPicker — first empty slot (ADD-US-1, ADD-BR-1)", () => {
  it("writes Garchomp into the first empty slot and navigates to that slot (ADD-AC-1.1)", async () => {
    listMock.mockResolvedValue([summary({ memberCount: 2 })]);
    getMock.mockResolvedValue({
      id: "team-rain",
      name: "Rain Offense",
      format: "scarlet-violet",
      members: detailMembers(2),
      validation: [],
    });
    updateMock.mockResolvedValue({
      id: "team-rain",
      name: "Rain Offense",
      format: "scarlet-violet",
      members: [],
      validation: [],
    });
    render(
      <AddToTeamPicker
        incoming={incoming({ ability: "rough-skin", item: "life-orb" })}
        format="scarlet-violet"
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByTestId("add-to-team-team-team-rain"));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(
        "team-rain",
        expect.objectContaining({
          members: expect.arrayContaining([
            expect.objectContaining({
              species: "garchomp",
              ability: "rough-skin",
              item: "life-orb",
            }),
          ]),
        }),
      ),
    );
    const written = updateMock.mock.calls[0]![1]!.members!;
    expect(written[2]).toEqual(
      expect.objectContaining({ species: "garchomp", ability: "rough-skin" }),
    );
    expect(pushMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/teams\?team=team-rain&slot=2/),
    );
  });

  it("does not invent set fields the surface did not name (ADD-AC-1.4, ADD-BR-2)", async () => {
    listMock.mockResolvedValue([summary({ memberCount: 0, incomplete: true })]);
    getMock.mockResolvedValue({
      id: "team-rain",
      name: "Rain Offense",
      format: "scarlet-violet",
      members: detailMembers(0),
      validation: [],
    });
    updateMock.mockResolvedValue({
      id: "team-rain",
      name: "Rain Offense",
      format: "scarlet-violet",
      members: [],
      validation: [],
    });
    render(
      <AddToTeamPicker
        incoming={incoming()}
        format="scarlet-violet"
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByTestId("add-to-team-team-team-rain"));
    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const slot = updateMock.mock.calls[0]![1]!.members![0]!;
    expect(slot.species).toBe("garchomp");
    expect(slot.ability).toBeNull();
    expect(slot.item).toBeNull();
    expect(slot.moves).toEqual([]);
  });
});

describe("AddToTeamPicker — full team replace (ADD-US-3)", () => {
  const six = detailMembers(6, "pelipper");

  it("opens a replace sheet of the six members and does not write yet (ADD-AC-3.1, ADD-BR-6)", async () => {
    listMock.mockResolvedValue([
      summary({ id: "full", name: "Full six", memberCount: 6, incomplete: false }),
    ]);
    getMock.mockResolvedValue({
      id: "full",
      name: "Full six",
      format: "scarlet-violet",
      members: six.map((m, i) => ({ ...m, species: `slot-${i}` })),
      validation: [],
    });
    render(
      <AddToTeamPicker
        incoming={incoming()}
        format="scarlet-violet"
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByTestId("add-to-team-team-full"));

    expect(await screen.findByTestId("add-to-team-replace")).toBeInTheDocument();
    for (let i = 0; i < 6; i++) {
      expect(screen.getByTestId(`add-to-team-replace-${i}`)).toBeInTheDocument();
    }
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("overwrites the chosen slot on confirm (ADD-AC-3.2)", async () => {
    listMock.mockResolvedValue([
      summary({ id: "full", name: "Full six", memberCount: 6, incomplete: false }),
    ]);
    getMock.mockResolvedValue({
      id: "full",
      name: "Full six",
      format: "scarlet-violet",
      members: six,
      validation: [],
    });
    updateMock.mockResolvedValue({
      id: "full",
      name: "Full six",
      format: "scarlet-violet",
      members: [],
      validation: [],
    });
    render(
      <AddToTeamPicker
        incoming={incoming()}
        format="scarlet-violet"
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByTestId("add-to-team-team-full"));
    fireEvent.click(await screen.findByTestId("add-to-team-replace-3"));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(
        "full",
        expect.objectContaining({
          members: expect.any(Array),
        }),
      ),
    );
    expect(updateMock.mock.calls[0]![1]!.members![3]).toEqual(
      expect.objectContaining({ species: "garchomp" }),
    );
    expect(pushMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/teams\?team=full&slot=3/),
    );
  });

  it("cancel on the replace sheet leaves the team unchanged (ADD-AC-3.3)", async () => {
    listMock.mockResolvedValue([
      summary({ id: "full", name: "Full six", memberCount: 6, incomplete: false }),
    ]);
    getMock.mockResolvedValue({
      id: "full",
      name: "Full six",
      format: "scarlet-violet",
      members: six,
      validation: [],
    });
    render(
      <AddToTeamPicker
        incoming={incoming()}
        format="scarlet-violet"
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByTestId("add-to-team-team-full"));
    fireEvent.click(
      await screen.findByRole("button", { name: /cancel/i }),
    );
    expect(updateMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("AddToTeamPicker — living Champions only (CF-TEAM-AC-5.3, CF-TEAM-AC-6.2)", () => {
  it("does not list archived other-format teams (CF-TEAM-AC-5.3, CF-TEAM-AC-1.7)", async () => {
    listMock.mockResolvedValue([
      summary({
        id: "live",
        name: "Rain Offense",
        format: "champions",
        memberCount: 2,
        incomplete: true,
      }),
      summary({
        id: "old-gen7",
        name: "Gen 7 rain",
        format: "gen-7",
        memberCount: 6,
        incomplete: false,
      }),
    ]);
    render(
      <AddToTeamPicker
        incoming={incoming()}
        format="champions"
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByText("Rain Offense")).toBeInTheDocument();
    expect(screen.queryByText("Gen 7 rain")).not.toBeInTheDocument();
    expect(screen.queryByTestId("add-to-team-team-old-gen7")).toBeNull();
    const arg = listMock.mock.calls[0]?.[0];
    expect(arg?.archived).not.toBe(true);
  });

  it("fills the first empty slot of a living team without a replace confirm (CF-TEAM-AC-6.2)", async () => {
    listMock.mockResolvedValue([
      summary({
        id: "team-rain",
        name: "Rain Offense",
        format: "champions",
        memberCount: 2,
        incomplete: true,
      }),
    ]);
    getMock.mockResolvedValue({
      id: "team-rain",
      name: "Rain Offense",
      format: "champions",
      members: detailMembers(2),
      validation: [],
    });
    updateMock.mockResolvedValue({
      id: "team-rain",
      name: "Rain Offense",
      format: "champions",
      members: [],
      validation: [],
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <AddToTeamPicker
        incoming={incoming({
          ability: "rough-skin",
          item: "life-orb",
          moves: ["earthquake"],
          nature: "jolly",
          evs: { hp: 4, atk: 30, def: 0, spa: 0, spd: 0, spe: 32 },
          tera_type: null,
          level: 50,
        })}
        format="champions"
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByTestId("add-to-team-team-team-rain"));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const written = updateMock.mock.calls[0]![1]!.members!;
    expect(written[2]).toEqual(
      expect.objectContaining({
        species: "garchomp",
        ability: "rough-skin",
        item: "life-orb",
        tera_type: null,
        level: 50,
      }),
    );
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId("apply-set-confirm")).not.toBeInTheDocument();
  });
});
