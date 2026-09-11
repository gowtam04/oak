/**
 * Real-behavior smoke test for gen-provider.ts — the SINGLE @pkmn integration
 * point (T2, docs/review/oak-implementation-assessment.md).
 *
 * Unlike the build-*.test.ts files (which feed hand-built fakes, or use Dex only
 * for the row builders), this test calls the REAL loadFormat() for BOTH formats
 * and pins the @pkmn quirks that otherwise ship validated only by a live
 * `npm run ingest`, never in CI:
 *   - the standard (Dex.forGen(9)) vs Champions (Dex.mod + FormatsData) legality
 *     gates — a restricted mon legal in one format is gated out of the other,
 *   - Mega resolution as first-class roster species,
 *   - the 18-battle-type / 25-nature / non-CAP filters,
 *   - display-name → legacy-slug slugify (incl. a documented divergence),
 *   - getLearnset's shape + {} fallback.
 *
 * Fully offline — @pkmn ships gen-scope dex data as local npm packages; Champions
 * bytes come from the vendored Showdown pin (no DB, no network, no mocks).
 */

import { beforeAll, describe, expect, it } from "vitest";

import { loadFormat, slugFor, slugify, type FormatSource } from "./gen-provider";

// ---------------------------------------------------------------------------
// slugify / slugFor — pure, no @pkmn needed
// ---------------------------------------------------------------------------

describe("slugify — @pkmn display name → legacy PokeAPI-style slug", () => {
  it("collapses spaces/punctuation to single hyphens and drops periods", () => {
    expect(slugify("Mr. Mime")).toBe("mr-mime");
    expect(slugify("Type: Null")).toBe("type-null");
    expect(slugify("Will-O-Wisp")).toBe("will-o-wisp");
    expect(slugify("Charizard-Mega-X")).toBe("charizard-mega-x");
    expect(slugify("Ho-Oh")).toBe("ho-oh");
    expect(slugify("Nidoran-F")).toBe("nidoran-f");
  });

  it("strips combining diacritics (Flabébé → flabebe)", () => {
    expect(slugify("Flabébé")).toBe("flabebe");
  });

  it("drops a STRAIGHT apostrophe (U+0027)", () => {
    expect(slugify("Farfetch'd")).toBe("farfetchd");
  });

  it("does NOT strip @pkmn's CURLY apostrophe — real name is 'Farfetch’d'", () => {
    // Divergence pinned deliberately (T2): @pkmn's stored .name uses a curly ’
    // (U+2019), which slugify's /['.]/g class (straight ' only) misses. So the
    // REAL slug is "farfetch-d", NOT the "farfetchd" the docstring claims. This
    // documents current behavior; fixing it (a SLUG_OVERRIDES entry or widening
    // the regex) would change stored PKs and is out of scope here.
    expect(slugify("Farfetch’d")).toBe("farfetch-d");
    expect(slugify("Sirfetch’d")).toBe("sirfetch-d");
  });
});

describe("slugFor — overrides map (currently empty) then slugify", () => {
  it("falls through to slugify when no override is registered", () => {
    expect(slugFor("hooh", "Ho-Oh")).toBe("ho-oh");
    expect(slugFor("charizardmegax", "Charizard-Mega-X")).toBe("charizard-mega-x");
  });
});

// ---------------------------------------------------------------------------
// loadFormat — real @pkmn, both formats resolved once
// ---------------------------------------------------------------------------

describe("loadFormat", () => {
  let standard: FormatSource;
  let champions: FormatSource;
  let gen7: FormatSource;
  let natdex: FormatSource;
  let gen1: FormatSource;
  let gen2: FormatSource;
  let gen3: FormatSource;
  let standardIds: Set<string>;
  let championIds: Set<string>;
  let gen7Ids: Set<string>;
  let natdexIds: Set<string>;

  beforeAll(async () => {
    standard = await loadFormat("scarlet-violet");
    // Exercises the Showdown pin + Dex.mod Champions path.
    champions = await loadFormat("champions");
    // Exercises a mainline gen scope (generation-scope feature): Dex.forGen(7).
    gen7 = await loadFormat("gen-7");
    // National Dex scope feature: national-dex + gens 1-2.
    natdex = await loadFormat("national-dex");
    gen1 = await loadFormat("gen-1");
    gen2 = await loadFormat("gen-2");
    gen3 = await loadFormat("gen-3");
    standardIds = new Set(standard.roster.map((s) => s.id));
    championIds = new Set(champions.roster.map((s) => s.id));
    gen7Ids = new Set(gen7.roster.map((s) => s.id));
    natdexIds = new Set(natdex.roster.map((s) => s.id));
  });

  describe("scarlet-violet (standard / Dex.forGen(9))", () => {
    it("stamps the format and resolves the whole national-dex roster", () => {
      expect(standard.format).toBe("scarlet-violet");
      expect(standard.genNumber).toBe(9);
      // Real ≈1416; assert a floor so a @pkmn dex bump doesn't flake the test.
      expect(standard.roster.length).toBeGreaterThan(1000);
    });

    it("keeps exactly the 18 classic battle types (Stellar excluded) and 25 natures", () => {
      expect(standard.types).toHaveLength(18);
      expect(standard.natures).toHaveLength(25);
      expect(standard.types.map((t) => t.name)).not.toContain("Stellar");
    });

    it("filters moves/abilities/items to non-empty, non-CAP sets (abilities drop noability)", () => {
      expect(standard.moves.length).toBeGreaterThan(0);
      expect(standard.items.length).toBeGreaterThan(0);
      expect(standard.abilities.length).toBeGreaterThan(0);
      expect(standard.abilities.some((a) => a.id === "noability")).toBe(false);
    });

    it("includes ordinary and restricted species alike (whole dex, BR-1)", () => {
      for (const id of ["garchomp", "pikachu", "mewtwo", "koraidon"]) {
        expect(standardIds.has(id)).toBe(true);
      }
    });

    it("resolves Mega formes as first-class species (Charizard-Mega-X)", () => {
      const mega = standard.dex.species.get("charizardmegax");
      expect(mega.exists).toBe(true);
      expect(mega.name).toBe("Charizard-Mega-X");
      expect(mega.num).toBe(6);
      expect(mega.forme).toBe("Mega-X");
      expect(standardIds.has("charizardmegax")).toBe(true);
    });

    // Gen 9 marks Legends Z-A megas isNonstandard "Future" (not SV-legal). They
    // must still index so /pokedex shows every mega — same path as classic Past megas.
    it("includes Z-A / Future megas (Raichu-Mega-X/Y, Delphox-Mega) in the roster", () => {
      for (const id of ["raichumegax", "raichumegay", "delphoxmega"]) {
        const sp = standard.dex.species.get(id);
        expect(sp.exists).toBe(true);
        expect(sp.isNonstandard).toBe("Future");
        expect(standardIds.has(id)).toBe(true);
      }
    });

    it("indexes Future mega stones and mega-exclusive abilities on Gen 9", () => {
      const itemIds = new Set(standard.items.map((i) => i.id as string));
      expect(itemIds.has("raichunitex")).toBe(true);
      expect(itemIds.has("raichunitey")).toBe(true);
      const abilityIds = new Set(standard.abilities.map((a) => a.id as string));
      // Mega Sol is Meganium-Mega's ability; Future on Gen 9.
      expect(abilityIds.has("megasol")).toBe(true);
    });
  });

  describe("champions (Dex.mod + FormatsData legality gate)", () => {
    it("stamps the format and resolves a smaller, gated roster", () => {
      expect(champions.format).toBe("champions");
      expect(champions.genNumber).toBe(9); // Champions rides the Gen 9 dex.
      // FormatsData isNonstandard gate (Reg M-C: >320 and <500), NOT species.all() (~1416).
      expect(champions.roster.length).toBeGreaterThan(320);
      expect(champions.roster.length).toBeLessThan(500);
      expect(champions.roster.length).toBeLessThan(standard.roster.length);
    });

    it("gates out restricted mons that standard keeps (current regulation / M-C)", () => {
      for (const id of ["mewtwo", "koraidon", "miraidon"]) {
        expect(standardIds.has(id)).toBe(true); // present in standard
        expect(championIds.has(id)).toBe(false); // gated out of champions
      }
    });

    it("keeps ordinary species and Megas legal", () => {
      for (const id of ["garchomp", "pikachu", "charizardmegax", "venusaurmega"]) {
        expect(championIds.has(id)).toBe(true);
      }
    });

    it("carries Mega formes as distinct roster members", () => {
      const megas = champions.roster.filter((s) => /mega/i.test(s.forme));
      expect(megas.length).toBeGreaterThan(0);
      const venuMega = champions.roster.find((s) => s.name === "Venusaur-Mega");
      expect(venuMega).toBeDefined();
      expect(venuMega?.baseSpecies).toBe("Venusaur");
      expect(venuMega?.forme).toBe("Mega");
    });
  });

  describe("gen-7 (Dex.forGen(7)) — generation-scope mainline gen", () => {
    // Probed against @pkmn 0.10.11 (recorded in gen-provider.ts's header):
    //   roster 1027, no isNonstandard==="Future" species pass, 18 battle types
    //   (Fairy exists from gen 6), raichualola learnset has 102 moves.
    it("stamps the format + genNumber and resolves a plausible gen-7 roster", () => {
      expect(gen7.format).toBe("gen-7");
      expect(gen7.genNumber).toBe(7);
      // Real ≈1027 (base + battle formes); floor guards against a dex bump flake.
      expect(gen7.roster.length).toBeGreaterThan(800);
    });

    it("includes species that exist in gen 7 (incl. gen-1 'Past' natives and Megas)", () => {
      for (const id of ["incineroar", "raichualola", "decidueye", "pikachu", "charizardmegax"]) {
        expect(gen7Ids.has(id)).toBe(true);
      }
    });

    it("EXCLUDES later-generation species (they surface as 'Future' and are dropped)", () => {
      // Absent from the gen-7 roster…
      for (const id of ["grookey", "sprigatito", "koraidon", "raichumegax"]) {
        expect(gen7Ids.has(id)).toBe(false);
      }
      // …because the gen-7 dex marks them isNonstandard === "Future", which
      // isRealSpecies filters out on gen ≤8 (documents the exclusion mechanism).
      const grookey = gen7.dex.species.get("grookey");
      expect(grookey.exists).toBe(true);
      expect(grookey.isNonstandard).toBe("Future");
    });

    it("indexes NO isNonstandard === 'Future' species in the roster", () => {
      expect(gen7.roster.some((s) => s.isNonstandard === "Future")).toBe(false);
    });

    it("builds the battle-type set from the gen-7 dex (≤18; Fairy present from gen 6)", () => {
      expect(gen7.types.length).toBeGreaterThan(0);
      expect(gen7.types.length).toBeLessThanOrEqual(18);
      const typeNames = gen7.types.map((t) => t.name);
      for (const t of ["Fire", "Water", "Fairy"]) {
        expect(typeNames).toContain(t);
      }
      expect(typeNames).not.toContain("Stellar");
    });

    it("returns a non-empty, gen-7-scoped learnset (Alolan Raichu)", async () => {
      const ls = await gen7.getLearnset("raichualola");
      expect(Object.keys(ls).length).toBeGreaterThan(0);
      // A move Alolan Raichu learns; sources carry a gen-7 method string.
      expect(ls.thunderbolt).toBeDefined();
      expect(ls.thunderbolt.some((src) => src.startsWith("7"))).toBe(true);
    });
  });

  describe("national-dex (Dex.forGen(9) reused under a new format name) — National Dex scope", () => {
    // Probed against @pkmn 0.10.11: roster 1367 (base + battle formes), 1025
    // unique National Dex numbers.
    it("stamps the format + genNumber 9 and resolves the whole form-aware roster", () => {
      expect(natdex.format).toBe("national-dex");
      expect(natdex.genNumber).toBe(9);
      const uniqueDexNumbers = new Set(natdex.roster.map((s) => s.num));
      expect(uniqueDexNumbers.size).toBeGreaterThanOrEqual(1025);
    });

    it("includes form-only type combos absent from the default-forms-only natdex_species table", () => {
      for (const id of [
        "rotomheat",
        "weezinggalar",
        "darmanitangalarzen",
        "venusaurmega",
      ]) {
        expect(natdexIds.has(id)).toBe(true);
      }
    });

    it("includes Z-A / Future megas (same Gen-9 roster as scarlet-violet)", () => {
      for (const id of ["raichumegax", "raichumegay", "delphoxmega", "greninjamega"]) {
        expect(natdexIds.has(id)).toBe(true);
      }
    });
  });

  describe("gen-1 (Dex.forGen(1)) — National Dex scope, Gens 1-4 widening", () => {
    it("resolves the real 151-species Gen 1 roster", () => {
      expect(gen1.format).toBe("gen-1");
      expect(gen1.genNumber).toBe(1);
      expect(gen1.roster).toHaveLength(151);
    });

    it("Clefairy is pure Normal-type in Gen 1 (Fairy didn't exist until Gen 6)", () => {
      const clefairy = gen1.dex.species.get("clefairy");
      expect(clefairy.types).toEqual(["Normal"]);
    });
  });

  describe("gen-2 (Dex.forGen(2)) — unified Special stat splits into spa/spd", () => {
    it("Alakazam's Special Defense drops from Gen 1's unified 135 to Gen 2's 85", () => {
      const alakazam1 = gen1.dex.species.get("alakazam");
      const alakazam2 = gen2.dex.species.get("alakazam");
      // Gen 1: unified Special -> spa === spd === 135.
      expect(alakazam1.baseStats.spa).toBe(135);
      expect(alakazam1.baseStats.spd).toBe(135);
      // Gen 2 introduces the real split: spa stays 135, spd drops to 85.
      expect(alakazam2.baseStats.spa).toBe(135);
      expect(alakazam2.baseStats.spd).toBe(85);
    });
  });

  describe("gen-3 (Dex.forGen(3)) — Future-entity filter on moves/abilities/items", () => {
    // Probed against @pkmn 0.10.11 (recorded here as ground truth): in Dex.forGen(3),
    // Absolite/Adamant Orb/Ability Shield (items), Earth Power (a gen-4 move), and
    // Download (a gen-4 ability) all surface as isNonstandard === "Future".
    it("excludes Future items (Absolite, Adamant Orb, Ability Shield) but keeps ordinary gen-3-legal items", () => {
      const itemIds: Set<string> = new Set(gen3.items.map((i) => i.id));
      for (const id of ["absolite", "adamantorb", "abilityshield"]) {
        expect(itemIds.has(id)).toBe(false);
      }
      for (const id of ["leftovers", "choiceband"]) {
        expect(itemIds.has(id)).toBe(true);
      }
    });

    it("excludes a confirmed Future move (Earth Power, introduced gen 4)", () => {
      const moveIds: Set<string> = new Set(gen3.moves.map((m) => m.id));
      expect(moveIds.has("earthpower")).toBe(false);
      expect(moveIds.has("tackle")).toBe(true);
    });

    it("excludes a confirmed Future ability (Download, introduced gen 4)", () => {
      const abilityIds: Set<string> = new Set(gen3.abilities.map((a) => a.id));
      expect(abilityIds.has("download")).toBe(false);
      expect(abilityIds.has("overgrow")).toBe(true);
    });

    it("national-dex still includes Absolite (Past, not Future, on the Gen 9 dex — BR-1)", () => {
      const natdexItemIds: Set<string> = new Set(natdex.items.map((i) => i.id));
      expect(natdexItemIds.has("absolite")).toBe(true);
    });

    it("national-dex also includes Future Z-A mega stones (Gen-9 allowFuture)", () => {
      const natdexItemIds: Set<string> = new Set(natdex.items.map((i) => i.id));
      expect(natdexItemIds.has("raichunitex")).toBe(true);
      expect(natdexItemIds.has("delphoxite")).toBe(true);
    });
  });

  describe("getLearnset", () => {
    it("returns a non-empty learnset with gen-9 sources for a known species", async () => {
      const ls = await standard.getLearnset("garchomp");
      expect(Object.keys(ls).length).toBeGreaterThan(0);
      expect(ls.earthquake).toContain("9M"); // gen-9 machine source
    });

    it("is genuinely scoped under the Champions mod too", async () => {
      const ls = await champions.getLearnset("garchomp");
      expect(Object.keys(ls).length).toBeGreaterThan(0);
    });

    it("returns {} for an unknown species id (never throws, never null)", async () => {
      const ls = await standard.getLearnset("totally-bogus-id");
      expect(ls).toEqual({});
    });
  });
});
