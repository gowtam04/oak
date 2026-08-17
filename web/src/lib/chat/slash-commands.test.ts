/**
 * Phase 7 lockstep oracle — leading-token slash parse on send.
 *
 * iOS `SlashCommandsTests` and Android `SlashCommandsTest` must clone these
 * cases. The parser only classifies; it does not POST `/api/chat`.
 *
 * Requirement refs: SLASH-US-1, SLASH-AC-1.1..1.6, SLASH-BR-1, SLASH-BR-2.
 * ADR-10.
 *
 *   parseSlashCommand(text, { hasUsagePage: boolean }):
 *     | { type: "navigate"; target: "new" | "team" | "dex" | "usage" }
 *     | { type: "message" }
 *
 * Known leading tokens: `/new`, `/team`, `/dex`, and `/usage` only when
 * `hasUsagePage === true`. First whitespace-delimited token wins; args stay
 * on the navigate result (client routes `/team {name}` / `/dex {name}`).
 * Unknown slashes — including `/calc`, `/compare`, and `/usage` when the
 * client has no usage page — are ordinary messages.
 */

import { describe, expect, it } from "vitest";

import { parseSlashCommand } from "./slash-commands";

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
  });

  it("treats unknown slashes including /calc and /compare as messages (SLASH-AC-1.5 / SLASH-BR-1)", () => {
    expect(parseSlashCommand("/calc", WEB)).toEqual({ type: "message" });
    expect(parseSlashCommand("/calc garchomp earthquake", WEB)).toEqual({
      type: "message",
    });
    expect(parseSlashCommand("/compare", WEB)).toEqual({ type: "message" });
    expect(parseSlashCommand("/compare garchomp dragonite", WEB)).toEqual({
      type: "message",
    });
    expect(parseSlashCommand("/foo", WEB)).toEqual({ type: "message" });
    expect(parseSlashCommand("/teams", WEB)).toEqual({ type: "message" });
    expect(parseSlashCommand("/", WEB)).toEqual({ type: "message" });
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

  it("uses the first whitespace-delimited token, including after leading space (ADR-10)", () => {
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

  it("classifies only — a handled slash is not a chat turn (SLASH-BR-2)", () => {
    const result = parseSlashCommand("/new", WEB);
    expect(result).toEqual({ type: "navigate", target: "new" });
    expect(result).not.toHaveProperty("post");
    expect(result).not.toHaveProperty("message");
  });
});
