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

afterEach(() => cleanup());

describe("PokemonArtifact", () => {
  it("renders stats, abilities, matchups, and a grouped clickable movepool", () => {
    render(<PokemonArtifact data={POKEMON_ARTIFACT.data} />);

    expect(screen.getByTestId("pokemon-artifact")).toBeInTheDocument();
    // Base stats (value + bar) for all six + total.
    expect(screen.getByTestId("pokemon-stats")).toHaveTextContent("130");
    expect(screen.getByTestId("pokemon-stats")).toHaveTextContent("600");

    // Abilities incl. the hidden-ability label.
    const abilities = screen.getByTestId("pokemon-abilities");
    expect(within(abilities).getByText(/rough-skin \(Hidden\)/)).toBeInTheDocument();

    // Combined defensive grid.
    expect(screen.getByTestId("matchups-immune")).toHaveTextContent("electric");

    // Movepool grouped by method; moves are clickable EntityLink buttons.
    expect(screen.getByTestId("movepool-group-Level-up")).toBeInTheDocument();
    const moveBtn = screen.getByTestId("movepool-move-dragon-claw");
    expect(moveBtn.tagName).toBe("BUTTON");
    // No provider mounted → click is a safe no-op (does not throw).
    expect(() => fireEvent.click(moveBtn)).not.toThrow();
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
});

describe("DamageCalcArtifact", () => {
  it("reuses the DamageReadout for the breakdown", () => {
    render(<DamageCalcArtifact damageCalc={DAMAGE_CALC_GARCHOMP} />);
    expect(screen.getByTestId("damage-calc-artifact")).toBeInTheDocument();
    expect(screen.getByTestId("damage-readout")).toBeInTheDocument();
  });
});
