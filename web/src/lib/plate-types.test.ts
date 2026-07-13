import { describe, expect, it } from "vitest";
import { plateFromSubjects, typeCssVar } from "./plate-types";

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
