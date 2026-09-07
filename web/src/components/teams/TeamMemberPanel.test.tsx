import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";

// The Move pickers load a species' legal movepool via this client.
const learnset = vi.hoisted(() => ({ fetchLearnset: vi.fn() }));
vi.mock("@/lib/api/learnset-client", () => learnset);

import TeamMemberPanel, {
  type MemberBaseStats,
} from "./TeamMemberPanel";
import type { TeamMember } from "@/data/teams/team-schema";
import type { TeamWarning } from "@/lib/api/teams-client";

beforeEach(() => {
  learnset.fetchLearnset.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  learnset.fetchLearnset.mockReset();
});

function member(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    species: "garchomp",
    ability: "rough-skin",
    item: "life-orb",
    moves: ["earthquake", "dragon-claw"],
    nature: "jolly",
    evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    tera_type: "steel",
    level: 50,
    nickname: null,
    ...overrides,
  };
}

// Garchomp base stats (hp/atk/def/spa/spd/spe = 108/130/95/80/85/102).
const GARCHOMP_BASE: MemberBaseStats = {
  hp: 108,
  attack: 130,
  defense: 95,
  special_attack: 80,
  special_defense: 85,
  speed: 102,
};

function noop() {}

const CHAMPIONS_SP = {
  hp: 4,
  atk: 30,
  def: 0,
  spa: 0,
  spd: 0,
  spe: 32,
};

function livingMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return member({
    evs: { ...CHAMPIONS_SP },
    tera_type: null,
    level: 50,
    ...overrides,
  });
}

function applySetButton(slot = 0) {
  return (
    screen.queryByRole("button", { name: /apply this champions set/i }) ??
    screen.queryByTestId(`member-${slot}-apply-set`) ??
    screen.queryByTestId(`member-${slot}-common-set`)
  );
}

function queryReplaceConfirm() {
  return (
    screen.queryByTestId("apply-set-confirm") ??
    screen.queryByRole("alertdialog") ??
    screen.queryByRole("dialog", { name: /replace/i })
  );
}

function expectYesNoReplaceConfirm(el: HTMLElement) {
  expect(el).toHaveTextContent(/replace/i);
  const text = el.textContent ?? "";
  // CF-AS-3 / CF-UI-AC-5.1: yes/no, not a per-field diff.
  expect(text).not.toMatch(/→|ability:|item:|nature:|stat points:/i);
  expect(
    within(el).queryByRole("button", { name: /cancel|no|keep/i }),
  ).toBeInTheDocument();
  expect(
    within(el).queryByRole("button", {
      name: /^(replace|confirm|yes|overwrite)$/i,
    }) ??
      within(el).queryByRole("button", { name: /replace|overwrite/i }),
  ).toBeInTheDocument();
}

const USAGE_SET: TeamMember = {
  species: "garchomp",
  ability: "rough-skin",
  item: "life-orb",
  moves: ["earthquake", "dragon-claw", "fire-fang", "protect"],
  nature: "jolly",
  evs: { hp: 4, atk: 30, def: 0, spa: 0, spd: 0, spe: 32 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  tera_type: null,
  level: 50,
  nickname: null,
};

describe("TeamMemberPanel", () => {
  it("renders every living-editor set field as a controlled input (CF-TEAM-AC-1.2)", () => {
    render(
      <TeamMemberPanel
        slot={0}
        member={livingMember()}
        format="champions"
        warnings={[]}
        onChange={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByTestId("member-0-species")).toHaveValue("Garchomp");
    expect(screen.getByTestId("member-0-ability")).toHaveValue("Rough Skin");
    expect(screen.getByTestId("member-0-item")).toHaveValue("Life Orb");
    expect(screen.getByTestId("member-0-nature")).toHaveValue("Jolly");
    expect(screen.getByTestId("member-0-move-0")).toHaveValue("Earthquake");
    expect(screen.getByTestId("member-0-move-1")).toHaveValue("Dragon Claw");
    expect(screen.getByTestId("member-0-ev-spe")).toHaveValue(32);
    expect(screen.queryByTestId("member-0-tera")).not.toBeInTheDocument();
    expect(screen.queryByTestId("member-0-level")).not.toBeInTheDocument();
    expect(screen.queryByTestId("member-0-iv-hp")).not.toBeInTheDocument();
  });

  it("commits a selected option and clears a field to null", () => {
    const onChange = vi.fn();
    render(
      <TeamMemberPanel
        slot={0}
        member={member()}
        warnings={[]}
        onChange={onChange}
        onRemove={noop}
      />,
    );
    // Selecting from a static dropdown (require-selection) commits the slug.
    const nature = screen.getByTestId("member-0-nature");
    fireEvent.change(nature, { target: { value: "mod" } });
    fireEvent.keyDown(nature, { key: "ArrowDown" });
    fireEvent.keyDown(nature, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ nature: "modest" }),
    );
    // Clearing a committed field and blurring commits null.
    const item = screen.getByTestId("member-0-item");
    fireEvent.change(item, { target: { value: "" } });
    fireEvent.blur(item);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ item: null }),
    );
  });

  it("offers only the species' learnset and emits move slugs in order", async () => {
    learnset.fetchLearnset.mockResolvedValue([
      { slug: "stealth-rock", display_name: "Stealth Rock" },
    ]);
    const onChange = vi.fn();
    render(
      <TeamMemberPanel
        slot={0}
        member={member({ moves: [] })}
        warnings={[]}
        onChange={onChange}
        onRemove={noop}
      />,
    );
    const move0 = screen.getByTestId("member-0-move-0");
    fireEvent.focus(move0);
    // The learnset arrives asynchronously and surfaces in the dropdown.
    const option = await screen.findByText("Stealth Rock");
    fireEvent.mouseDown(option);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ moves: ["stealth-rock"] }),
    );
  });

  it("disables the Move pickers until a species is chosen", () => {
    render(
      <TeamMemberPanel
        slot={0}
        member={member({ species: null })}
        warnings={[]}
        onChange={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByTestId("member-0-move-0")).toBeDisabled();
  });

  it("hides Tera, IV knobs, and the level knob on the living editor (CF-TEAM-AC-1.2, CF-UI-AC-1.3)", () => {
    render(
      <TeamMemberPanel
        slot={0}
        member={livingMember({ level: 100, tera_type: "steel" })}
        format="champions"
        warnings={[]}
        onChange={noop}
        onRemove={noop}
      />,
    );
    expect(screen.queryByTestId("member-0-tera")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/tera type/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("member-0-iv-hp")).not.toBeInTheDocument();
    expect(screen.queryByTestId("member-0-iv-atk")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("spinbutton", { name: /iv/i }),
    ).not.toBeInTheDocument();
    // Level is 50 in Champions and is not a user knob (not even a disabled one).
    expect(screen.queryByTestId("member-0-level")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("spinbutton", { name: /^level$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("slider", { name: /^level$/i }),
    ).not.toBeInTheDocument();
  });

  it("shows a running Stat Point total of 66 with max 32 (CF-TEAM-AC-1.3, CF-UI-US-4)", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <TeamMemberPanel
        slot={0}
        member={livingMember()}
        format="champions"
        warnings={[]}
        onChange={onChange}
        onRemove={noop}
      />,
    );
    expect(screen.getByText(/stat points/i)).toBeInTheDocument();
    // 4 + 30 + 32 = 66
    expect(screen.getByTestId("member-0-ev-total")).toHaveTextContent("66 / 66");
    expect(screen.getByTestId("member-0-ev-spe")).toHaveAttribute("max", "32");
    expect(screen.getByTestId("member-0-ev-atk")).toHaveAttribute("max", "32");
    expect(screen.getByTestId("member-0-ev-spe")).toHaveAttribute(
      "aria-label",
      "Spe Stat Points",
    );

    fireEvent.change(screen.getByTestId("member-0-ev-atk"), {
      target: { value: "10" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        evs: expect.objectContaining({ atk: 10 }),
      }),
    );
    const next = onChange.mock.calls.at(-1)![0] as TeamMember;
    rerender(
      <TeamMemberPanel
        slot={0}
        member={next}
        format="champions"
        warnings={[]}
        onChange={onChange}
        onRemove={noop}
      />,
    );
    // Running total updates while editing: 4 + 10 + 32 = 46
    expect(screen.getByTestId("member-0-ev-total")).toHaveTextContent("46 / 66");
  });

  it("clamps a Stat Point edit into 0..32 on the living editor (CF-TEAM-AC-1.3)", () => {
    const onChange = vi.fn();
    render(
      <TeamMemberPanel
        slot={0}
        member={livingMember()}
        format="champions"
        warnings={[]}
        onChange={onChange}
        onRemove={noop}
      />,
    );
    fireEvent.change(screen.getByTestId("member-0-ev-atk"), {
      target: { value: "99" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        evs: expect.objectContaining({ atk: 32 }),
      }),
    );
  });

  it("computes Champions Stat-Point stats (1 Stat Point = +1)", () => {
    render(
      <TeamMemberPanel
        slot={0}
        member={member({
          nature: "adamant", // +Atk, -SpA
          level: 100, // ignored in Champions (Lv50 baked in)
          evs: { hp: 32, atk: 32, def: 0, spa: 0, spd: 0, spe: 0 },
          ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, // ignored (fixed 31)
        })}
        format="champions"
        warnings={[]}
        baseStats={GARCHOMP_BASE}
        onChange={noop}
        onRemove={noop}
      />,
    );
    // Champions HP = base + SP + 75 = 108 + 32 + 75 = 215 (0-SP baseline 183 → +32).
    expect(screen.getByTestId("member-0-stat-hp")).toHaveTextContent("215");
    // Atk (adamant +Atk): floor((130 + 32 + 20) * 1.1) = floor(200.2) = 200.
    expect(screen.getByTestId("member-0-stat-atk")).toHaveTextContent("200");
    // Def (0 SP, neutral): floor((95 + 0 + 20) * 1.0) = 115 — proves IV=0/level=100
    // are ignored (the mainline formula would give 195 here).
    expect(screen.getByTestId("member-0-stat-def")).toHaveTextContent("115");
  });

  it("clamps an EV edit into 0..255", () => {
    const onChange = vi.fn();
    render(
      <TeamMemberPanel
        slot={0}
        member={member()}
        warnings={[]}
        onChange={onChange}
        onRemove={noop}
      />,
    );
    fireEvent.change(screen.getByTestId("member-0-ev-atk"), {
      target: { value: "999" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        evs: expect.objectContaining({ atk: 255 }),
      }),
    );
  });

  it("shows live computed stats when base stats are supplied", () => {
    render(
      <TeamMemberPanel
        slot={0}
        member={member()}
        warnings={[]}
        baseStats={GARCHOMP_BASE}
        onChange={noop}
        onRemove={noop}
      />,
    );
    // HP at lvl 50: floor((2*108+31+0)*50/100)+50+10 = floor(123.5)+60 = 123+60 = 183.
    expect(screen.getByTestId("member-0-stat-hp")).toHaveTextContent("183");
    // Speed: 252 EV, +Spe nature (jolly), lvl 50.
    // inner = floor((2*102+31+63)*50/100)=floor(149)=149; (149+5)*1.1=169.4→169.
    expect(screen.getByTestId("member-0-stat-spe")).toHaveTextContent("169");
  });

  it("omits the live column when no base stats are given", () => {
    render(
      <TeamMemberPanel
        slot={0}
        member={member()}
        warnings={[]}
        onChange={noop}
        onRemove={noop}
      />,
    );
    expect(screen.queryByTestId("member-0-stat-hp")).not.toBeInTheDocument();
  });

  it("calls onRemove and reorder callbacks", () => {
    const onRemove = vi.fn();
    const onMoveUp = vi.fn();
    const onMoveDown = vi.fn();
    render(
      <TeamMemberPanel
        slot={1}
        member={member()}
        warnings={[]}
        onChange={noop}
        onRemove={onRemove}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        canMoveUp
        canMoveDown
      />,
    );
    fireEvent.click(screen.getByTestId("member-1-remove"));
    fireEvent.click(screen.getByTestId("member-1-up"));
    fireEvent.click(screen.getByTestId("member-1-down"));
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onMoveUp).toHaveBeenCalledOnce();
    expect(onMoveDown).toHaveBeenCalledOnce();
  });

  it("disables up/down at the ends", () => {
    render(
      <TeamMemberPanel
        slot={0}
        member={member()}
        warnings={[]}
        onChange={noop}
        onRemove={noop}
        canMoveUp={false}
        canMoveDown
      />,
    );
    expect(screen.getByTestId("member-0-up")).toBeDisabled();
    expect(screen.getByTestId("member-0-down")).not.toBeDisabled();
  });

  it("renders move metadata (type/category/power) in the moves table, em-dash for an empty slot", async () => {
    learnset.fetchLearnset.mockResolvedValue([
      {
        slug: "earthquake",
        display_name: "Earthquake",
        type: "ground",
        damage_class: "physical",
        power: 100,
      },
      { slug: "dragon-claw", display_name: "Dragon Claw" }, // no cached metadata
    ]);
    render(
      <TeamMemberPanel
        slot={0}
        member={member({ moves: ["earthquake", "dragon-claw"] })}
        warnings={[]}
        onChange={noop}
        onRemove={noop}
      />,
    );
    // Metadata hydrates asynchronously alongside the movepool fetch.
    expect(await screen.findByTestId("member-0-move-0-type")).toHaveTextContent(
      "ground",
    );
    expect(screen.getByTestId("member-0-move-0-category")).toHaveTextContent(
      "Physical",
    );
    expect(screen.getByTestId("member-0-move-0-power")).toHaveTextContent(
      "100",
    );
    // A move present in the learnset but with no cached reference detail.
    expect(screen.getByTestId("member-0-move-1-type")).toHaveTextContent("—");
    expect(screen.getByTestId("member-0-move-1-category")).toHaveTextContent(
      "—",
    );
    expect(screen.getByTestId("member-0-move-1-power")).toHaveTextContent(
      "—",
    );
    // An empty move slot.
    expect(screen.getByTestId("member-0-move-2-type")).toHaveTextContent("—");
    // Existing move-picker testids/values are unchanged.
    expect(screen.getByTestId("member-0-move-0")).toHaveValue("Earthquake");
  });

  it("uses the DB sprite_url for the identity sprite when present", () => {
    render(
      <TeamMemberPanel
        slot={0}
        member={member()}
        warnings={[]}
        spriteRef={{
          display_name: "Garchomp",
          sprite_url: "https://example.test/static/garchomp.png",
          dex_number: 445,
          types: ["dragon", "ground"],
          abilities: ["rough-skin"],
          required_item: null,
          base_stats: GARCHOMP_BASE,
        }}
        onChange={noop}
        onRemove={noop}
      />,
    );
    const img = document.querySelector(".team-member-panel__sprite img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe(
      "https://example.test/static/garchomp.png",
    );
  });

  it("rewrites a legacy Showdown GIF sprite_url onto the Oak media proxy", () => {
    render(
      <TeamMemberPanel
        slot={0}
        member={member({ species: "charizard-mega-x" })}
        warnings={[]}
        spriteRef={{
          display_name: "Charizard (Mega X)",
          sprite_url: "https://play.pokemonshowdown.com/sprites/ani/charizard-megax.gif",
          dex_number: 6,
          types: ["fire", "dragon"],
          abilities: ["tough-claws"],
          required_item: "charizardite-x",
          base_stats: GARCHOMP_BASE,
        }}
        onChange={noop}
        onRemove={noop}
      />,
    );
    const img = document.querySelector(".team-member-panel__sprite img");
    expect(img!.getAttribute("src")).toBe(
      "https://oak.gowtam.ai/api/media/sprite/charizard-megax",
    );
  });

  it("falls back to the Oak media guess after the DB sprite_url errors", () => {
    render(
      <TeamMemberPanel
        slot={0}
        member={member()}
        warnings={[]}
        spriteRef={{
          display_name: "Garchomp",
          sprite_url: "https://example.test/static/garchomp.png",
          dex_number: 445,
          types: ["dragon", "ground"],
          abilities: ["rough-skin"],
          required_item: null,
          base_stats: GARCHOMP_BASE,
        }}
        onChange={noop}
        onRemove={noop}
      />,
    );
    const img = document.querySelector(
      ".team-member-panel__sprite img",
    ) as HTMLImageElement;
    fireEvent.error(img);
    expect(img.getAttribute("src")).toBe(
      "https://oak.gowtam.ai/api/media/sprite/garchomp",
    );
  });

  it("renders per-slot warnings inline", () => {
    const warnings: TeamWarning[] = [
      {
        code: "move_not_in_learnset",
        message: "Garchomp can't learn Surf.",
        slot: 0,
        field: "moves[2]",
      },
    ];
    render(
      <TeamMemberPanel
        slot={0}
        member={member()}
        warnings={warnings}
        onChange={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByText(/can't learn Surf/)).toBeInTheDocument();
  });

  it("readOnly archive shows stored spreads and Tera without Stat Point chrome", () => {
    render(
      <TeamMemberPanel
        slot={0}
        member={member({
          tera_type: "ground",
          evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
        })}
        format="champions"
        readOnly
        warnings={[
          {
            code: "ability_not_for_species",
            message: 'Ability "rough-skin" is not in the Champions roster.',
            slot: 0,
            field: "ability",
          },
          {
            code: "move_not_in_learnset",
            message: 'Move "earthquake" is not in the Champions roster.',
            slot: 0,
            field: "moves[0]",
          },
        ]}
        onChange={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByTestId("member-0-ev-atk")).toHaveValue(252);
    expect(screen.getByTestId("member-0-ev-spe")).toHaveValue(252);
    expect(screen.getByTestId("member-0-ev-atk")).not.toHaveAttribute(
      "max",
      "32",
    );
    expect(screen.queryByTestId("member-0-ev-total")).not.toBeInTheDocument();
    expect(screen.queryByText(/stat points/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.getByTestId("member-0-tera")).toHaveValue("Ground");
    expect(
      screen.getByTestId("member-0-ability").closest(".team-member-panel__field"),
    ).toHaveTextContent(/not in the Champions roster/);
    expect(screen.getByTestId("member-0-move-0").closest("td")).toHaveTextContent(
      /not in the Champions roster/,
    );
  });
});

describe("TeamMemberPanel — Apply this Champions set (CF-TEAM-US-6, CF-UI-US-5)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/teams/set-template")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              found: true,
              member: USAGE_SET,
              attribution: "Live Champions usage",
            }),
          };
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function renderLiving(
    m: TeamMember,
    onChange: ReturnType<typeof vi.fn> = vi.fn(),
  ) {
    render(
      <TeamMemberPanel
        slot={0}
        member={m}
        format="champions"
        warnings={[]}
        onChange={onChange}
        onRemove={noop}
      />,
    );
    return onChange;
  }

  it("offers Apply this Champions set on a living slot (CF-TEAM-AC-6.1)", () => {
    renderLiving(livingMember({ moves: [], ability: null, item: null }));
    const btn = applySetButton();
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent(/apply this champions set/i);
  });

  it("fills an empty slot from the usage set with no confirm (CF-TEAM-AC-6.2)", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onChange = renderLiving(
      livingMember({
        ability: null,
        item: null,
        moves: [],
        nature: null,
        evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      }),
    );

    fireEvent.click(applySetButton()!);

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          species: "garchomp",
          ability: "rough-skin",
          item: "life-orb",
          nature: "jolly",
          moves: USAGE_SET.moves,
          evs: USAGE_SET.evs,
          tera_type: null,
          level: 50,
        }),
      ),
    );
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(queryReplaceConfirm()).not.toBeInTheDocument();
    const applied = onChange.mock.calls.at(-1)![0] as TeamMember;
    expect(applied.tera_type).toBeNull();
    expect(applied.level).toBe(50);
  });

  it("asks yes/no replace on a filled slot — not a field diff (CF-TEAM-AC-6.3, CF-UI-AC-5.1, CF-AS-3)", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onChange = renderLiving(livingMember());

    fireEvent.click(applySetButton()!);

    const ui = queryReplaceConfirm();
    if (ui) {
      expectYesNoReplaceConfirm(ui);
    } else {
      expect(confirmSpy).toHaveBeenCalled();
      const msg = String(confirmSpy.mock.calls[0]?.[0] ?? "");
      expect(msg).toMatch(/replace/i);
      expect(msg).not.toMatch(/ability:|item:|nature:|→/i);
    }
    // Cancel / dismiss: slot unchanged (CF-UI-AC-5.2).
    if (ui) {
      fireEvent.click(
        within(ui).getByRole("button", { name: /cancel|no|keep/i }),
      );
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it("replaces the filled slot on confirm (CF-TEAM-AC-6.3, CF-UI-AC-5.3)", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onChange = renderLiving(
      livingMember({
        ability: "sand-veil",
        item: "leftovers",
        moves: ["swords-dance"],
        nature: "adamant",
        evs: { hp: 32, atk: 32, def: 2, spa: 0, spd: 0, spe: 0 },
      }),
    );

    fireEvent.click(applySetButton()!);

    const ui = queryReplaceConfirm();
    if (ui) {
      const go =
        within(ui).queryByRole("button", {
          name: /^(replace|confirm|yes|overwrite)$/i,
        }) ??
        within(ui).getByRole("button", { name: /replace|overwrite|yes/i });
      fireEvent.click(go);
    } else {
      expect(confirmSpy).toHaveBeenCalled();
    }

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          ability: "rough-skin",
          item: "life-orb",
          moves: USAGE_SET.moves,
          nature: "jolly",
          evs: USAGE_SET.evs,
          tera_type: null,
          level: 50,
        }),
      ),
    );
  });
});
