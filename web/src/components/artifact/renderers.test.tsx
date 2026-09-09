/**
 * B-4 Phase 5 — per-kind renderer tests. Each renderer is rendered standalone
 * from a fixture (no provider mounted — EntityLink's no-op default keeps it
 * renderable, TD-5). Asserts the shape, the grouped + clickable movepool, the
 * matchup grids, and that clicking a nested entity without a provider is a safe
 * no-op.
 */

import { afterEach, describe, expect, it } from "vitest";
import { render, screen, within, fireEvent, cleanup } from "@testing-library/react";

import PokemonArtifact from "./PokemonArtifact";
import MoveArtifact from "./MoveArtifact";
import AbilityArtifact from "./AbilityArtifact";
import ItemArtifact from "./ItemArtifact";
import TypeMatchupsArtifact from "./TypeMatchupsArtifact";
import ComparisonArtifact from "./ComparisonArtifact";
import DamageCalcArtifact from "./DamageCalcArtifact";
import {
  ABILITY_ARTIFACT,
  ITEM_ARTIFACT,
  MOVE_ARTIFACT,
  POKEMON_ARTIFACT,
  TYPE_ARTIFACT,
} from "./artifact-fixtures";
import {
  DAMAGE_CALC_GARCHOMP,
  SUBJECT_GARCHOMP,
} from "@/components/test-fixtures";
import type { PokemonArtifactData } from "@/lib/entity-artifact";

afterEach(() => cleanup());

describe("PokemonArtifact", () => {
  // Component fixture layering the contract-B quad arrays (#12) onto the shared
  // Garchomp fixture: ice is a 4x weakness, fire a 1/4 resist.
  const POKEMON_WITH_QUAD = {
    ...POKEMON_ARTIFACT.data,
    matchups: {
      ...POKEMON_ARTIFACT.data.matchups,
      quad_weak_to: ["ice"],
      quad_resists: ["fire"],
    },
  } as PokemonArtifactData;

  it("renders stats, abilities, matchups, and a grouped clickable movepool", () => {
    render(<PokemonArtifact data={POKEMON_WITH_QUAD} />);

    expect(screen.getByTestId("pokemon-artifact")).toBeInTheDocument();
    // Base stats (per-stat value) + the total row.
    expect(screen.getByTestId("pokemon-stats")).toHaveTextContent("130");
    expect(screen.getByTestId("pokemon-stats")).toHaveTextContent("600");

    // Abilities: titleized DISPLAY label (#3), with the hidden marker lifted
    // into a standalone badge (#4) — not inline "(Hidden)" text.
    const abilities = screen.getByTestId("pokemon-abilities");
    expect(within(abilities).getByText("Rough Skin")).toBeInTheDocument();
    expect(
      within(abilities).queryByText(/\(Hidden\)/),
    ).not.toBeInTheDocument();
    const hiddenBadge = within(abilities).getByText("Hidden");
    expect(hiddenBadge).toHaveClass("ability-chip__hidden-badge");

    // Combined defensive grid + magnitudes (#12): quad members read ×4 / ×¼,
    // the remainder ×2 / ×½, immunities ×0.
    const weak = screen.getByTestId("matchups-weak");
    expect(weak).toHaveTextContent("×4"); // ice (quad)
    expect(weak).toHaveTextContent("×2"); // dragon / fairy
    const resists = screen.getByTestId("matchups-resists");
    expect(resists).toHaveTextContent("×¼"); // fire (quad)
    expect(resists).toHaveTextContent("×½"); // poison / rock
    const immune = screen.getByTestId("matchups-immune");
    expect(immune).toHaveTextContent("electric");
    expect(immune).toHaveTextContent("×0");

    // Movepool grouped by method; moves are clickable EntityLink buttons.
    expect(screen.getByTestId("movepool-group-Level-up")).toBeInTheDocument();
    const moveBtn = screen.getByTestId("movepool-move-dragon-claw");
    expect(moveBtn.tagName).toBe("BUTTON");
    // No provider mounted → click is a safe no-op (does not throw).
    expect(() => fireEvent.click(moveBtn)).not.toThrow();
  });

  it("shows Summary / Usage tabs when a slug is provided and stays on Summary", () => {
    render(<PokemonArtifact data={POKEMON_WITH_QUAD} slug="garchomp" />);
    expect(screen.getByTestId("pokemon-artifact-tab-summary")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("pokemon-stats")).toBeInTheDocument();
    expect(screen.queryByTestId("pokemon-usage")).not.toBeInTheDocument();
  });

  it("opens the Usage tab without losing the summary on toggle back", async () => {
    render(<PokemonArtifact data={POKEMON_WITH_QUAD} slug="garchomp" />);
    fireEvent.click(screen.getByTestId("pokemon-artifact-tab-usage"));
    expect(await screen.findByTestId("pokemon-usage")).toBeInTheDocument();
    expect(screen.queryByTestId("pokemon-stats")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("pokemon-artifact-tab-summary"));
    expect(screen.getByTestId("pokemon-stats")).toBeInTheDocument();
  });

  it("orders movepool types and matchup rows by Champions display order", () => {
    render(<PokemonArtifact data={POKEMON_WITH_QUAD} />);

    // Movepool: within a method group, types follow Champions order
    // (fire=2 before dragon=14), not alphabetical (which gave dragon first).
    const levelUp = screen.getByTestId("movepool-group-Level-up");
    const moveIds = Array.from(
      levelUp.querySelectorAll('[data-testid^="movepool-move-"]'),
    ).map((el) => el.getAttribute("data-testid"));
    expect(moveIds).toEqual([
      "movepool-move-fire-fang",
      "movepool-move-dragon-claw",
    ]);

    // Matchups: Resists reads fire, rock, poison (Champions order),
    // reordered from the fixture's [fire, poison, rock].
    const resists = screen.getByTestId("matchups-resists");
    const resistIds = Array.from(
      resists.querySelectorAll('[data-testid^="type-badge-"]'),
    ).map((el) => el.getAttribute("data-testid"));
    expect(resistIds).toEqual([
      "type-badge-fire",
      "type-badge-rock",
      "type-badge-poison",
    ]);
  });
});

describe("MoveArtifact", () => {
  it("renders the move stats and effect", () => {
    render(<MoveArtifact data={MOVE_ARTIFACT.data} />);
    expect(screen.getByTestId("move-stats")).toHaveTextContent("physical");
    expect(screen.getByTestId("move-effect")).toHaveTextContent(
      "hits all adjacent",
    );
    expect(screen.getByTestId("type-badge-ground")).toBeInTheDocument();
  });
});

describe("AbilityArtifact", () => {
  it("renders the effect and a clickable learned_by roster", () => {
    render(<AbilityArtifact data={ABILITY_ARTIFACT.data} />);
    expect(screen.getByTestId("ability-effect")).toHaveTextContent("contact");
    const holders = screen.getByTestId("ability-holders");
    expect(within(holders).getByTestId("ability-holder-garchomp")).toBeInTheDocument();
  });
});

describe("ItemArtifact", () => {
  it("renders the item effect", () => {
    render(<ItemArtifact data={ITEM_ARTIFACT.data} />);
    expect(screen.getByTestId("item-effect")).toHaveTextContent("max HP");
  });
});

describe("TypeMatchupsArtifact", () => {
  it("renders offensive + defensive grids", () => {
    render(<TypeMatchupsArtifact data={TYPE_ARTIFACT.data} />);
    expect(screen.getByTestId("type-offensive")).toHaveTextContent("flying");
    expect(screen.getByTestId("defensive-weak")).toHaveTextContent("water");
  });
});

describe("ComparisonArtifact", () => {
  it("renders one clickable card per subject", () => {
    render(<ComparisonArtifact subjects={[SUBJECT_GARCHOMP]} />);
    expect(screen.getByTestId("comparison-subject-0")).toBeInTheDocument();
    expect(screen.getByTestId("sprite-card")).toBeInTheDocument();
  });

  it("renders a P5 profile diff and both format tags (CMP-US-1, CMP-AC-2.1)", () => {
    render(
      <ComparisonArtifact
        subjects={[SUBJECT_GARCHOMP, SUBJECT_GARCHOMP]}
        signedIn
        diff={{
          left: { format: "gen-4", name: "Garchomp" },
          right: { format: "scarlet-violet", name: "Garchomp" },
          stats: {
            hp: { left: 108, right: 108, delta: 0 },
            attack: { left: 130, right: 130, delta: 0 },
            defense: { left: 95, right: 95, delta: 0 },
            special_attack: { left: 80, right: 80, delta: 0 },
            special_defense: { left: 85, right: 85, delta: 0 },
            speed: { left: 102, right: 102, delta: 0 },
          },
          types: { left: ["dragon", "ground"], right: ["dragon", "ground"] },
          abilities: {
            left: ["sand-veil"],
            right: ["sand-veil"],
            onlyLeft: [],
            onlyRight: [],
            shared: ["sand-veil"],
          },
          speed: {
            left: 102,
            right: 102,
            delta: 0,
            level: 50,
            nature: "hardy",
            source: "default",
          },
          movepool: { onlyLeft: ["outrage"], onlyRight: [], shared: ["earthquake"] },
          matchups: {
            defensive: {
              weak_to: { onlyLeft: [], onlyRight: [], shared: ["ice"] },
              resists: { onlyLeft: [], onlyRight: [], shared: ["fire"] },
              immune_to: { onlyLeft: [], onlyRight: [], shared: ["electric"] },
            },
            offensive: {
              super_effective_against: { onlyLeft: [], onlyRight: [], shared: [] },
              not_very_effective_against: {
                onlyLeft: [],
                onlyRight: [],
                shared: [],
              },
              no_effect_against: { onlyLeft: [], onlyRight: [], shared: [] },
            },
          },
        }}
      />,
    );
    const diff = screen.getByTestId("comparison-diff");
    expect(diff).toHaveTextContent(/movepool/i);
    expect(screen.getByText("Gen 4")).toBeInTheDocument();
    expect(screen.getByText("Scarlet/Violet")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /add to team/i }).length,
    ).toBeGreaterThan(0);
  });
});

describe("DamageCalcArtifact", () => {
  it("reuses the DamageReadout for the breakdown", () => {
    render(<DamageCalcArtifact damageCalc={DAMAGE_CALC_GARCHOMP} />);
    expect(screen.getByTestId("damage-calc-artifact")).toBeInTheDocument();
    expect(screen.getByTestId("damage-readout")).toBeInTheDocument();
  });
});

describe("renderers — Dex stays on the viewer header (DEX-AC-1.2)", () => {
  it("does not put Open in Dex on the standalone Pokémon / type renderer", () => {
    render(<PokemonArtifact data={POKEMON_ARTIFACT.data} />);
    expect(screen.queryByRole("link", { name: /open in dex/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /open in dex/i })).toBeNull();
    cleanup();
    render(<TypeMatchupsArtifact data={TYPE_ARTIFACT.data} />);
    expect(screen.queryByRole("link", { name: /open in dex/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /open in dex/i })).toBeNull();
  });
});
