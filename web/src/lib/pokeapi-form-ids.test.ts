import { describe, expect, it } from "vitest";

import { pokeApiFormIdForSpriteId } from "./pokeapi-form-ids";

describe("pokeApiFormIdForSpriteId", () => {
  it("maps the five M-C megas that 404 on Showdown ani/", () => {
    expect(pokeApiFormIdForSpriteId("absol-megaz")).toBe(10307);
    expect(pokeApiFormIdForSpriteId("garchomp-megaz")).toBe(10309);
    expect(pokeApiFormIdForSpriteId("lucario-megaz")).toBe(10310);
    expect(pokeApiFormIdForSpriteId("golisopod-mega")).toBe(10316);
    expect(pokeApiFormIdForSpriteId("baxcalibur-mega")).toBe(10325);
  });

  it("returns null for unknown ids (including Oak slugs)", () => {
    expect(pokeApiFormIdForSpriteId("gyarados")).toBeNull();
    expect(pokeApiFormIdForSpriteId("garchomp-mega-z")).toBeNull();
    expect(pokeApiFormIdForSpriteId("not-a-pokemon")).toBeNull();
    expect(pokeApiFormIdForSpriteId("absol-mega")).toBeNull();
  });
});
