/**
 * Champions-first guard for the ONE canonical body.
 *
 * There is a SINGLE Markdown body. It is Champions-only: current regulation,
 * Stat Points, decline phrase **not in the Champions roster**. It does not
 * lock-step eleven formats, inject warehouse DDL, or teach exists_in_standard /
 * SV evolution fallback.
 *
 * `domainForMode` may ignore mode and always return the Champions body —
 * these tests must not require a gen-7 body with Gen 7 facts.
 *
 * Refs: CF-CHAT-US-2, CF-CHAT-AC-2.1–2.5, CF-DATA-BR-4, CF-DATA-BR-5,
 * CF-INT-BR-1, ADR-2, ADR-8.
 */

import { describe, expect, it } from "vitest";

import { domainForMode } from "@/agent/prompts/domain";
import { CHAMPIONS_REGULATION } from "@/data/formats";

function fullBody(mode: Parameters<typeof domainForMode>[0]): string {
  const d = domainForMode(mode);
  return `${d.systemPrompt}\n${d.fewShot}`;
}

describe("scope facts — the Champions body is Champions-correct", () => {
  const text = fullBody("champions");

  it("carries the current regulation and the champions basis tag", () => {
    expect(text).toContain(CHAMPIONS_REGULATION);
    expect(text).toContain('generation: "champions"');
  });

  it("uses Stat Points and forbids Terastallization (CF-INT-BR-1)", () => {
    expect(text).toContain("Stat Points");
    expect(text).toContain("NO Terastallization");
  });

  it("teaches the user-facing decline phrase (CF-DATA-BR-4, CF-CHAT-AC-2.1)", () => {
    expect(text).toContain("not in the Champions roster");
    expect(text).toMatch(/name the entity|name that entity/i);
  });

  it("declines other games, franchise media, and catch locations (CF-CHAT-AC-2.2–2.4)", () => {
    expect(text).toMatch(/Pokémon Champions/i);
    expect(text.toLowerCase()).toMatch(/anime|manga/);
    expect(text.toLowerCase()).toMatch(/catch|location/);
  });

  it("does not carry exists_in_standard or evo source_format fallback (ADR-8, CF-DATA-BR-5)", () => {
    expect(text).not.toContain("exists_in_standard");
    expect(text).not.toContain("a roster miss NEVER means");
  });

  it("does not teach run_sql, search_wiki, get_meta_usage, or get_encounters (ADR-2)", () => {
    expect(text).not.toContain("run_sql");
    expect(text).not.toContain("search_wiki");
    expect(text).not.toContain("get_meta_usage");
    expect(text).not.toContain("get_encounters");
  });

  it("does not embed warehouse DDL or whole-dex wiki routing", () => {
    expect(text).not.toContain("CREATE TABLE natdex_species");
    expect(text).not.toContain("CREATE TABLE meta_usage");
    expect(text).not.toContain("LEAST(type1,type2)");
    expect(text).not.toContain("pokemon@national-dex");
    expect(text).not.toContain("whole-Pokédex scope");
  });
});

describe("scope facts — domainForMode does not require a gen-7 / National Dex body", () => {
  it("a gen-7 mode still gets Champions decline + Stat Points, not Gen 7 facts", () => {
    const text = fullBody("gen-7");
    expect(text).toContain("not in the Champions roster");
    expect(text).toContain("Stat Points");
    expect(text).toContain(CHAMPIONS_REGULATION);
    expect(text).not.toContain("Z-Moves");
    expect(text).not.toContain("run_sql");
  });

  it("does not frame the body as the whole National Pokédex", () => {
    const text = fullBody("national-dex");
    expect(text).toContain("not in the Champions roster");
    expect(text).not.toContain("pokemon@national-dex");
  });
});
