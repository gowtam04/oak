/**
 * Tests for the provider style wrappers + the buildSystemSegments dispatcher.
 *
 * Champions-first (P3): ONE canonical Markdown domain body (`./domain`) is
 * Champions-only. `domainForMode` may ignore mode. These pins guard:
 *  - exactly ONE cache breakpoint, on the LAST *cached* segment;
 *  - Claude AND Grok are byte-identical pass-throughs of `[systemPrompt, fewShot]`;
 *  - OpenAI still injects its AGENT_CONTRACT / OUTPUT_CONTRACT;
 *  - the body front-loads submit_answer-terminates-the-turn + GFM;
 *  - decline copy **not in the Champions roster**, Stat Points, current regulation;
 *  - the body does NOT teach run_sql / search_wiki / get_meta_usage /
 *    get_encounters, warehouse DDL, wiki routing, or exists_in_standard.
 *
 * Refs: CF-CHAT-US-2, CF-CHAT-AC-2.1–2.5, CF-DATA-BR-4, CF-DATA-BR-5,
 * CF-INT-BR-1, ADR-2, ADR-8.
 */

import { describe, expect, it } from "vitest";

import { buildSystemSegments } from "@/agent/prompts";
import { domainForMode } from "@/agent/prompts/domain";
import type { BoundTeam } from "@/agent/types";
import type { SystemSegment } from "@/agent/providers/types";
import { CHAMPIONS_REGULATION } from "@/data/formats";

const PROVIDERS = ["anthropic", "openai", "xai"] as const;

function oneBreakpointOnLast(segments: SystemSegment[]): void {
  const flagged = segments.filter((s) => s.cacheBreakpoint);
  expect(flagged).toHaveLength(1);
  expect(segments[segments.length - 1].cacheBreakpoint).toBe(true);
  for (const s of segments.slice(0, -1)) expect(s.cacheBreakpoint).toBeFalsy();
}

function bodyText(
  provider: (typeof PROVIDERS)[number],
  mode: Parameters<typeof buildSystemSegments>[0]["mode"] = "champions",
): string {
  return buildSystemSegments({ provider, mode })
    .map((s) => s.text)
    .join("\n");
}

/** Collapse backticks/wrapping so Box-build pins match durable fragments. */
function promptPlain(text: string): string {
  return text.replace(/`/g, "").replace(/\s+/g, " ");
}

/**
 * Slice the Box-build section from its heading through the next same-or-higher
 * heading, so the Full-build sequence stays a sibling (BOX-BR-6).
 */
function boxBuildSection(text: string): string {
  const heading = /(?:^|\n)(#{1,3}\s+[^\n]*box-build[^\n]*)/i.exec(text);
  expect(heading).not.toBeNull();
  const line = heading![1];
  const level = /^#+/.exec(line)![0].length;
  const start = heading!.index + (heading![0].startsWith("\n") ? 1 : 0);
  const after = start + line.length;
  const next = new RegExp(`\\n#{1,${level}}\\s`).exec(text.slice(after));
  return text.slice(start, next ? after + next.index : text.length);
}

const SAMPLE_BOUND_TEAMS: BoundTeam[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Rain",
    format: "champions",
  },
];

function prefixThroughBreakpoint(segments: SystemSegment[]): SystemSegment[] {
  const idx = segments.findIndex((s) => s.cacheBreakpoint);
  expect(idx).toBeGreaterThanOrEqual(0);
  return segments.slice(0, idx + 1);
}

const REMOVED_TOOL_TOKENS = [
  "run_sql",
  "search_wiki",
  "get_meta_usage",
  "get_encounters",
] as const;

describe("buildSystemSegments — cache breakpoint invariant", () => {
  for (const provider of PROVIDERS) {
    it(`places exactly one breakpoint on the last segment (${provider})`, () => {
      oneBreakpointOnLast(buildSystemSegments({ provider, mode: "champions" }));
      // domainForMode may ignore mode — other AgentMode values still wrap.
      oneBreakpointOnLast(buildSystemSegments({ provider, mode: "standard" }));
      oneBreakpointOnLast(buildSystemSegments({ provider, mode: "gen-7" }));
    });
  }
});

describe("buildSystemSegments — bound-teams extra segment (ADR-5)", () => {
  for (const provider of PROVIDERS) {
    it(`prefix through the flagged segment is byte-identical with/without boundTeams (${provider})`, () => {
      const plain = buildSystemSegments({ provider, mode: "champions" });
      const bound = buildSystemSegments({
        provider,
        mode: "champions",
        boundTeams: SAMPLE_BOUND_TEAMS,
      });
      expect(prefixThroughBreakpoint(bound)).toEqual(
        prefixThroughBreakpoint(plain),
      );
    });

    it(`keeps exactly one breakpoint on the prefix last segment (${provider})`, () => {
      const bound = buildSystemSegments({
        provider,
        mode: "champions",
        boundTeams: SAMPLE_BOUND_TEAMS,
      });
      const prefix = prefixThroughBreakpoint(bound);
      const flagged = bound.filter((s) => s.cacheBreakpoint);
      expect(flagged).toHaveLength(1);
      expect(prefix[prefix.length - 1]?.cacheBreakpoint).toBe(true);
      for (const s of prefix.slice(0, -1)) expect(s.cacheBreakpoint).toBeFalsy();
    });

    it(`appends an uncached extra segment that names get_team (${provider})`, () => {
      const bound = buildSystemSegments({
        provider,
        mode: "champions",
        boundTeams: SAMPLE_BOUND_TEAMS,
      });
      const extra = bound[bound.length - 1];
      expect(extra).toBeDefined();
      expect(extra!.cacheBreakpoint).toBeFalsy();
      expect(extra!.text).toContain("get_team");
      expect(bound.length).toBe(
        buildSystemSegments({ provider, mode: "champions" }).length + 1,
      );
    });

    it(`omits the extra segment when boundTeams is empty (${provider})`, () => {
      const plain = buildSystemSegments({ provider, mode: "champions" });
      expect(
        buildSystemSegments({ provider, mode: "champions", boundTeams: [] }),
      ).toEqual(plain);
    });
  }
});

describe("Claude + Grok styles — byte-identical pass-throughs of the one body", () => {
  for (const provider of ["anthropic", "xai"] as const) {
    it(`is exactly [systemPrompt, fewShot] for ${provider}`, () => {
      const domain = domainForMode("champions");
      expect(buildSystemSegments({ provider, mode: "champions" })).toEqual([
        { text: domain.systemPrompt },
        { text: domain.fewShot, cacheBreakpoint: true },
      ]);
    });
  }

  it("Claude and Grok produce the SAME segments (no per-provider fork)", () => {
    expect(buildSystemSegments({ provider: "xai", mode: "champions" })).toEqual(
      buildSystemSegments({ provider: "anthropic", mode: "champions" }),
    );
  });
});

describe("The one body — front-loaded contract + GFM (all plain-wrap providers)", () => {
  for (const provider of ["anthropic", "xai"] as const) {
    const text = bodyText(provider);
    it(`states submit_answer ends the turn, once (${provider})`, () => {
      expect(text).toContain("submit_answer");
      expect(text).toContain("exactly once");
      expect(text).toContain("ENDS the turn");
    });
    it(`directs GitHub-Flavored Markdown output (${provider})`, () => {
      expect(text).toContain("GitHub-Flavored Markdown");
    });
  }
});

describe("The one body — G8 never bail on answerable filters", () => {
  for (const provider of PROVIDERS) {
    it(`forbids insufficient_data on tool-answerable questions (${provider})`, () => {
      const text = bodyText(provider);
      expect(text).toContain(
        "NEVER return status `insufficient_data` for a question you can answer by",
      );
      expect(text).toContain(
        "`insufficient_data` is only for genuine tool failure",
      );
    });
  }
});

describe("The one body — Champions-only coach (CF-CHAT-US-2, CF-INT-BR-1)", () => {
  for (const provider of PROVIDERS) {
    it(`names the current regulation and Stat Points (${provider})`, () => {
      const text = bodyText(provider);
      expect(text).toContain(CHAMPIONS_REGULATION);
      expect(text).toContain("Stat Points");
    });

    it(`teaches the user-facing decline phrase (CF-DATA-BR-4, CF-CHAT-AC-2.1) (${provider})`, () => {
      const text = bodyText(provider);
      expect(text).toContain("not in the Champions roster");
    });

    it(`does not teach removed other-game tools (ADR-2) (${provider})`, () => {
      const text = bodyText(provider);
      for (const token of REMOVED_TOOL_TOKENS) {
        expect(text).not.toContain(token);
      }
      expect(text).not.toContain("web_search");
    });

    it(`does not embed warehouse DDL or wiki routing (${provider})`, () => {
      const prefix = buildSystemSegments({ provider, mode: "champions" })
        .slice(0, -1)
        .map((s) => s.text)
        .join("\n");
      const text = bodyText(provider);
      expect(prefix).not.toContain("CREATE TABLE natdex_species");
      expect(prefix).not.toContain("CREATE TABLE natdex_moves");
      expect(prefix).not.toContain("CREATE TABLE meta_usage");
      expect(prefix).not.toContain("CREATE TABLE wiki_chunk");
      expect(text).not.toContain("LEAST(type1,type2)");
    });

    it(`does not teach exists_in_standard or SV fallback (ADR-8, CF-DATA-BR-5) (${provider})`, () => {
      const text = bodyText(provider);
      expect(text).not.toContain("exists_in_standard");
      expect(text).not.toContain("a roster miss NEVER means");
    });
  }
});

describe("domainForMode — Champions body even when mode is another AgentMode", () => {
  it("does not require a gen-7 body with Gen 7 facts", () => {
    const text = `${domainForMode("gen-7").systemPrompt}\n${domainForMode("gen-7").fewShot}`;
    expect(text).toContain("not in the Champions roster");
    expect(text).toContain("Stat Points");
    expect(text).toContain(CHAMPIONS_REGULATION);
    expect(text).not.toContain("Z-Moves");
    expect(text).not.toContain("run_sql");
  });
});

describe("GPT-5.5 style — tuned scaffolding wraps the same body", () => {
  const text = bodyText("openai", "champions");

  it("includes the explicit agent contract + single stop condition", () => {
    expect(text).toContain("<agent_contract>");
    expect(text).toContain("submit_answer exactly once");
  });

  it("includes the explicit Markdown directive (API suppresses Markdown by default)", () => {
    expect(text).toContain("<output_contract>");
    expect(text).toContain("GitHub-Flavored Markdown");
  });

  it("still carries the shared domain body", () => {
    expect(text).toContain("You are Oak");
    expect(text).toContain("# Tool routing");
  });
});

describe("Interpreting attached images — present for the Champions body", () => {
  for (const provider of PROVIDERS) {
    it(`carries the image-interpreting section (${provider})`, () => {
      const text = bodyText(provider);
      expect(text).toContain("# Interpreting attached images");
      expect(text).toContain("general, not just teams");
      expect(text).toContain("uncertainty_flags");
    });

    it(`teaches the nature-chevron glyph guidance (${provider})`, () => {
      const text = bodyText(provider);
      expect(text).toContain("small colored chevron");
      expect(text).toContain("STAT LABEL");
    });

    it(`teaches the Champions stats-screen chevron note (${provider})`, () => {
      expect(bodyText(provider)).toContain("NATURE ON THIS SCREEN");
      expect(bodyText(provider)).toContain("blue DOWN-chevron");
    });
  }
});

describe("get_learnset parity guard (B-13) — present in the Champions body", () => {
  for (const provider of PROVIDERS) {
    it(`mentions get_learnset (${provider})`, () => {
      expect(bodyText(provider)).toContain("get_learnset");
    });
  }
});

describe("Team-build budget policy — batch learnsets + staple items", () => {
  for (const provider of PROVIDERS) {
    it(`requires parallel get_learnset batching on builds (${provider})`, () => {
      const text = bodyText(provider);
      expect(text).toContain("HARD RULE");
      expect(text).toContain("in parallel");
      expect(text).toContain("get_learnset");
    });
    it(`prefers staples over per-slot get_item verification (${provider})`, () => {
      const text = bodyText(provider);
      expect(text).toContain("competitive staples");
      expect(text).toContain("Do NOT spend a tool call per slot on");
      expect(text).toContain("get_item for staples");
      expect(text).not.toContain("verify with get_item");
    });
    it(`Champions item bullet skips pre-verifying every held item (${provider})`, () => {
      const text = bodyText(provider);
      expect(text).toContain("operator-curated allowlist");
      expect(text).toContain("do NOT pre-verify every held item with get_item");
      expect(text).toContain("legal held-item list");
    });
  }
});

describe("Roster vs full-build policy — catalog shortlist, not exhaustive", () => {
  for (const provider of PROVIDERS) {
    it(`splits roster/catalog from full build (${provider})`, () => {
      const text = bodyText(provider);
      expect(text).toContain("roster/catalog vs full build");
      expect(text).toContain("8–12 staples");
      expect(text).toContain("representative coverage");
      expect(text).toContain("Do NOT call get_learnset per");
      expect(text).toContain("on a roster turn");
      expect(text).toContain("partial high-signal list");
      expect(text).toContain("Box-build section above");
    });
  }
});

describe("Anti-leak — no internal machinery in user-visible fields", () => {
  for (const provider of PROVIDERS) {
    it(`states the anti-leak rule in the body (${provider})`, () => {
      expect(bodyText(provider)).toContain("NEVER expose Oak's internal machinery");
    });
    it(`few-shot no longer models leaking internals (${provider})`, () => {
      const fewShot = domainForMode("champions").fewShot;
      expect(fewShot).not.toContain("offline warehouse");
      expect(fewShot).not.toContain("ran one read-only SQL");
      expect(fewShot).not.toContain("meta_usage warehouse");
    });
  }
});

describe("Box-build section — lookup_box short path in the cached body", () => {
  for (const provider of PROVIDERS) {
    it(`contains lookup_box (${provider})`, () => {
      expect(bodyText(provider)).toContain("lookup_box");
    });

    it(`teaches do-not-drop named species (${provider})`, () => {
      const plain = promptPlain(boxBuildSection(bodyText(provider)));
      expect(plain).toMatch(/do not drop|don't drop/i);
      expect(plain).toMatch(/named/i);
    });

    it(`does not route box-build (or anything) through wiki/SQL tools (${provider})`, () => {
      const text = bodyText(provider);
      const section = promptPlain(boxBuildSection(text));
      expect(section).toContain("lookup_box");
      expect(text).not.toContain("run_sql");
      expect(text).not.toContain("search_wiki");
      expect(text).toContain("### Full build");
    });

    it(`places the Box-build section above the full-build sequence (${provider})`, () => {
      const text = bodyText(provider);
      const boxHeadingAt = text.search(/#{1,3}\s+[^\n]*box-build/i);
      const fullAt = text.indexOf("### Full build");
      expect(boxHeadingAt).toBeGreaterThanOrEqual(0);
      expect(fullAt).toBeGreaterThan(boxHeadingAt);
      expect(text.indexOf("lookup_box")).toBeGreaterThanOrEqual(0);
      expect(text.indexOf("lookup_box")).toBeLessThan(fullAt);
    });

    it(`does not call get_learnset per species on the box-build path (${provider})`, () => {
      const text = bodyText(provider);
      const section = promptPlain(boxBuildSection(text));
      expect(section).toContain("lookup_box");
      expect(section).toMatch(
        /do not call get_learnset|don't call get_learnset|get_learnset per|per-species get_learnset/i,
      );
      expect(text).toContain("get_learnset");
      expect(text).toContain("what moves can/does X learn");
    });

    it(`allows cuts from a box larger than six (BOX-AC-2.2) (${provider})`, () => {
      const section = promptPlain(boxBuildSection(bodyText(provider)));
      expect(section).toContain("more than six names");
      expect(section).toMatch(/cuts/i);
    });

    it(`submits proposed_team for the user to apply (BOX-AC-2.4) (${provider})`, () => {
      const section = promptPlain(boxBuildSection(bodyText(provider)));
      expect(section).toContain("proposed_team");
      expect(section).toContain("user applies");
    });

    it(`pins Box-build heading and lookup_box in the cached prefix (${provider})`, () => {
      const prefix = prefixThroughBreakpoint(
        buildSystemSegments({ provider, mode: "champions" }),
      )
        .slice(0, -1)
        .map((s) => s.text)
        .join("\n");
      expect(prefix).toContain("## Box-build");
      expect(prefix).toContain("lookup_box");
    });
  }
});
