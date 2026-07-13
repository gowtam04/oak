import { describe, it, expect } from "vitest";

import {
  buildRoleInventory,
  analysisSuggestionChips,
} from "./role-inventory";

describe("buildRoleInventory", () => {
  it("detects Stealth Rock, priority, and setup from moves", () => {
    const inv = buildRoleInventory(
      [
        {
          slug: "garchomp",
          moves: ["stealth-rock", "earthquake", "swords-dance", "sucker-punch"],
          damageClasses: ["status", "physical", "status", "physical"],
        },
      ],
      "scarlet-violet",
    );
    expect(inv.roles_present).toEqual(
      expect.arrayContaining(["stealth_rock", "priority", "setup"]),
    );
    expect(inv.physical_special.physical_moves).toBe(2);
    expect(inv.physical_special.status_moves).toBe(2);
  });

  it("flags missing hazard removal when hazards are present (singles)", () => {
    const inv = buildRoleInventory(
      [{ slug: "garchomp", moves: ["stealth-rock", "earthquake"] }],
      "scarlet-violet",
    );
    expect(inv.roles_missing).toContain("hazard_removal");
  });

  it("does not flag hazard removal when no hazards", () => {
    const inv = buildRoleInventory(
      [{ slug: "garchomp", moves: ["earthquake", "outrage"] }],
      "scarlet-violet",
    );
    expect(inv.roles_missing).not.toContain("hazard_removal");
  });

  it("Champions expects speed control, Fake Out, redirection", () => {
    const inv = buildRoleInventory(
      [{ slug: "incineroar", moves: ["flare-blitz", "knock-off"] }],
      "champions",
    );
    expect(inv.roles_missing).toEqual(
      expect.arrayContaining(["speed_control", "fake_out", "redirection"]),
    );
  });

  it("Tailwind counts as speed control on Champions", () => {
    const inv = buildRoleInventory(
      [
        {
          slug: "whimsicott",
          moves: ["tailwind", "moonblast"],
          ability: "prankster",
        },
      ],
      "champions",
    );
    expect(inv.roles_present).toContain("speed_control");
    expect(inv.roles_present).toContain("tailwind");
    expect(inv.roles_missing).not.toContain("speed_control");
  });

  it("Intimidate ability flags intimidate", () => {
    const inv = buildRoleInventory(
      [
        {
          slug: "incineroar",
          moves: ["fake-out", "flare-blitz"],
          ability: "intimidate",
        },
      ],
      "champions",
    );
    expect(inv.roles_present).toContain("intimidate");
    expect(inv.roles_present).toContain("fake_out");
  });
});

describe("analysisSuggestionChips", () => {
  it("builds chips from missing roles and shared weaknesses", () => {
    const chips = analysisSuggestionChips({
      roles_missing: ["speed_control", "hazard_removal"],
      defense_weak_counts: [
        { type: "ground", count: 3 },
        { type: "ice", count: 1 },
      ],
      uncovered: ["fairy", "steel"],
    });
    expect(chips.some((c) => c.includes("speed control") || c.includes("Tailwind"))).toBe(
      true,
    );
    expect(chips.some((c) => c.includes("Ground"))).toBe(true);
  });

  it("falls back when nothing is wrong", () => {
    const chips = analysisSuggestionChips({
      roles_missing: [],
      defense_weak_counts: [],
      uncovered: [],
    });
    expect(chips.length).toBeGreaterThan(0);
    expect(chips[0]).toMatch(/coverage|set/i);
  });
});
