import { describe, expect, it } from "vitest";
import { orbStateForActivity } from "./orb-state";

describe("orbStateForActivity", () => {
  it("maps reconnecting to connecting", () => {
    expect(
      orbStateForActivity({ reconnecting: true, latestTool: "get_pokemon" }),
    ).toBe("connecting");
  });

  it("maps no tool to breathing", () => {
    expect(
      orbStateForActivity({ reconnecting: false, latestTool: null }),
    ).toBe("breathing");
  });

  it("maps lookups to searching", () => {
    expect(
      orbStateForActivity({ reconnecting: false, latestTool: "get_pokemon" }),
    ).toBe("searching");
    expect(
      orbStateForActivity({ reconnecting: false, latestTool: "search_wiki" }),
    ).toBe("searching");
    expect(
      orbStateForActivity({ reconnecting: false, latestTool: "lookup_box" }),
    ).toBe("searching");
    expect(
      orbStateForActivity({ reconnecting: false, latestTool: "resolve_entity" }),
    ).toBe("searching");
  });

  it("maps math and aggregation to solving", () => {
    expect(
      orbStateForActivity({ reconnecting: false, latestTool: "compute_stat" }),
    ).toBe("solving");
    expect(
      orbStateForActivity({ reconnecting: false, latestTool: "run_sql" }),
    ).toBe("solving");
    expect(
      orbStateForActivity({ reconnecting: false, latestTool: "estimate_damage" }),
    ).toBe("solving");
  });

  it("maps writing (tokens streaming) to composing", () => {
    expect(
      orbStateForActivity({
        reconnecting: false,
        latestTool: "get_pokemon",
        writing: true,
      }),
    ).toBe("composing");
  });

  it("keeps reconnecting above writing", () => {
    expect(
      orbStateForActivity({
        reconnecting: true,
        latestTool: "get_pokemon",
        writing: true,
      }),
    ).toBe("connecting");
  });

  it("maps hidden / unknown tools to breathing", () => {
    expect(
      orbStateForActivity({ reconnecting: false, latestTool: "submit_answer" }),
    ).toBe("breathing");
    expect(
      orbStateForActivity({ reconnecting: false, latestTool: "totally_unknown" }),
    ).toBe("breathing");
  });
});
