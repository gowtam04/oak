/**
 * Pure unit tests for the box-build classifier (`isBoxBuildMessage`,
 * `extractBoxNames`, `namedForParty`).
 *
 * Loop-guard contract (BOX-BR-1, BOX-AC-3.3): a pasted owned list / “make a
 * party from these” (EN or KR) is a box-build so the runtime can pick cap 6
 * before the first model call. Does not talk to the DB.
 *
 * Until box-build.ts exists, beforeAll records the load error so vitest can
 * still collect the file (red gate, not a collection crash).
 */

import { beforeAll, describe, expect, it } from "vitest";

type IsBoxBuildMessage = (
  message: string,
  historyTexts?: string[],
) => boolean;
type ExtractBoxNames = (message: string) => string[];
type NamedForParty = (
  message: string,
  historyTexts?: string[],
) => string[];

let isBoxBuildMessage: IsBoxBuildMessage;
let extractBoxNames: ExtractBoxNames;
let namedForParty: NamedForParty;
let loadError: unknown = null;

beforeAll(async () => {
  try {
    const mod = (await import("@/agent/box-build")) as Record<string, unknown>;
    isBoxBuildMessage = mod.isBoxBuildMessage as IsBoxBuildMessage;
    extractBoxNames = mod.extractBoxNames as ExtractBoxNames;
    namedForParty = mod.namedForParty as NamedForParty;
    if (typeof isBoxBuildMessage !== "function") {
      throw new Error(
        "Expected isBoxBuildMessage export from src/agent/box-build.ts",
      );
    }
    if (typeof extractBoxNames !== "function") {
      throw new Error(
        "Expected extractBoxNames export from src/agent/box-build.ts",
      );
    }
    if (typeof namedForParty !== "function") {
      throw new Error(
        "Expected namedForParty export from src/agent/box-build.ts",
      );
    }
  } catch (e) {
    loadError = e;
  }
});

function ensureLoaded(): void {
  if (loadError) {
    throw new Error(`box-build module not loadable yet: ${String(loadError)}`);
  }
}

/** Six comma-separated Latin names — the production-paste floor (BOX-AC-3.3). */
const SIX_COMMA =
  "Gengar, Garchomp, Dragonite, Tyranitar, Scizor, Magnezone";

const SIX_NEWLINE = [
  "Gengar",
  "Garchomp",
  "Dragonite",
  "Tyranitar",
  "Scizor",
  "Magnezone",
].join("\n");

const FIFTEEN_COMMA = [
  "Gengar",
  "Garchomp",
  "Dragonite",
  "Kangaskhan",
  "Tyranitar",
  "Scizor",
  "Magnezone",
  "Heatran",
  "Zapdos",
  "Clefable",
  "Amoonguss",
  "Pelipper",
  "Landorus",
  "Ferrothorn",
  "Toxapex",
].join(", ");

const SIX_TOKENS = [
  "Gengar",
  "Garchomp",
  "Dragonite",
  "Tyranitar",
  "Scizor",
  "Magnezone",
];

describe("isBoxBuildMessage (BOX-BR-1, BOX-BR-10, BOX-US-1)", () => {
  describe("positive — box-build", () => {
    it("is true for ≥6 comma-separated Latin name tokens (BOX-AC-2.1)", () => {
      ensureLoaded();
      expect(isBoxBuildMessage(SIX_COMMA)).toBe(true);
      expect(isBoxBuildMessage(FIFTEEN_COMMA)).toBe(true);
    });

    it("is true for ≥6 newline-separated Latin name tokens", () => {
      ensureLoaded();
      expect(isBoxBuildMessage(SIX_NEWLINE)).toBe(true);
    });

    it.each([
      ["build", "Gengar, Garchomp, Dragonite build a party"],
      ["make", "make a party with Gengar, Garchomp, Dragonite"],
      ["party", "Gengar, Garchomp, Dragonite party"],
      ["team", "Gengar, Garchomp, Dragonite team"],
      ["box", "Gengar, Garchomp, Dragonite box"],
    ])(
      "is true for ≥3 Latin names AND English party/team verb (%s) (BOX-US-1)",
      (_verb, message) => {
        ensureLoaded();
        expect(isBoxBuildMessage(message)).toBe(true);
      },
    );

    it.each([
      ["파티", "Gengar, Garchomp, Dragonite 파티"],
      ["팀", "Gengar, Garchomp, Dragonite 팀"],
      ["만들어", "Gengar, Garchomp, Dragonite 만들어"],
      ["만들어줘", "Gengar, Garchomp, Dragonite 만들어줘"],
      ["빼지", "Gengar, Garchomp, Dragonite 빼지"],
    ])(
      "is true for ≥3 Latin names AND Korean party/team verb (%s) (BOX-BR-10)",
      (_verb, message) => {
        ensureLoaded();
        expect(isBoxBuildMessage(message)).toBe(true);
      },
    );

    it('is true for Korean+Latin mix "Gengar Garchomp Dragonite 파티 만들어" (BOX-BR-10)', () => {
      ensureLoaded();
      expect(
        isBoxBuildMessage("Gengar Garchomp Dragonite 파티 만들어"),
      ).toBe(true);
    });

    it("is true for a mixed message that is primarily a box-build (BOX-AC-4.3)", () => {
      ensureLoaded();
      expect(
        isBoxBuildMessage(
          `here is my box: ${SIX_COMMA}, Heatran — make a party. also what's the weather in Paldea`,
        ),
      ).toBe(true);
    });
  });

  describe("positive — follow-up inherit (BOX-US-5, BOX-AC-5.1, BOX-BR-11)", () => {
    it.each([
      "don't drop Kangaskhan",
      "don't drop it",
      "빼지",
      "빼지 마",
      "다시",
      "put it back",
    ])(
      "is true when the current message is keep/drop/rebuild (%s) and a prior user message is a box-build",
      (followUp) => {
        ensureLoaded();
        expect(isBoxBuildMessage(followUp, [SIX_COMMA])).toBe(true);
        expect(isBoxBuildMessage(followUp, [FIFTEEN_COMMA])).toBe(true);
      },
    );

    it("is false for keep/drop/rebuild language with no prior box-build (BOX-AC-5.1)", () => {
      ensureLoaded();
      expect(isBoxBuildMessage("don't drop Kangaskhan")).toBe(false);
      expect(isBoxBuildMessage("don't drop Kangaskhan", [])).toBe(false);
      expect(
        isBoxBuildMessage("don't drop Kangaskhan", [
          "what is Garchomp's speed",
        ]),
      ).toBe(false);
      expect(isBoxBuildMessage("빼지 마")).toBe(false);
      expect(isBoxBuildMessage("put it back")).toBe(false);
      expect(isBoxBuildMessage("다시")).toBe(false);
    });
  });

  describe("negative — not box-build", () => {
    it("is false for a movepool / learnset primary ask (BOX-AC-4.1, BOX-BR-7)", () => {
      ensureLoaded();
      expect(isBoxBuildMessage("what can Gengar learn")).toBe(false);
      expect(isBoxBuildMessage("what can Gengar learn?")).toBe(false);
      expect(isBoxBuildMessage("what's Gengar's movepool")).toBe(false);
      expect(isBoxBuildMessage("show Gengar learnset")).toBe(false);
    });

    it("is false for a catch / location / wiki primary ask (BOX-AC-4.2)", () => {
      ensureLoaded();
      expect(isBoxBuildMessage("where do I catch Gengar?")).toBe(false);
      expect(isBoxBuildMessage("where can I catch Gengar")).toBe(false);
      expect(isBoxBuildMessage("Gengar location")).toBe(false);
    });

    it("is false for a location question that happens to mention two names (BOX-AC-4.3)", () => {
      ensureLoaded();
      expect(isBoxBuildMessage("where do I catch Gengar and Alakazam")).toBe(
        false,
      );
    });

    it('is false for "build me a rain team" with no owned list (BOX-AC-4.2, BOX-BR-6)', () => {
      ensureLoaded();
      expect(isBoxBuildMessage("build me a rain team")).toBe(false);
    });

    it("is false for empty / unrelated chat", () => {
      ensureLoaded();
      expect(isBoxBuildMessage("")).toBe(false);
      expect(isBoxBuildMessage("   ")).toBe(false);
      expect(isBoxBuildMessage("hello professor")).toBe(false);
      expect(isBoxBuildMessage("what is Garchomp's speed")).toBe(false);
    });

    it("is false for fewer than 6 Latin names with no party/team verb", () => {
      ensureLoaded();
      expect(isBoxBuildMessage("Gengar, Garchomp, Dragonite")).toBe(false);
      expect(
        isBoxBuildMessage(
          "Gengar, Garchomp, Dragonite, Tyranitar, Scizor",
        ),
      ).toBe(false);
    });
  });
});

describe("extractBoxNames (BOX-BR-3, BOX-AC-2.1)", () => {
  it("returns Latin species-like tokens from a comma list, order preserved", () => {
    ensureLoaded();
    expect(extractBoxNames(SIX_COMMA)).toEqual(SIX_TOKENS);
  });

  it("returns Latin species-like tokens from a newline list, order preserved", () => {
    ensureLoaded();
    expect(extractBoxNames(SIX_NEWLINE)).toEqual(SIX_TOKENS);
  });

  it("dedupes while preserving first-seen order", () => {
    ensureLoaded();
    expect(
      extractBoxNames("Gengar, Garchomp, Gengar, Dragonite, Garchomp"),
    ).toEqual(["Gengar", "Garchomp", "Dragonite"]);
  });

  it("keeps a comma-field form name as one token (Mega Kangaskhan)", () => {
    ensureLoaded();
    expect(
      extractBoxNames(
        "Mega Kangaskhan, Gengar, Garchomp, Dragonite, Tyranitar, Scizor",
      ),
    ).toEqual([
      "Mega Kangaskhan",
      "Gengar",
      "Garchomp",
      "Dragonite",
      "Tyranitar",
      "Scizor",
    ]);
  });

  it("does not treat Korean hangul or English verbs as Latin name tokens", () => {
    ensureLoaded();
    expect(
      extractBoxNames(
        `${SIX_COMMA}, 파티, build a team`,
      ),
    ).toEqual(SIX_TOKENS);
  });

  it("returns [] for empty / unrelated text", () => {
    ensureLoaded();
    expect(extractBoxNames("")).toEqual([]);
    expect(extractBoxNames("hello professor")).toEqual([]);
    expect(extractBoxNames("build me a rain team")).toEqual([]);
  });
});

describe("namedForParty (BOX-BR-2, BOX-BR-4, BOX-AC-1.1, BOX-AC-1.4, BOX-AC-2.3)", () => {
  it("returns every extracted name when extractBoxNames length is ≤ 6 (BOX-AC-1.1)", () => {
    ensureLoaded();
    expect(namedForParty(SIX_COMMA)).toEqual(SIX_TOKENS);
    expect(namedForParty("Gengar, Garchomp, Dragonite")).toEqual([
      "Gengar",
      "Garchomp",
      "Dragonite",
    ]);
  });

  it("includes English keep / don't-drop names (BOX-AC-1.4, BOX-AC-2.3)", () => {
    ensureLoaded();
    expect(namedForParty("don't drop Kangaskhan")).toEqual(
      expect.arrayContaining(["Kangaskhan"]),
    );
    expect(
      namedForParty(`${FIFTEEN_COMMA} don't drop Kangaskhan`),
    ).toEqual(expect.arrayContaining(["Kangaskhan"]));
    expect(
      namedForParty(`${FIFTEEN_COMMA} keep Gengar, Gengar is required`),
    ).toEqual(expect.arrayContaining(["Gengar"]));
  });

  it('includes Korean keep names including “빼지 마” (BOX-AC-1.4, BOX-BR-10)', () => {
    ensureLoaded();
    expect(namedForParty("Kangaskhan 빼지 마")).toEqual(
      expect.arrayContaining(["Kangaskhan"]),
    );
    expect(namedForParty(`${FIFTEEN_COMMA} Kangaskhan 빼지 마`)).toEqual(
      expect.arrayContaining(["Kangaskhan"]),
    );
  });

  it("returns the three Latin names for a Korean+Latin mix of ≤6 (BOX-BR-10, BOX-AC-1.1)", () => {
    ensureLoaded();
    expect(
      namedForParty("Gengar Garchomp Dragonite 파티 만들어"),
    ).toEqual(["Gengar", "Garchomp", "Dragonite"]);
  });

  it("inherits a prior ≤6 box plus the follow-up keep name (BOX-AC-5.1, BOX-BR-11)", () => {
    ensureLoaded();
    const names = namedForParty("don't drop Kangaskhan", [SIX_COMMA]);
    expect(names).toEqual(
      expect.arrayContaining([...SIX_TOKENS, "Kangaskhan"]),
    );
  });
});
