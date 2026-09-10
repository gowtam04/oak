/**
 * Slash-discovery P1 lockstep oracle — composer `/` picker model.
 *
 * iOS `SlashPickerTests` and Android `SlashPickerTest` must clone these
 * cases. Pure catalog/phase/filter/insert/merge/bind — no I/O, no POST.
 *
 * Requirement refs: SD-BR-1, SD-BR-4, SD-BR-5, SD-BR-6, SD-BR-10, SD-BR-17,
 * SD-BR-18, SD-AC-1.2, SD-AC-1.3, SD-AC-1.4, SD-AC-3.1, SD-AC-4.3, SD-AC-7.1.
 *
 *   slashPickerPhase(text):
 *     | { phase: "hidden" }
 *     | { phase: "commands"; prefix: string; rows: CommandRow[] }
 *     | { phase: "args"; command: "dex" | "team" | "usage" | "calc"; query: string }
 *     | { phase: "rest"; command: "new" | "help" }
 *
 * Hidden unless the first non-space char is `/`. Empty / whitespace /
 * mid-sentence (`please /dex`) → hidden (SD-AC-1.4). No space after first
 * token → `commands` with that token as prefix (including `/`); `/` lists
 * all six (SD-AC-1.2). `/DEX` with no space stays command phase (SD-AC-3.1).
 * Unknown first token (`/foo`, `/newish`) → hidden, not an empty command
 * list (SD-AC-1.3) — even though filterCommands("/newish") is [].
 * Space after dex|team|usage|calc → `args` (SD-BR-6, SD-US-10). Space
 * after /new|/help → `rest` (no name rows).
 *
 * filterCommands: commandToken.toLowerCase().startsWith(prefix.toLowerCase()).
 * prefix "/" → all six. "/newish" → [].
 * insertCommand: trailing space iff catalog trailingSpace.
 * insertName("/dex", "Garchomp") === "/dex Garchomp" (single spaces).
 * mergeDexNameRows: Pokémon, then move, then ability, then item; within a
 * kind keep input order; dedupe kind+slug; cap `limit` default 8 (SD-BR-10,
 * SD-BR-17). Pass already-sliced-per-kind arrays; merge still caps.
 * bindStillValid(bind, composerText): parse is dex navigate AND slashArg
 * equals bind.displayName (case-insensitive).
 *
 * DexBind / DexNameRow kinds: "pokemon" | "move" | "ability" | "item".
 */

import { describe, expect, it } from "vitest";

import {
  EMPTY_DEX,
  EMPTY_TEAMS,
  EMPTY_TEAMS_GUEST,
  EMPTY_USAGE,
  PICKER_CAPTION,
  SLASH_COMMANDS,
  bindStillValid,
  filterCommands,
  insertCommand,
  insertName,
  mergeDexNameRows,
  slashPickerPhase,
} from "./slash-picker";

describe("SLASH_COMMANDS catalog", () => {
  it("lists exactly the six handled tokens with architecture hints and flags (SD-AC-1.2)", () => {
    expect(SLASH_COMMANDS).toEqual([
      {
        token: "/new",
        hint: "New empty chat",
        trailingSpace: false,
        arg: "none",
      },
      {
        token: "/team",
        hint: "Open Teams",
        hintGuest: "Open Teams · sign in to save",
        trailingSpace: true,
        arg: "team",
      },
      {
        token: "/dex",
        hint: "Open Dex",
        trailingSpace: true,
        arg: "dex",
      },
      {
        token: "/usage",
        hint: "Open live usage",
        trailingSpace: true,
        arg: "usage",
      },
      {
        token: "/calc",
        hint: "Open calculator",
        trailingSpace: true,
        arg: "calc",
      },
      {
        token: "/help",
        hint: "Show these commands",
        trailingSpace: false,
        arg: "none",
      },
    ]);
    expect(SLASH_COMMANDS.map((row) => row.token)).toEqual([
      "/new",
      "/team",
      "/dex",
      "/usage",
      "/calc",
      "/help",
    ]);
  });
});

describe("picker copy constants", () => {
  it("exports the picker caption and arg-phase empty lines", () => {
    expect(PICKER_CAPTION).toBe("Insert, then send");
    expect(EMPTY_DEX).toBe("No Dex matches");
    expect(EMPTY_USAGE).toBe("No usage matches");
    expect(EMPTY_TEAMS).toBe("No saved teams match");
    expect(EMPTY_TEAMS_GUEST).toBe("Sign in to save teams");
  });
});

describe("filterCommands", () => {
  it("keeps commands whose token starts with the prefix, case-insensitive (SD-AC-1.2, SD-BR-5)", () => {
    expect(filterCommands("/").map((row) => row.token)).toEqual([
      "/new",
      "/team",
      "/dex",
      "/usage",
      "/calc",
      "/help",
    ]);
    expect(filterCommands("/")).toEqual([...SLASH_COMMANDS]);
    expect(filterCommands("/de").map((row) => row.token)).toEqual(["/dex"]);
    expect(filterCommands("/DEX").map((row) => row.token)).toEqual(["/dex"]);
    expect(filterCommands("/n").map((row) => row.token)).toEqual(["/new"]);
    expect(filterCommands("/new").map((row) => row.token)).toEqual(["/new"]);
    expect(filterCommands("/h").map((row) => row.token)).toEqual(["/help"]);
  });

  it("returns no rows for /newish — /new does not start with /newish (SD-AC-1.2, SD-AC-1.3)", () => {
    expect(filterCommands("/newish")).toEqual([]);
    expect(filterCommands("/foo")).toEqual([]);
  });
});

describe("slashPickerPhase", () => {
  it("is hidden when the first non-space char is not / (SD-AC-1.4)", () => {
    expect(slashPickerPhase("")).toEqual({ phase: "hidden" });
    expect(slashPickerPhase("   ")).toEqual({ phase: "hidden" });
    expect(slashPickerPhase("please /dex")).toEqual({ phase: "hidden" });
    expect(slashPickerPhase("what about /team later")).toEqual({
      phase: "hidden",
    });
  });

  it("opens commands for a leading / prefix and lists all six (SD-AC-1.2)", () => {
    expect(slashPickerPhase("/")).toEqual({
      phase: "commands",
      prefix: "/",
      rows: [...SLASH_COMMANDS],
    });
    expect(slashPickerPhase("  /")).toEqual({
      phase: "commands",
      prefix: "/",
      rows: [...SLASH_COMMANDS],
    });
  });

  it("filters command rows by the first token while there is no space (SD-AC-1.2, SD-AC-3.1)", () => {
    expect(slashPickerPhase("/de")).toEqual({
      phase: "commands",
      prefix: "/de",
      rows: SLASH_COMMANDS.filter((row) => row.token === "/dex"),
    });
    expect(slashPickerPhase("/DEX")).toEqual({
      phase: "commands",
      prefix: "/DEX",
      rows: SLASH_COMMANDS.filter((row) => row.token === "/dex"),
    });
    expect(slashPickerPhase("/dex")).toEqual({
      phase: "commands",
      prefix: "/dex",
      rows: SLASH_COMMANDS.filter((row) => row.token === "/dex"),
    });
    expect(slashPickerPhase("/calc")).toEqual({
      phase: "commands",
      prefix: "/calc",
      rows: SLASH_COMMANDS.filter((row) => row.token === "/calc"),
    });
    expect(slashPickerPhase("/new")).toEqual({
      phase: "commands",
      prefix: "/new",
      rows: SLASH_COMMANDS.filter((row) => row.token === "/new"),
    });
    expect(slashPickerPhase("/help")).toEqual({
      phase: "commands",
      prefix: "/help",
      rows: SLASH_COMMANDS.filter((row) => row.token === "/help"),
    });
  });

  it("hides for an unknown first token, not an empty command list (SD-AC-1.3)", () => {
    expect(slashPickerPhase("/newish")).toEqual({ phase: "hidden" });
    expect(slashPickerPhase("/foo")).toEqual({ phase: "hidden" });
    expect(filterCommands("/newish")).toEqual([]);
  });

  it("enters args after a space on /dex /team /usage /calc (SD-BR-6, SD-US-10)", () => {
    expect(slashPickerPhase("/dex ")).toEqual({
      phase: "args",
      command: "dex",
      query: "",
    });
    expect(slashPickerPhase("/dex gar")).toEqual({
      phase: "args",
      command: "dex",
      query: "gar",
    });
    expect(slashPickerPhase("  /dex gar")).toEqual({
      phase: "args",
      command: "dex",
      query: "gar",
    });
    expect(slashPickerPhase("/DEX Garchomp")).toEqual({
      phase: "args",
      command: "dex",
      query: "Garchomp",
    });
    expect(slashPickerPhase("/team ")).toEqual({
      phase: "args",
      command: "team",
      query: "",
    });
    expect(slashPickerPhase("/team Rain Offense")).toEqual({
      phase: "args",
      command: "team",
      query: "Rain Offense",
    });
    expect(slashPickerPhase("/usage ")).toEqual({
      phase: "args",
      command: "usage",
      query: "",
    });
    expect(slashPickerPhase("/usage garchomp")).toEqual({
      phase: "args",
      command: "usage",
      query: "garchomp",
    });
    expect(slashPickerPhase("/calc ")).toEqual({
      phase: "args",
      command: "calc",
      query: "",
    });
    expect(slashPickerPhase("/calc foo vs bar")).toEqual({
      phase: "args",
      command: "calc",
      query: "foo vs bar",
    });
    expect(slashPickerPhase("/CALC Garchomp Earthquake vs Gholdengo")).toEqual({
      phase: "args",
      command: "calc",
      query: "Garchomp Earthquake vs Gholdengo",
    });
  });

  it("enters rest after a space on /new /help — no name rows (SD-BR-6)", () => {
    expect(slashPickerPhase("/new ")).toEqual({
      phase: "rest",
      command: "new",
    });
    expect(slashPickerPhase("/new rain team")).toEqual({
      phase: "rest",
      command: "new",
    });
    expect(slashPickerPhase("/help ")).toEqual({
      phase: "rest",
      command: "help",
    });
    expect(slashPickerPhase("/help extra words")).toEqual({
      phase: "rest",
      command: "help",
    });
    expect(slashPickerPhase("/calc foo")).not.toHaveProperty("rows");
  });
});

describe("insertCommand", () => {
  it("appends a trailing space iff the catalog trailingSpace flag is true (SD-AC-2.1, SD-AC-2.2)", () => {
    expect(insertCommand("/dex")).toBe("/dex ");
    expect(insertCommand("/team")).toBe("/team ");
    expect(insertCommand("/usage")).toBe("/usage ");
    expect(insertCommand("/calc")).toBe("/calc ");
    expect(insertCommand("/new")).toBe("/new");
    expect(insertCommand("/help")).toBe("/help");
  });
});

describe("insertName", () => {
  it("joins command and display name with a single space and no required trailing space (SD-AC-2.3)", () => {
    expect(insertName("/dex", "Garchomp")).toBe("/dex Garchomp");
    expect(insertName("/usage", "Garchomp")).toBe("/usage Garchomp");
    expect(insertName("/team", "Rain Offense")).toBe("/team Rain Offense");
  });
});

describe("mergeDexNameRows", () => {
  it("orders Pokémon, then move, then ability, then item; keeps within-kind input order (SD-BR-17)", () => {
    const item = {
      kind: "item" as const,
      slug: "metronome",
      displayName: "Metronome",
    };
    const ability = {
      kind: "ability" as const,
      slug: "rough-skin",
      displayName: "Rough Skin",
    };
    const move = {
      kind: "move" as const,
      slug: "earthquake",
      displayName: "Earthquake",
    };
    const zamazenta = {
      kind: "pokemon" as const,
      slug: "zamazenta",
      displayName: "Zamazenta",
    };
    const garchomp = {
      kind: "pokemon" as const,
      slug: "garchomp",
      displayName: "Garchomp",
      spriteUrl: "https://example.com/garchomp.png",
    };

    expect(
      mergeDexNameRows([
        { kind: "item", matches: [item] },
        { kind: "ability", matches: [ability] },
        { kind: "move", matches: [move] },
        { kind: "pokemon", matches: [zamazenta, garchomp] },
      ]),
    ).toEqual([zamazenta, garchomp, move, ability, item]);
  });

  it("dedupes by kind+slug, keeping the first occurrence", () => {
    const first = {
      kind: "pokemon" as const,
      slug: "garchomp",
      displayName: "Garchomp",
    };
    const duplicate = {
      kind: "pokemon" as const,
      slug: "garchomp",
      displayName: "GARCHOMP",
    };
    const metronomeMove = {
      kind: "move" as const,
      slug: "metronome",
      displayName: "Metronome",
    };
    const metronomeItem = {
      kind: "item" as const,
      slug: "metronome",
      displayName: "Metronome",
    };

    expect(
      mergeDexNameRows([
        { kind: "pokemon", matches: [first, duplicate] },
        { kind: "move", matches: [metronomeMove] },
        { kind: "item", matches: [metronomeItem] },
      ]),
    ).toEqual([first, metronomeMove, metronomeItem]);
  });

  it("caps at limit default 8, preserving merge order (SD-BR-10)", () => {
    const pokemon = Array.from({ length: 9 }, (_, i) => ({
      kind: "pokemon" as const,
      slug: `p${i}`,
      displayName: `P${i}`,
    }));

    const capped = mergeDexNameRows([{ kind: "pokemon", matches: pokemon }]);
    expect(capped).toHaveLength(8);
    expect(capped.map((row) => row.slug)).toEqual([
      "p0",
      "p1",
      "p2",
      "p3",
      "p4",
      "p5",
      "p6",
      "p7",
    ]);
  });

  it("still caps after already-sliced-per-kind arrays (SD-BR-10)", () => {
    const sliced = (kind: "pokemon" | "move" | "ability" | "item") =>
      Array.from({ length: 8 }, (_, i) => ({
        kind,
        slug: `${kind}-${i}`,
        displayName: `${kind} ${i}`,
      }));

    const merged = mergeDexNameRows([
      { kind: "pokemon", matches: sliced("pokemon") },
      { kind: "move", matches: sliced("move") },
      { kind: "ability", matches: sliced("ability") },
      { kind: "item", matches: sliced("item") },
    ]);

    expect(merged).toHaveLength(8);
    expect(merged.every((row) => row.kind === "pokemon")).toBe(true);
    expect(merged.map((row) => row.slug)).toEqual([
      "pokemon-0",
      "pokemon-1",
      "pokemon-2",
      "pokemon-3",
      "pokemon-4",
      "pokemon-5",
      "pokemon-6",
      "pokemon-7",
    ]);
  });
});

describe("bindStillValid", () => {
  const garchomp = {
    kind: "pokemon" as const,
    slug: "garchomp",
    displayName: "Garchomp",
  };
  const metronomeMove = {
    kind: "move" as const,
    slug: "metronome",
    displayName: "Metronome",
  };

  it("is true when parse is dex navigate and slashArg equals displayName (SD-BR-17)", () => {
    expect(bindStillValid(garchomp, "/dex Garchomp")).toBe(true);
    expect(bindStillValid(garchomp, "/DEX garchomp")).toBe(true);
    expect(bindStillValid(garchomp, "  /dex GARCHOMP")).toBe(true);
    expect(bindStillValid(metronomeMove, "/dex Metronome")).toBe(true);
  });

  it("is false when the name is edited, the composer is not dex, or the command changes (SD-BR-17)", () => {
    expect(bindStillValid(garchomp, "/dex Garchom")).toBe(false);
    expect(bindStillValid(garchomp, "/dex GarchompX")).toBe(false);
    expect(bindStillValid(garchomp, "/dex")).toBe(false);
    expect(bindStillValid(garchomp, "/team Garchomp")).toBe(false);
    expect(bindStillValid(garchomp, "/usage Garchomp")).toBe(false);
    expect(bindStillValid(garchomp, "/calc Garchomp")).toBe(false);
    expect(bindStillValid(garchomp, "/new")).toBe(false);
    expect(bindStillValid(garchomp, "/dexish Garchomp")).toBe(false);
    expect(bindStillValid(garchomp, "please /dex Garchomp")).toBe(false);
  });
});
