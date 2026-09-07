import { describe, expect, it } from "vitest";
import {
  instrumentToken,
  stripLeadingEmoji,
  subjectFromLabel,
  thinkingHeader,
  thoughtFor,
  traceRows,
} from "./thinking-trace";

describe("instrumentToken", () => {
  it("matches the cross-platform copy table", () => {
    expect(instrumentToken("resolve_entity")).toBe("Identifying");
    expect(instrumentToken("query_pokedex")).toBe("Searching Pokédex");
    expect(instrumentToken("get_pokemon")).toBe("Looking up Pokémon");
    expect(instrumentToken("get_move")).toBe("Looking up move");
    expect(instrumentToken("get_ability")).toBe("Reading ability");
    expect(instrumentToken("get_item")).toBe("Looking up item");
    expect(instrumentToken("get_type_matchups")).toBe("Checking matchups");
    expect(instrumentToken("type_matchup")).toBe("Checking matchups");
    expect(instrumentToken("get_type_chart")).toBe("Checking matchups");
    expect(instrumentToken("get_evolution_chain")).toBe("Tracing evolution");
    expect(instrumentToken("compute_stat")).toBe("Computing stats");
    expect(instrumentToken("estimate_damage")).toBe("Calculating damage");
    expect(instrumentToken("get_usage_stats")).toBe("Checking live usage");
    expect(instrumentToken("get_learnset")).toBe("Checking learnset");
    expect(instrumentToken("lookup_box")).toBe("Looking up box");
    expect(instrumentToken("get_team")).toBe("Reading team");
    expect(instrumentToken("list_teams")).toBe("Listing teams");
    expect(instrumentToken("save_team")).toBe("Saving team");
    // Removed T14/T18/T19/T21 — generic fallback, no special copy (ADR-2).
    expect(instrumentToken("get_meta_usage")).toBe("Looking up");
    expect(instrumentToken("get_encounters")).toBe("Looking up");
    expect(instrumentToken("run_sql")).toBe("Looking up");
    expect(instrumentToken("search_wiki")).toBe("Looking up");
    expect(instrumentToken("submit_answer")).toBe("Answer");
    expect(instrumentToken("submit_builder_answer")).toBe("Teams");
    expect(instrumentToken("totally_unknown")).toBe("Looking up");
  });
});

describe("stripLeadingEmoji / subjectFromLabel", () => {
  it("strips a leading pictograph from a server label", () => {
    expect(stripLeadingEmoji("📇 Looking up Garchomp…")).toBe(
      "Looking up Garchomp…",
    );
  });

  it("pulls a quoted subject", () => {
    expect(subjectFromLabel("Resolving “garchom”…")).toBe("garchom");
  });

  it("pulls the last capitalised run, not the leading verb", () => {
    expect(subjectFromLabel("Looking up Fake Out")).toBe("Fake Out");
    expect(subjectFromLabel("Looking up the move Will-O-Wisp")).toBe(
      "Will-O-Wisp",
    );
    expect(subjectFromLabel("Resolving name")).toBeNull();
  });
});

describe("traceRows", () => {
  it("maps tools to friendly nouns + subjects, last row active", () => {
    const rows = traceRows([
      { tool: "resolve_entity", label: "🔍 Resolving “garchom”…" },
      { tool: "get_pokemon", label: "📇 Looking up Garchomp…" },
      { tool: "submit_answer", label: "✍️ Composing the answer…" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      tool: "resolve_entity",
      primary: "Identifying",
      secondary: "garchom",
      active: false,
    });
    expect(rows[1]).toEqual({
      tool: "get_pokemon",
      primary: "Looking up Pokémon",
      secondary: "Garchomp",
      active: true,
    });
    expect(rows.some((r) => r.tool === "submit_answer")).toBe(false);
  });

  it("never emits a raw tool id", () => {
    const rows = traceRows([
      { tool: "some_future_tool", label: "Doing a thing…" },
    ]);
    expect(rows[0]?.primary).toBe("Looking up");
    expect(rows[0]?.primary).not.toMatch(/some_future_tool/i);
  });
});

describe("thinkingHeader", () => {
  it("is live Thinking until tokens arrive", () => {
    expect(
      thinkingHeader({ reconnecting: false, settled: false, elapsedSeconds: 3 }),
    ).toEqual({ live: true, text: "Thinking" });
  });

  it("freezes to Thought for N seconds once settled", () => {
    expect(
      thinkingHeader({ reconnecting: false, settled: true, elapsedSeconds: 4 }),
    ).toEqual({ live: false, text: "Thought for 4 seconds" });
    expect(thoughtFor(1)).toBe("Thought for 1 second");
    expect(thoughtFor(0)).toBe("Thought for a moment");
  });

  it("reconnecting wins", () => {
    expect(
      thinkingHeader({ reconnecting: true, settled: false, elapsedSeconds: 2 }),
    ).toEqual({ live: true, text: "Reconnecting" });
  });
});
