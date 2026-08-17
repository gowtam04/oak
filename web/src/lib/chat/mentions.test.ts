import { describe, expect, it } from "vitest";

import { parseMentions } from "./mentions";

const TEAMS = [
  { id: "team-rain", name: "Rain Offense" },
  { id: "team-sun", name: "Sun" },
];

describe("parseMentions (MEN-AC-1.3)", () => {
  it("binds saved-team names and collects their ids", () => {
    const parsed = parseMentions("rate @Rain Offense vs sun", TEAMS);
    expect(parsed.ids).toEqual(["team-rain"]);
    expect(parsed.dead).toEqual([]);
  });

  it("flags an unbound @token as dead", () => {
    const parsed = parseMentions("what about @GhostCore", TEAMS);
    expect(parsed.ids).toEqual([]);
    expect(parsed.dead).toEqual(["GhostCore"]);
  });

  it("does not treat user@host as a mention", () => {
    const parsed = parseMentions("email ash@pallet.town", TEAMS);
    expect(parsed.ids).toEqual([]);
    expect(parsed.dead).toEqual([]);
  });
});
