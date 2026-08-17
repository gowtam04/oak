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
    expect(instrumentToken("resolve_entity")).toBe("Dex lookup");
    expect(instrumentToken("get_pokemon")).toBe("Pokémon");
    expect(instrumentToken("get_move")).toBe("Move");
    expect(instrumentToken("run_sql")).toBe("Game data");
    expect(instrumentToken("search_wiki")).toBe("Wiki");
    expect(instrumentToken("get_meta_usage")).toBe("Usage");
    expect(instrumentToken("submit_builder_answer")).toBe("Teams");
    expect(instrumentToken("totally_unknown")).toBe("Lookup");
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
      primary: "Dex lookup",
      secondary: "garchom",
      active: false,
    });
    expect(rows[1]).toEqual({
      tool: "get_pokemon",
      primary: "Pokémon",
      secondary: "Garchomp",
      active: true,
    });
    expect(rows.some((r) => r.tool === "submit_answer")).toBe(false);
  });

  it("never emits a raw tool id", () => {
    const rows = traceRows([
      { tool: "some_future_tool", label: "Doing a thing…" },
    ]);
    expect(rows[0]?.primary).toBe("Lookup");
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
