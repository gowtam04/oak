/**
 * Scope-fact guard for the ONE canonical body.
 *
 * Since Oak v2 P3 (prompt collapse) there is a SINGLE Markdown body for all three
 * providers; the old cross-body ("Markdown vs Grok-XML") parity rule is dead.
 * "Parity" now means the one body, built for each scope, carries that scope's
 * facts sourced from the single fact tables — `MAINLINE_GEN_INFO` (`./gen-info`)
 * for the mainline gens and `CHAMPIONS_PROFILE` (`./champions`) for Champions.
 *
 * This test pins:
 *  - for every mainline scope, the built body contains that scope's `label` +
 *    `basisTag`, and the basisTag stays in lock-step with `formats.ts`;
 *  - a gen-7 build never leaks the Gen 9 label;
 *  - the Champions body carries the regulation, Stat Points, and the
 *    no-Terastallization rule;
 *  - the body mentions all six data-scope formats (via the injected warehouse
 *    DDL) so run_sql knows the whole `format` partition set.
 */

import { describe, expect, it } from "vitest";

import { domainForMode } from "@/agent/prompts/domain";
import {
  MAINLINE_GEN_INFO,
  type MainlineMode,
} from "@/agent/prompts/gen-info";
import {
  basisForFormat,
  CHAMPIONS_REGULATION,
  formatForMode,
  FORMATS,
} from "@/data/formats";

const MAINLINE_MODES = Object.keys(MAINLINE_GEN_INFO) as MainlineMode[];

function fullBody(mode: Parameters<typeof domainForMode>[0]): string {
  const d = domainForMode(mode);
  return `${d.systemPrompt}\n${d.fewShot}`;
}

describe("scope facts — the fact table backs every mainline scope", () => {
  it("covers exactly the expected mainline scopes (standard + gen-5…gen-8)", () => {
    expect([...MAINLINE_MODES].sort()).toEqual([
      "gen-5",
      "gen-6",
      "gen-7",
      "gen-8",
      "standard",
    ]);
  });

  for (const mode of MAINLINE_MODES) {
    const info = MAINLINE_GEN_INFO[mode];

    it(`the built body carries ${mode}'s label + basis tag`, () => {
      const text = fullBody(mode);
      expect(text).toContain(info.label);
      expect(text).toContain(info.basisTag);
    });

    it(`${mode}'s basisTag stays in lock-step with formats.ts`, () => {
      expect(info.basisTag).toBe(basisForFormat(formatForMode(mode)));
    });
  }
});

describe("scope facts — a gen-7 build never leaks the Gen 9 label", () => {
  it("does not emit 'Generation 9' when built for gen-7", () => {
    expect(fullBody("gen-7")).not.toContain("Generation 9");
  });
});

describe("scope facts — the Champions body is Champions-correct", () => {
  const text = fullBody("champions");

  it("carries the current regulation and the champions basis tag", () => {
    expect(text).toContain(CHAMPIONS_REGULATION);
    expect(text).toContain('generation: "champions"');
  });

  it("uses Stat Points and forbids Terastallization", () => {
    expect(text).toContain("Stat Points");
    expect(text).toContain("NO Terastallization");
  });

  it("carries the exists_in_standard cross-scope hint", () => {
    expect(text).toContain("exists_in_standard");
  });

  it("carries the get_evolution_chain source_format fallback flag", () => {
    expect(text).toContain("source_format");
  });

  it("tells the model a roster miss never blocks a non-competitive games answer", () => {
    expect(text).toContain("a roster miss NEVER means");
  });
});

describe("scope facts — the body names all six data-scope formats", () => {
  // The injected warehouse DDL documents the `format` partition set, so run_sql
  // knows every scope. This is the single place all six format strings must
  // appear together — a new/renamed format trips this.
  it("mentions every format from formats.ts", () => {
    const text = fullBody("standard");
    for (const format of FORMATS) {
      expect(text).toContain(`'${format}'`);
    }
  });
});
