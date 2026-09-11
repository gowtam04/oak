import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";

// TeamEditor resolves sprites for its live members; stub it out so tests stay
// hermetic (the prop seed still drives the live-stat assertions).
vi.mock("@/lib/api/sprites-client", () => ({
  resolveSprites: vi.fn(async () => ({})),
}));

vi.mock("@/lib/api/learnset-client", () => ({
  fetchLearnset: vi.fn(async () => []),
}));

import TeamEditor, { type TeamEditorHandle } from "./TeamEditor";
import type { TeamDetail } from "@/lib/api/teams-client";
import { resolveSprites, type SpriteRef } from "@/lib/api/sprites-client";
import { fetchLearnset } from "@/lib/api/learnset-client";
import type { TeamMember } from "@/data/teams/team-schema";

const resolveSpritesMock = vi.mocked(resolveSprites);
const fetchLearnsetMock = vi.mocked(fetchLearnset);

afterEach(() => {
  cleanup();
  resolveSpritesMock.mockClear();
  fetchLearnsetMock.mockClear();
});

function fullMember(species: string): TeamMember {
  return {
    species,
    ability: "intimidate",
    item: "leftovers",
    moves: ["a", "b", "c", "d"],
    nature: "adamant",
    evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    tera_type: "water",
    level: 50,
    nickname: null,
  };
}

function detail(overrides: Partial<TeamDetail> = {}): TeamDetail {
  return {
    id: "t1",
    name: "My Team",
    format: "champions",
    members: [fullMember("gyarados"), fullMember("garchomp")],
    validation: [],
    ...overrides,
  };
}

function setup(overrides: Partial<React.ComponentProps<typeof TeamEditor>> = {}) {
  const props = {
    team: detail(),
    onSave: vi.fn(),
    onExport: vi.fn(),
    ...overrides,
  };
  const utils = render(<TeamEditor {...props} />);
  return { ...utils, props };
}

describe("TeamEditor", () => {
  it("seeds the name, a roster chip per member, and a focused panel", () => {
    setup();
    expect(screen.getByTestId("team-name")).toHaveValue("My Team");
    // The roster shows every member; only the selected slot mounts a panel.
    expect(screen.getByTestId("roster-slot-0")).toBeInTheDocument();
    expect(screen.getByTestId("roster-slot-1")).toBeInTheDocument();
    expect(screen.getByTestId("member-0-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("member-1-panel")).not.toBeInTheDocument();
  });

  it("focuses a member when its roster chip is clicked", () => {
    setup();
    expect(screen.getByTestId("member-0-species")).toHaveValue("Gyarados");
    fireEvent.click(screen.getByTestId("roster-slot-1"));
    expect(screen.getByTestId("member-1-panel")).toBeInTheDocument();
    expect(screen.getByTestId("member-1-species")).toHaveValue("Garchomp");
  });

  it("renames and autosaves the draft after a debounce", async () => {
    vi.useFakeTimers();
    try {
      const { props } = setup();
      fireEvent.change(screen.getByTestId("team-name"), {
        target: { value: "Renamed" },
      });
      expect(props.onSave).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });
      expect(props.onSave).toHaveBeenCalledWith(
        expect.objectContaining({ id: "t1", name: "Renamed" }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("adds a blank member and focuses it", () => {
    setup({ team: detail({ members: [fullMember("ditto")] }) });
    expect(screen.queryByTestId("member-1-panel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("team-add-member"));
    // The new (empty) slot becomes the focused panel (partial team — BR-T4).
    expect(screen.getByTestId("member-1-panel")).toBeInTheDocument();
    expect(screen.getByTestId("member-1-species")).toHaveValue("");
  });

  it("hides Add at six members", () => {
    const six = Array.from({ length: 6 }, (_, i) => fullMember(`p${i}`));
    setup({ team: detail({ members: six }) });
    expect(screen.queryByTestId("team-add-member")).not.toBeInTheDocument();
  });

  it("removes the focused member", () => {
    setup();
    fireEvent.click(screen.getByTestId("roster-slot-1"));
    fireEvent.click(screen.getByTestId("member-1-remove"));
    // Back to a single member; slot 1 no longer exists.
    expect(screen.queryByTestId("roster-slot-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("member-0-species")).toHaveValue("Gyarados");
  });

  it("reorders members (swap on move up, focus follows)", () => {
    setup();
    fireEvent.click(screen.getByTestId("roster-slot-1"));
    expect(screen.getByTestId("member-1-species")).toHaveValue("Garchomp");
    fireEvent.click(screen.getByTestId("member-1-up"));
    // The moved member (garchomp) is now slot 0 and stays focused.
    expect(screen.getByTestId("member-0-species")).toHaveValue("Garchomp");
    fireEvent.click(screen.getByTestId("roster-slot-1"));
    expect(screen.getByTestId("member-1-species")).toHaveValue("Gyarados");
  });

  it("reorders members from a roster-strip drop and keeps focus on the moved slot", () => {
    setup({
      team: detail({
        members: [
          fullMember("gyarados"),
          fullMember("garchomp"),
          fullMember("absol"),
        ],
      }),
    });
    const transfer = {
      data: "",
      effectAllowed: "",
      dropEffect: "",
      setData(_type: string, value: string) {
        this.data = value;
      },
      getData() {
        return this.data;
      },
    };
    fireEvent.dragStart(screen.getByTestId("roster-slot-0"), {
      dataTransfer: transfer,
    });
    fireEvent.drop(screen.getByTestId("roster-slot-2"), {
      dataTransfer: transfer,
    });
    // Gyarados moved to slot 2; the focused panel follows it.
    expect(screen.getByTestId("member-2-species")).toHaveValue("Gyarados");
    expect(screen.getByTestId("roster-slot-0")).toHaveTextContent("Garchomp");
    expect(screen.getByTestId("roster-slot-1")).toHaveTextContent("Absol");
  });

  it("autosaves even a partial team (BR-T4)", async () => {
    vi.useFakeTimers();
    try {
      const { props } = setup({ team: detail({ members: [] }) });
      fireEvent.click(screen.getByTestId("team-add-member"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });
      expect(props.onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          members: [expect.objectContaining({ species: null })],
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders team-level warnings and per-slot warnings separately", () => {
    setup({
      team: detail({
        validation: [
          { code: "duplicate_item", message: "Two Leftovers." },
          {
            code: "incomplete",
            message: "Slot 2 incomplete.",
            slot: 1,
          },
        ],
      }),
    });
    // Team-level (no slot) in the editor's header warnings.
    expect(screen.getByTestId("team-level-warnings")).toHaveTextContent(
      "Two Leftovers.",
    );
    // Per-slot warnings show inside that member's panel once it is focused.
    fireEvent.click(screen.getByTestId("roster-slot-1"));
    expect(screen.getByTestId("member-1-warnings")).toHaveTextContent(
      "Slot 2 incomplete.",
    );
  });

  it("triggers export", () => {
    const { props } = setup();
    fireEvent.click(screen.getByTestId("team-export"));
    expect(props.onExport).toHaveBeenCalledOnce();
  });

  it("passes live stats through when base stats are supplied", () => {
    const garchompRef: SpriteRef = {
      display_name: "Garchomp",
      sprite_url: "https://example.test/garchomp.png",
      dex_number: 445,
      types: ["dragon", "ground"],
      base_stats: {
        hp: 108,
        attack: 130,
        defense: 95,
        special_attack: 80,
        special_defense: 85,
        speed: 102,
      },
    };
    setup({
      team: detail({ members: [fullMember("garchomp")] }),
      spriteBySpecies: { garchomp: garchompRef },
    });
    expect(screen.getByTestId("member-0-stat-hp")).toBeInTheDocument();
  });

  it("shows Saving status while a save is in flight", () => {
    setup({ saving: true });
    expect(screen.getByTestId("team-save-status")).toHaveTextContent(/Saving/i);
    expect(screen.queryByTestId("team-save")).not.toBeInTheDocument();
  });

  it("shows an INCOMPLETE legality pill for a partial team", () => {
    // The default fixture has 2 of 6 members → incomplete.
    setup();
    const pill = screen.getByTestId("team-legality");
    expect(pill).toHaveAttribute("data-state", "incomplete");
    expect(pill).toHaveTextContent(/Incomplete/i);
  });

  it("living editor has no Tera, IV, or level knobs (CF-TEAM-AC-1.2, CF-UI-AC-1.3)", () => {
    setup();
    expect(screen.queryByTestId("member-0-tera")).not.toBeInTheDocument();
    expect(screen.queryByTestId("member-0-iv-hp")).not.toBeInTheDocument();
    expect(screen.queryByTestId("member-0-level")).not.toBeInTheDocument();
    expect(screen.getByTestId("member-0-ev-total")).toHaveTextContent("/ 66");
  });

  it("shows a LEGAL legality pill for a full, complete team", () => {
    // Six members, each with a species + 4 moves (fullMember) → complete.
    const six = Array.from({ length: 6 }, (_, i) => fullMember(`p${i}`));
    setup({ team: detail({ members: six }) });
    const pill = screen.getByTestId("team-legality");
    expect(pill).toHaveAttribute("data-state", "legal");
    expect(pill).toHaveTextContent(/Legal/i);
  });

  it("drops back to INCOMPLETE live when a slot loses its 4th move", () => {
    // Full team, but one member has only 3 moves → incomplete.
    const six = Array.from({ length: 6 }, (_, i) => fullMember(`p${i}`));
    six[0] = { ...six[0]!, moves: ["a", "b", "c"] };
    setup({ team: detail({ members: six }) });
    expect(screen.getByTestId("team-legality")).toHaveAttribute(
      "data-state",
      "incomplete",
    );
  });
});

describe("TeamEditor imperative handle (assistant panel seam)", () => {
  function setupWithHandle(
    overrides: Partial<React.ComponentProps<typeof TeamEditor>> = {},
  ) {
    const handleRef = { current: null as TeamEditorHandle | null };
    const utils = setup({ handleRef, ...overrides });
    expect(handleRef.current).not.toBeNull();
    return { ...utils, handle: handleRef.current! };
  }

  it("getDraft returns the live name + members", () => {
    const { handle } = setupWithHandle();
    const draft = handle.getDraft();
    expect(draft.name).toBe("My Team");
    expect(draft.members.map((m) => m.species)).toEqual([
      "gyarados",
      "garchomp",
    ]);
  });

  it("applyPatch replaces a slot and renames, and focuses the patched slot", () => {
    const { handle } = setupWithHandle();
    act(() => {
      handle.applyPatch({
        name: "Renamed",
        slots: [{ slot: 1, member: fullMember("tyranitar") }],
      });
    });
    expect(screen.getByTestId("team-name")).toHaveValue("Renamed");
    const draft = handle.getDraft();
    expect(draft.members[1]!.species).toBe("tyranitar");
    // The patched slot is focused so the change is visible.
    expect(screen.getByTestId("member-1-panel")).toBeInTheDocument();
  });

  it("applyPatch extends past the end (gap padded blank) and removes via null", () => {
    const { handle } = setupWithHandle();
    act(() => {
      handle.applyPatch({
        slots: [{ slot: 3, member: fullMember("scizor") }],
      });
    });
    let draft = handle.getDraft();
    expect(draft.members).toHaveLength(4);
    expect(draft.members[2]!.species).toBeNull(); // padded blank
    expect(draft.members[3]!.species).toBe("scizor");

    act(() => {
      handle.applyPatch({ slots: [{ slot: 0, member: null }] });
    });
    draft = handle.getDraft();
    expect(draft.members.map((m) => m.species)).toEqual([
      "garchomp",
      null,
      "scizor",
    ]);
  });

  it("replaceDraft restores an exact snapshot (the Undo path)", () => {
    const { handle } = setupWithHandle();
    const before = handle.getDraft();
    act(() => {
      handle.applyPatch({
        name: "Changed",
        slots: [{ slot: 0, member: fullMember("tyranitar") }],
      });
    });
    act(() => {
      handle.replaceDraft(before);
    });
    const draft = handle.getDraft();
    expect(draft.name).toBe("My Team");
    expect(draft.members.map((m) => m.species)).toEqual([
      "gyarados",
      "garchomp",
    ]);
  });
});

describe("TeamEditor — archived view (CF-TEAM-AC-5.2–5.4, CF-UI-AC-4.2–4.3)", () => {
  function archivedDetail(): TeamDetail {
    return detail({
      id: "old-1",
      name: "Old rain",
      format: "gen-7",
      members: [
        {
          ...fullMember("excadrill"),
          ability: "sand-rush",
          item: "air-balloon",
          moves: ["earthquake", "iron-head", "rock-slide", "toxic"],
        },
      ],
      validation: [
        {
          code: "species_illegal",
          message: 'Species "excadrill" is not in the Champions roster.',
          slot: 0,
          field: "species",
        },
        {
          code: "ability_not_for_species",
          message: 'Ability "sand-rush" is not in the Champions roster.',
          slot: 0,
          field: "ability",
        },
        {
          code: "item_illegal",
          message: 'Item "air-balloon" is not in the Champions roster.',
          slot: 0,
          field: "item",
        },
        {
          code: "move_not_in_learnset",
          message: 'Move "toxic" is not in the Champions roster.',
          slot: 0,
          field: "moves[3]",
        },
      ],
    });
  }

  function otherGameLookups(): string[] {
    const formats: string[] = [];
    for (const call of resolveSpritesMock.mock.calls) {
      formats.push(String(call[0]));
    }
    for (const call of fetchLearnsetMock.mock.calls) {
      formats.push(String(call[0]));
    }
    return formats.filter((f) =>
      /^(gen-[1-8]|scarlet-violet|national-dex)$/.test(f),
    );
  }

  it("is view-only: no save, add, or slot edit (CF-TEAM-AC-5.2–5.3, CF-UI-AC-4.2)", () => {
    setup({ team: archivedDetail() });
    expect(screen.getByTestId("team-editor")).toBeInTheDocument();
    expect(screen.getAllByText(/excadrill/i).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("team-save")).not.toBeInTheDocument();
    expect(screen.queryByTestId("team-add-member")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /apply this champions set/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /duplicate/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("member-0-remove")).not.toBeInTheDocument();
    const name = screen.getByTestId("team-name");
    expect(name).toBeDisabled();
  });

  it("labels off-roster stored names not in the Champions roster (CF-TEAM-AC-5.4, CF-UI-AC-4.3, CF-UI-BR-2)", () => {
    setup({ team: archivedDetail() });
    expect(screen.getAllByText(/excadrill/i).length).toBeGreaterThan(0);
    const labels = screen.getAllByText(/not in the Champions roster/);
    expect(labels.length).toBeGreaterThanOrEqual(4);
    expect(
      screen.getByTestId("member-0-species").closest(".team-member-panel__field"),
    ).toHaveTextContent(/not in the Champions roster/);
    expect(
      screen.getByTestId("member-0-ability").closest(".team-member-panel__field"),
    ).toHaveTextContent(/not in the Champions roster/);
    expect(
      screen.getByTestId("member-0-item").closest(".team-member-panel__field"),
    ).toHaveTextContent(/not in the Champions roster/);
    expect(screen.getByTestId("member-0-move-3").closest("td")).toHaveTextContent(
      /not in the Champions roster/,
    );
    expect(screen.queryByText(/try Scarlet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/switch scope/i)).not.toBeInTheDocument();
  });

  it("renders stored spreads and Tera without living Stat Point chrome", () => {
    setup({ team: archivedDetail() });
    // fullMember: 252 Atk / 252 Spe — must not clip to the living 32 cap.
    expect(screen.getByTestId("member-0-ev-atk")).toHaveValue(252);
    expect(screen.getByTestId("member-0-ev-spe")).toHaveValue(252);
    expect(screen.getByTestId("member-0-ev-atk")).not.toHaveAttribute(
      "max",
      "32",
    );
    expect(screen.queryByTestId("member-0-ev-total")).not.toBeInTheDocument();
    expect(screen.queryByText(/stat points/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.getByTestId("member-0-tera")).toHaveValue("Water");
    expect(screen.queryByTestId("member-0-level")).not.toBeInTheDocument();
    expect(screen.queryByTestId("member-0-iv-hp")).not.toBeInTheDocument();
  });

  it("does not look up other-game Dex data for archived names (CF-TEAM-AC-5.4)", async () => {
    setup({ team: archivedDetail() });
    expect(screen.getAllByText(/excadrill/i).length).toBeGreaterThan(0);
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    // Sprites/learnset may miss on Champions, but must not query gen-7 / SV / natdex.
    expect(otherGameLookups()).toEqual([]);
  });
});
