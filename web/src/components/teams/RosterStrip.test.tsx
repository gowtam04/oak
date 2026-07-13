import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import RosterStrip from "./RosterStrip";
import type { TeamMember } from "@/data/teams/team-schema";
import type { SpriteRef } from "@/lib/api/sprites-client";

afterEach(() => cleanup());

function member(species: string | null): TeamMember {
  return {
    species,
    ability: null,
    item: null,
    moves: [],
    nature: null,
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    tera_type: null,
    level: 50,
    nickname: null,
  };
}

const GARCHOMP_REF: SpriteRef = {
  display_name: "Garchomp",
  sprite_url: "https://example.test/static/garchomp.png",
  dex_number: 445,
  types: ["dragon", "ground"],
  abilities: ["rough-skin"],
  required_item: null,
  base_stats: {
    hp: 108,
    attack: 130,
    defense: 95,
    special_attack: 80,
    special_defense: 85,
    speed: 102,
  },
};

describe("RosterStrip", () => {
  it("uses the DB sprite_url when the sprite lookup has resolved", () => {
    render(
      <RosterStrip
        members={[member("garchomp")]}
        selectedSlot={0}
        spriteBySpecies={{ garchomp: GARCHOMP_REF }}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
      />,
    );
    const img = document.querySelector(
      "[data-testid='roster-slot-0'] .roster-slot__sprite img",
    );
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe(
      "https://example.test/static/garchomp.png",
    );
  });

  it("applies a type plate edge from sprite types on filled slots", () => {
    render(
      <RosterStrip
        members={[member("garchomp")]}
        selectedSlot={0}
        spriteBySpecies={{ garchomp: GARCHOMP_REF }}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
      />,
    );
    const slot = screen.getByTestId("roster-slot-0");
    expect(slot.getAttribute("data-plate")).toBe("typed");
    expect(slot.style.getPropertyValue("--plate-a")).toBe("var(--type-dragon)");
    expect(slot.style.getPropertyValue("--plate-b")).toBe("var(--type-ground)");
  });

  it("does not type-wash empty slots", () => {
    render(
      <RosterStrip
        members={[member(null)]}
        selectedSlot={0}
        spriteBySpecies={{}}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
      />,
    );
    const slot = screen.getByTestId("roster-slot-0");
    expect(slot.getAttribute("data-empty")).toBe("true");
    expect(slot.getAttribute("data-plate")).toBeNull();
  });

  it("guesses an Oak media sprite before the sprite lookup has resolved (no ref yet)", () => {
    render(
      <RosterStrip
        members={[member("charizard-mega-x")]}
        selectedSlot={0}
        spriteBySpecies={{}}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
      />,
    );
    const img = document.querySelector(
      "[data-testid='roster-slot-0'] .roster-slot__sprite img",
    );
    expect(img!.getAttribute("src")).toBe(
      "https://oak.gowtam.ai/api/media/sprite/charizard-megax",
    );
  });

  it("falls back to the Oak media guess after the DB sprite_url errors (one-shot)", () => {
    render(
      <RosterStrip
        members={[member("garchomp")]}
        selectedSlot={0}
        spriteBySpecies={{ garchomp: GARCHOMP_REF }}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
      />,
    );
    const img = document.querySelector(
      "[data-testid='roster-slot-0'] .roster-slot__sprite img",
    ) as HTMLImageElement;
    fireEvent.error(img);
    expect(img.getAttribute("src")).toBe(
      "https://oak.gowtam.ai/api/media/sprite/garchomp",
    );
  });

  it("renders an empty placeholder for an empty slot (no species)", () => {
    render(
      <RosterStrip
        members={[member(null)]}
        selectedSlot={0}
        spriteBySpecies={{}}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
      />,
    );
    expect(
      document.querySelector(
        "[data-testid='roster-slot-0'] .roster-slot__sprite-empty",
      ),
    ).toBeInTheDocument();
    expect(
      document.querySelector("[data-testid='roster-slot-0'] img"),
    ).toBeNull();
    // The empty slot invites filling ("not yet"), not a bare "Empty".
    expect(screen.getByTestId("roster-slot-0")).toHaveTextContent(
      "Add a Pokémon",
    );
  });

  it("renders the trailing add tile as a dashed pokeball placeholder", () => {
    render(
      <RosterStrip
        members={[member("garchomp")]}
        selectedSlot={0}
        spriteBySpecies={{}}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
      />,
    );
    const add = screen.getByTestId("team-add-member");
    expect(add).toHaveTextContent("Add a Pokémon");
    expect(
      add.querySelector(".roster-slot__sprite-empty"),
    ).toBeInTheDocument();
  });

  it("shows a held-item pip for a member holding an item", () => {
    render(
      <RosterStrip
        members={[{ ...member("garchomp"), item: "life-orb" }]}
        selectedSlot={0}
        spriteBySpecies={{ garchomp: GARCHOMP_REF }}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
      />,
    );
    expect(screen.getByTestId("roster-slot-0")).toHaveTextContent("Life Orb");
  });

  it("selecting a slot and adding a member still fire their callbacks", () => {
    const onSelect = vi.fn();
    const onAdd = vi.fn();
    render(
      <RosterStrip
        members={[member("garchomp")]}
        selectedSlot={0}
        spriteBySpecies={{}}
        onSelect={onSelect}
        onAdd={onAdd}
      />,
    );
    fireEvent.click(screen.getByTestId("roster-slot-0"));
    expect(onSelect).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByTestId("team-add-member"));
    expect(onAdd).toHaveBeenCalledOnce();
  });
});
