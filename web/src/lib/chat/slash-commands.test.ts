/**
 * Slash-discovery P1 lockstep oracle — leading-token slash parse on send.
 *
 * iOS `SlashCommandsTests` and Android `SlashCommandsTest` must clone these
 * cases. The parser only classifies; it does not POST `/api/chat`.
 *
 * Requirement refs: SD-BR-1, SD-BR-4, SD-AC-4.3, SD-AC-7.1; also Chat QoL
 * SLASH-AC-1.1..1.6, SLASH-BR-1, SLASH-BR-2, CALC-US-3, CALC-AC-3.1–3.4,
 * CALC-BR-4. Chat QoL ADR-10; slash-discovery ADR-1 (client classifier).
 *
 *   parseSlashCommand(text, { hasUsagePage: boolean }):
 *     | { type: "navigate"; target: "new" | "team" | "dex" | "usage" }
 *     | { type: "calc"; rest: string }
 *     | { type: "help" }
 *     | { type: "bare" }
 *     | { type: "message" }
 *
 *   slashArg(text): remainder after the first token, trimmed; "" if none.
 *
 * Known leading tokens (case-insensitive exact match): `/new`, `/team`,
 * `/dex`, `/calc`, `/help`, and `/usage` only when `hasUsagePage === true`.
 * First whitespace-delimited token wins. Extra words stay off the
 * navigate/help result (clients read them via slashArg). `/calc` rest is the
 * substring after the token, trimmed (empty rest is ok). After trim, text
 * `=== "/"` is `bare` (SD-AC-7.1) — not a message. `/compare` stays an
 * ordinary message (CMP-BR-3). Unknown slashes (`/foo`, `/newish`) — and
 * `/usage` when the client has no usage page — are ordinary messages.
 * Production clients pass hasUsagePage true; WEB/NATIVE fixtures keep the gate.
 */

import { describe, expect, it } from "vitest";

import { parseSlashCommand, slashArg } from "./slash-commands";

const WEB = { hasUsagePage: true } as const;
const NATIVE = { hasUsagePage: false } as const;

describe("parseSlashCommand", () => {
  it("navigates /new to a new empty chat (SLASH-AC-1.1)", () => {
    expect(parseSlashCommand("/new", WEB)).toEqual({
      type: "navigate",
      target: "new",
    });
  });

  it("treats /new with args as navigate new (SLASH-AC-1.1, leading token)", () => {
    expect(parseSlashCommand("/new rain team", WEB)).toEqual({
      type: "navigate",
      target: "new",
    });
  });

  it("navigates /team and /team {name} (SLASH-AC-1.2)", () => {
    expect(parseSlashCommand("/team", WEB)).toEqual({
      type: "navigate",
      target: "team",
    });
    expect(parseSlashCommand("/team Rain Offense", WEB)).toEqual({
      type: "navigate",
      target: "team",
    });
  });

  it("navigates /dex and /dex {name} (SLASH-AC-1.3)", () => {
    expect(parseSlashCommand("/dex", WEB)).toEqual({
      type: "navigate",
      target: "dex",
    });
    expect(parseSlashCommand("/dex garchomp", WEB)).toEqual({
      type: "navigate",
      target: "dex",
    });
  });

  it("navigates /usage only when the client has a usage page (SLASH-AC-1.4)", () => {
    expect(parseSlashCommand("/usage", WEB)).toEqual({
      type: "navigate",
      target: "usage",
    });
    expect(parseSlashCommand("/usage ou", WEB)).toEqual({
      type: "navigate",
      target: "usage",
    });
  });

  it("treats /usage as a normal message when hasUsagePage is false (SLASH-AC-1.4 / SLASH-AC-1.5)", () => {
    expect(parseSlashCommand("/usage", NATIVE)).toEqual({ type: "message" });
    expect(parseSlashCommand("/usage ou", NATIVE)).toEqual({ type: "message" });
    expect(parseSlashCommand("/USAGE", NATIVE)).toEqual({ type: "message" });
  });

  it("handles /calc as a calc command, not a message (CALC-AC-3.1, CALC-AC-3.4, CALC-BR-4, ADR-4)", () => {
    expect(parseSlashCommand("/calc", WEB)).toEqual({ type: "calc", rest: "" });
    expect(parseSlashCommand("/calc", NATIVE)).toEqual({ type: "calc", rest: "" });
    expect(parseSlashCommand("  /calc", WEB)).toEqual({ type: "calc", rest: "" });
    expect(parseSlashCommand("/calc   ", WEB)).toEqual({ type: "calc", rest: "" });
  });

  it("captures /calc rest after the token, trimmed (CALC-AC-3.2, CALC-AC-3.3)", () => {
    expect(parseSlashCommand("/calc foo vs bar", WEB)).toEqual({
      type: "calc",
      rest: "foo vs bar",
    });
    expect(
      parseSlashCommand("/calc garchomp earthquake vs gholdengo", WEB),
    ).toEqual({
      type: "calc",
      rest: "garchomp earthquake vs gholdengo",
    });
    expect(parseSlashCommand("\t/calc   foo vs bar", NATIVE)).toEqual({
      type: "calc",
      rest: "foo vs bar",
    });
  });

  it("does not treat /calcish or a mid-sentence /calc as handled (CALC-AC-3.4)", () => {
    expect(parseSlashCommand("/calcish", WEB)).toEqual({ type: "message" });
    expect(parseSlashCommand("please /calc", WEB)).toEqual({ type: "message" });
    expect(parseSlashCommand("open /calc garchomp", WEB)).toEqual({
      type: "message",
    });
  });

  it("treats /compare as a message — no standalone Compare (CMP-BR-3, ADR-4)", () => {
    expect(parseSlashCommand("/compare", WEB)).toEqual({ type: "message" });
    expect(parseSlashCommand("/compare garchomp dragonite", WEB)).toEqual({
      type: "message",
    });
  });

  it("classifies /help as help; extra words are ignored (SD-AC-4.3, SD-BR-18)", () => {
    expect(parseSlashCommand("/help", WEB)).toEqual({ type: "help" });
    expect(parseSlashCommand("/help", NATIVE)).toEqual({ type: "help" });
    expect(parseSlashCommand("/help extra words", WEB)).toEqual({ type: "help" });
    expect(parseSlashCommand("  /help extra  ", WEB)).toEqual({ type: "help" });
  });

  it("classifies a composer that trims to exactly / as bare (SD-AC-7.1)", () => {
    expect(parseSlashCommand("/", WEB)).toEqual({ type: "bare" });
    expect(parseSlashCommand("/", NATIVE)).toEqual({ type: "bare" });
    expect(parseSlashCommand(" / ", WEB)).toEqual({ type: "bare" });
    expect(parseSlashCommand("  /  ", WEB)).toEqual({ type: "bare" });
    expect(parseSlashCommand("\t/\t", WEB)).toEqual({ type: "bare" });
  });

  it("matches command tokens case-insensitively (SD-BR-4)", () => {
    expect(parseSlashCommand("/DEX", WEB)).toEqual({
      type: "navigate",
      target: "dex",
    });
    expect(parseSlashCommand("/Dex", WEB)).toEqual({
      type: "navigate",
      target: "dex",
    });
    expect(parseSlashCommand("/HELP", WEB)).toEqual({ type: "help" });
    expect(parseSlashCommand("/USAGE", WEB)).toEqual({
      type: "navigate",
      target: "usage",
    });
    expect(parseSlashCommand("/NEW", WEB)).toEqual({
      type: "navigate",
      target: "new",
    });
    expect(parseSlashCommand("/TEAM Rain", WEB)).toEqual({
      type: "navigate",
      target: "team",
    });
    expect(parseSlashCommand("/CALC foo vs bar", WEB)).toEqual({
      type: "calc",
      rest: "foo vs bar",
    });
  });

  it("treats /newish as a message — token is not exactly /new (SD-BR-1)", () => {
    expect(parseSlashCommand("/newish", WEB)).toEqual({ type: "message" });
    expect(parseSlashCommand("/NEWISH", WEB)).toEqual({ type: "message" });
  });

  it("treats unknown slashes as messages (SLASH-AC-1.5 / SLASH-BR-1 / SD-BR-1)", () => {
    expect(parseSlashCommand("/foo", WEB)).toEqual({ type: "message" });
    expect(parseSlashCommand("/teams", WEB)).toEqual({ type: "message" });
    expect(parseSlashCommand("/newish", WEB)).toEqual({ type: "message" });
  });

  it("treats a mid-sentence slash as a normal message (SLASH-AC-1.6)", () => {
    expect(parseSlashCommand("please open /new", WEB)).toEqual({
      type: "message",
    });
    expect(parseSlashCommand("what about /team later", WEB)).toEqual({
      type: "message",
    });
    expect(parseSlashCommand("see /dex garchomp", WEB)).toEqual({
      type: "message",
    });
    expect(parseSlashCommand("check /usage", WEB)).toEqual({ type: "message" });
  });

  it("treats text without a leading slash as a message (SLASH-AC-1.6 / SLASH-BR-1)", () => {
    expect(parseSlashCommand("new", WEB)).toEqual({ type: "message" });
    expect(parseSlashCommand("team Rain Offense", WEB)).toEqual({
      type: "message",
    });
    expect(parseSlashCommand("", WEB)).toEqual({ type: "message" });
    expect(parseSlashCommand("   ", WEB)).toEqual({ type: "message" });
  });

  it("uses the first whitespace-delimited token, including after leading space (ADR-10, SD-BR-1)", () => {
    expect(parseSlashCommand("  /new", WEB)).toEqual({
      type: "navigate",
      target: "new",
    });
    expect(parseSlashCommand("\t/dex garchomp", WEB)).toEqual({
      type: "navigate",
      target: "dex",
    });
    expect(parseSlashCommand("/new\tmore", WEB)).toEqual({
      type: "navigate",
      target: "new",
    });
  });

  it("classifies only — a handled slash is not a chat turn (SLASH-BR-2, CALC-BR-4, SD-AC-4.3, SD-AC-7.1)", () => {
    const nav = parseSlashCommand("/new", WEB);
    expect(nav).toEqual({ type: "navigate", target: "new" });
    expect(nav).not.toHaveProperty("post");
    expect(nav).not.toHaveProperty("message");

    const calc = parseSlashCommand("/calc foo vs bar", WEB);
    expect(calc).toEqual({ type: "calc", rest: "foo vs bar" });
    expect(calc).not.toHaveProperty("post");
    expect(calc).not.toEqual({ type: "message" });

    const help = parseSlashCommand("/help extra words", WEB);
    expect(help).toEqual({ type: "help" });
    expect(help).not.toHaveProperty("post");
    expect(help).not.toHaveProperty("message");

    const bare = parseSlashCommand("/", WEB);
    expect(bare).toEqual({ type: "bare" });
    expect(bare).not.toHaveProperty("post");
    expect(bare).not.toHaveProperty("message");
  });
});

describe("slashArg", () => {
  it("returns the trimmed remainder after the first token (SD-BR-1)", () => {
    expect(slashArg("/dex Garchomp")).toBe("Garchomp");
    expect(slashArg("/dex")).toBe("");
    expect(slashArg("  /help extra ")).toBe("extra");
    expect(slashArg("/calc foo vs bar")).toBe("foo vs bar");
    expect(slashArg("/new rain team")).toBe("rain team");
    expect(slashArg("\t/dex garchomp")).toBe("garchomp");
    expect(slashArg("/")).toBe("");
    expect(slashArg("")).toBe("");
  });
});
