/**
 * Table-driven tests for the deterministic scope detector + label helper
 * (generation-scope GS-B / §3.1, GS-C / §4.3).
 *
 * These modules are pure/client-safe (only `@/data/formats`, a pure module), so
 * this suite needs no DB, no @pkmn, and no `server-only` mock. It pins:
 *   - every lexicon row (Champions, National Dex, Gens 1–9 — all first-class),
 *   - every mandatory precision guard (region-form adjectives, ambiguous single
 *     words that fire only as pairs, "mega", bare "let's go"),
 *   - first-match precedence (Champions first; National Dex beats an incidental
 *     gen mention; a qualified remake beats the bare game pair),
 *   - the `matched` phrase reporting,
 *   - the short scope labels.
 */

import { describe, expect, it } from "vitest";

import { detectScopeSignal } from "./detect-scope";
import { scopeLabel } from "./scope-label";
import { CHAMPIONS_REGULATION, type Format } from "@/data/formats";

describe("detectScopeSignal — supported scopes", () => {
  const CASES: Array<[string, Format]> = [
    // Champions (ordered FIRST — beats a co-occurring Tera / other signal)
    ["is tera blast good on my champions team", "champions"],
    ["how does the Champions format work", "champions"],
    ["team for reg m-b", "champions"],
    ["give me a Regulation H core", "champions"],
    // National Dex (whole-dex intent — after Champions, before any gen signal)
    ["check the national dex", "national-dex"],
    ["how many pokémon are in the national pokedex", "national-dex"],
    ["list all pokemon that learn levitate", "national-dex"],
    ["every pokemon with a signature move", "national-dex"],
    ["which type combinations exist across the whole dex", "national-dex"],
    // National Dex deliberately BEATS an incidental gen mention (the incident)
    ["all pokemon introduced up to gen 3", "national-dex"],
    // Precedence guards: Champions rules (section 1) fire before the newer
    // Gen 9 signals (koraidon/vgc live in section 3a).
    ["is koraidon legal in champions", "champions"],
    ["vgc reg h team", "champions"], // reg-letter rule wins — documents the existing tradeoff
    // Gen 9 / Scarlet-Violet
    ["best team in scarlet and violet", "scarlet-violet"],
    ["my Violet playthrough", "scarlet-violet"],
    ["gen 9 ou", "scarlet-violet"],
    ["generation 9 analysis", "scarlet-violet"],
    ["climbing the sv ladder", "scarlet-violet"],
    ["exploring the paldea region", "scarlet-violet"],
    ["is tera blast good", "scarlet-violet"],
    ["should i terastallize my dragonite", "scarlet-violet"],
    ["can koraidon ohko incineroar", "scarlet-violet"],
    ["miraidon speed tier", "scarlet-violet"],
    ["terapagos stellar form", "scarlet-violet"],
    ["what's in area zero", "scarlet-violet"],
    ["my vgc team", "scarlet-violet"],
    ["how does it work in the mainline games", "scarlet-violet"],
    // Gen 8 / Sword-Shield (+ BDSP, Legends: Arceus)
    ["gen 8 vgc", "gen-8"],
    ["sword and shield team", "gen-8"],
    ["swsh doubles ladder", "gen-8"],
    ["best galar starters", "gen-8"],
    ["who's a good dynamax attacker", "gen-8"],
    ["gigantamax charizard", "gen-8"],
    ["bdsp elite four", "gen-8"],
    ["brilliant diamond team", "gen-8"],
    ["shining pearl gym leaders", "gen-8"],
    ["movesets in legends: arceus", "gen-8"],
    // Gen 7 / Sun-Moon-USUM (+ Alola, Z-Moves, Let's Go)
    ["gen 7 team", "gen-7"],
    ["sun and moon meta", "gen-7"],
    ["usum battle tree", "gen-7"],
    ["ultra sun postgame", "gen-7"],
    ["best alola forms", "gen-7"],
    ["top z-move users", "gen-7"],
    ["lgpe team building", "gen-7"],
    // Gen 6 / XY-ORAS (+ Kalos)
    ["gen 6 ou", "gen-6"],
    ["kalos dex", "gen-6"],
    ["oras team", "gen-6"],
    ["omega ruby run", "gen-6"],
    ["x and y starters", "gen-6"],
    ["the xy meta", "gen-6"],
    // Gen 5 / Black-White (+ Unova)
    ["gen 5 team", "gen-5"],
    ["unova rain team", "gen-5"],
    ["black and white team", "gen-5"],
    ["b2w2 teams", "gen-5"],
    ["bw2 ladder", "gen-5"],
    // Gen 4 / Diamond-Pearl-Platinum (+ Sinnoh, HGSS)
    ["gen 4 team", "gen-4"],
    ["exploring sinnoh", "gen-4"],
    ["platinum battle frontier", "gen-4"],
    ["heart gold nuzlocke", "gen-4"],
    ["soul silver team", "gen-4"],
    ["diamond and pearl starters", "gen-4"],
    // Gen 3 / Ruby-Sapphire-Emerald (+ Hoenn, FRLG)
    ["analyze my gen 3 team", "gen-3"],
    ["hoenn team", "gen-3"],
    ["firered playthrough", "gen-3"],
    ["leaf green run", "gen-3"],
    ["emerald battle frontier", "gen-3"],
    ["ruby and sapphire", "gen-3"],
    // Gen 2 / Gold-Silver-Crystal (+ Johto)
    ["johto gym leaders", "gen-2"],
    ["pokemon crystal team", "gen-2"],
    ["gold and silver", "gen-2"],
    // Gen 1 / Red-Blue-Yellow (+ Kanto, RBY)
    ["gen 1 rby cup", "gen-1"],
    ["kanto starters", "gen-1"],
    ["red and blue", "gen-1"],
    ["yellow version team", "gen-1"],
    // Remake precedence: a qualified remake name beats the bare game pair.
    ["brilliant diamond team", "gen-8"], // BDSP → gen-8, NOT the diamond&pearl pair
    ["omega ruby run", "gen-6"], // ORAS → gen-6, NOT the ruby&sapphire pair
    ["heart gold and soul silver", "gen-4"], // HGSS → gen-4, NOT the gold&silver pair
    // Case-insensitivity
    ["GEN 7 TEAM", "gen-7"],
    // Mixed: a region-form adjective plus a real signal → the real signal wins
    ["my alolan raichu in scarlet", "scarlet-violet"],
    ["using a galarian ponyta in gen 8", "gen-8"],
    ["alolan vulpix in sun and moon", "gen-7"],
  ];

  it.each(CASES)("%j → %s", (message, expected) => {
    expect(detectScopeSignal(message)).toMatchObject({ kind: "scope", format: expected });
  });
});

describe("detectScopeSignal — mandatory precision guards return null", () => {
  const NULL_CASES: string[] = [
    // Region-form adjectives are NOT scope signals
    "my alolan raichu build",
    "galarian slowking moveset",
    "hisuian zoroark",
    "best paldean tauros set",
    // "mega" is never a signal (Megas live in Champions + gens 6–7)
    "should i use mega charizard",
    // Ambiguous single English words need their pair / an unambiguous token
    "does sun boost fire moves", // "sun" without "moon"
    "shield your sweeper", // "shield" without "sword"
    "is swords dance good on garchomp", // "swords" ≠ \bsword\b
    // Ambiguous Gen 1–4 game words fire ONLY as their pair — a lone common word
    // must NOT trip a scope switch.
    "the gold badge", // "gold" without "silver"
    "a pearl necklace", // "pearl" without "diamond"
    "a red herring", // "red" without "blue"
    "a diamond ring", // "diamond" without "pearl"
    "sapphire gemstone", // "sapphire" without "ruby"
    // Bare "let's go" is a casual phrase, not a Gen 7 signal
    "let's go build a great team",
    // No signal at all → stickiness should win
    "what's a good defensive core",
  ];

  it.each(NULL_CASES)("%j → null", (message) => {
    expect(detectScopeSignal(message)).toBeNull();
  });
});

describe("detectScopeSignal — reported matched phrase", () => {
  it("reports the exact champions token", () => {
    expect(detectScopeSignal("champions doubles")).toEqual({
      kind: "scope",
      format: "champions",
      matched: "champions",
    });
  });

  it("reports the matched gen-number phrase", () => {
    const d = detectScopeSignal("analyze my gen 7 team");
    expect(d).not.toBeNull();
    expect(d?.matched).toMatch(/gen\s*7/i);
  });

  it("reports a fixed phrase for pair-required signals", () => {
    expect(detectScopeSignal("sun and moon")).toMatchObject({
      kind: "scope",
      format: "gen-7",
      matched: "sun & moon",
    });
  });
});

describe("scopeLabel", () => {
  const CASES: Array<[Format, string]> = [
    ["national-dex", "National Dex · All Gens"],
    ["scarlet-violet", "Gen 9 · Scarlet/Violet"],
    ["gen-8", "Gen 8 · Sword/Shield"],
    ["gen-7", "Gen 7 · USUM"],
    ["gen-6", "Gen 6 · XY/ORAS"],
    ["gen-5", "Gen 5 · Black/White"],
    ["gen-4", "Gen 4 · Diamond/Pearl"],
    ["gen-3", "Gen 3 · Ruby/Sapphire"],
    ["gen-2", "Gen 2 · Gold/Silver"],
    ["gen-1", "Gen 1 · Red/Blue"],
  ];

  it.each(CASES)("%s → %s", (format, expected) => {
    expect(scopeLabel(format)).toBe(expected);
  });

  it("shortens the Champions regulation and never leaks the full word", () => {
    const label = scopeLabel("champions");
    expect(label.startsWith("Champions · Reg ")).toBe(true);
    expect(label).not.toContain("Regulation");
    // Whatever the current regulation, the short form appears verbatim.
    expect(label).toContain(CHAMPIONS_REGULATION.replace(/^Regulation\b/, "Reg"));
  });
});
