import { describe, expect, it } from "vitest";
import {
  plateFromSubjects,
  plateFromTypes,
  plateHintFromToolLabels,
  typeCssVar,
  isTypeName,
} from "./plate-types";

describe("typeCssVar", () => {
  it("maps known types to --type-* vars", () => {
    expect(typeCssVar("dragon")).toBe("var(--type-dragon)");
    expect(typeCssVar("Ground")).toBe("var(--type-ground)");
  });

  it("falls back to normal for unknown / empty", () => {
    expect(typeCssVar("notatype")).toBe("var(--type-normal)");
    expect(typeCssVar(undefined)).toBe("var(--type-normal)");
  });
});

describe("isTypeName", () => {
  it("recognizes known types case-insensitively", () => {
    expect(isTypeName("Fire")).toBe(true);
    expect(isTypeName("garchomp")).toBe(false);
  });
});

describe("plateFromTypes", () => {
  it("returns ink plate when empty", () => {
    const plate = plateFromTypes([]);
    expect(plate.kind).toBe("ink");
    expect(plate.className).toContain("answer-card--ink");
  });

  it("returns typed plate for 1–2 types", () => {
    const plate = plateFromTypes(["dragon", "ground"]);
    expect(plate.kind).toBe("typed");
    expect(plate.className).toBe("");
    expect(plate.style).toMatchObject({
      "--plate-a": "var(--type-dragon)",
      "--plate-b": "var(--type-ground)",
    });
  });

  it("returns multi plate for 3+ types", () => {
    const plate = plateFromTypes(["fire", "water", "grass"]);
    expect(plate.kind).toBe("multi");
    expect(plate.className).toContain("answer-card--multi");
  });

  it("ignores unknown type tokens", () => {
    expect(plateFromTypes(["notatype"]).kind).toBe("ink");
  });
});

describe("plateFromSubjects", () => {
  it("returns ink plate when there are no subjects", () => {
    const plate = plateFromSubjects([]);
    expect(plate.kind).toBe("ink");
    expect(plate.className).toContain("answer-card--ink");
  });

  it("returns typed plate from first subject's types", () => {
    const plate = plateFromSubjects([{ types: ["dragon", "ground"] }]);
    expect(plate.kind).toBe("typed");
    expect(plate.className).toBe("");
    expect(plate.style).toMatchObject({
      "--plate-a": "var(--type-dragon)",
      "--plate-b": "var(--type-ground)",
    });
  });

  it("returns multi plate when there are multiple subjects", () => {
    const plate = plateFromSubjects([
      { types: ["steel", "ghost"] },
      { types: ["dragon", "ground"] },
    ]);
    expect(plate.kind).toBe("multi");
    expect(plate.className).toContain("answer-card--multi");
    expect(plate.style).toMatchObject({
      "--plate-a": "var(--type-steel)",
      "--plate-b": "var(--type-ghost)",
    });
  });
});

describe("plateHintFromToolLabels", () => {
  it("returns null when no type words appear", () => {
    expect(plateHintFromToolLabels(["Looking up Garchomp"])).toBeNull();
    expect(plateHintFromToolLabels([])).toBeNull();
  });

  it("returns typed wash for a single type word", () => {
    const plate = plateHintFromToolLabels(["Type matchups for dragon"]);
    expect(plate?.kind).toBe("typed");
    expect(plate?.style).toMatchObject({
      "--plate-a": "var(--type-dragon)",
    });
  });

  it("returns dual wash for exactly two distinct types", () => {
    const plate = plateHintFromToolLabels([
      "dragon typing",
      "ground STAB",
    ]);
    expect(plate?.kind).toBe("typed");
    expect(plate?.style).toMatchObject({
      "--plate-a": "var(--type-dragon)",
      "--plate-b": "var(--type-ground)",
    });
  });

  it("returns null when three or more types are mentioned (prefer no wrong type)", () => {
    expect(
      plateHintFromToolLabels(["fire, water, and grass matchups"]),
    ).toBeNull();
  });
});
