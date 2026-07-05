import { describe, it, expect } from "vitest";
import {
  displayCitationSource,
  GAME_DATABASE_LABEL,
  COMMUNITY_WIKI_PREFIX,
  META_USAGE_GEN9OU_LABEL,
  META_USAGE_LABEL,
  MOVEPOOL_LABEL,
} from "./citation-display";

describe("displayCitationSource (copy-table §2)", () => {
  it("maps entity kinds to '<Kind> — <Titleized Slug>'", () => {
    expect(displayCitationSource("pokemon/garchomp")).toBe(
      "Pokémon — Garchomp",
    );
    expect(displayCitationSource("move/fake-out")).toBe("Move — Fake Out");
    expect(displayCitationSource("ability/armor-tail")).toBe(
      "Ability — Armor Tail",
    );
    expect(displayCitationSource("item/choice-scarf")).toBe(
      "Item — Choice Scarf",
    );
    expect(displayCitationSource("type/ground")).toBe("Type — Ground");
  });

  it("maps learnset sources to Movepool, stripping a trailing gen qualifier", () => {
    expect(displayCitationSource("learnset/will-o-wisp (gen-9)")).toBe(
      `${MOVEPOOL_LABEL} — Will O Wisp`,
    );
    expect(displayCitationSource("learnset/outrage")).toBe(
      `${MOVEPOOL_LABEL} — Outrage`,
    );
  });

  it("maps run_sql/* to the fixed game-database label, regardless of table name", () => {
    expect(displayCitationSource("run_sql/natdex_species")).toBe(
      GAME_DATABASE_LABEL,
    );
    expect(displayCitationSource("run_sql/pmd_recruits")).toBe(
      GAME_DATABASE_LABEL,
    );
  });

  it("maps wiki/<page> to 'Community wiki — <page>' as-is", () => {
    expect(displayCitationSource("wiki/Team_Rocket_Hideout")).toBe(
      `${COMMUNITY_WIKI_PREFIX}Team_Rocket_Hideout`,
    );
  });

  it("maps get_meta_usage/gen9ou to the Gen 9 OU label, other formats to the generic label", () => {
    expect(displayCitationSource("get_meta_usage/gen9ou")).toBe(
      META_USAGE_GEN9OU_LABEL,
    );
    expect(displayCitationSource("get_meta_usage/gen8ou")).toBe(
      META_USAGE_LABEL,
    );
  });

  it("passes unrecognized sources through unchanged", () => {
    expect(displayCitationSource("some_unrecognized_thing")).toBe(
      "some_unrecognized_thing",
    );
    expect(displayCitationSource("")).toBe("");
  });

  it("falls back to the raw string on an empty slug (edge case)", () => {
    expect(displayCitationSource("pokemon/")).toBe("pokemon/");
    expect(displayCitationSource("learnset/ (gen-9)")).toBe(
      "learnset/ (gen-9)",
    );
  });
});
