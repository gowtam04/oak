/**
 * Tests for the provider style wrappers + the buildSystemSegments dispatcher.
 *
 * Since Oak v2 P3 (prompt collapse) there is ONE canonical Markdown domain body
 * (`./domain`) for a turn's scope, wrapped by a thin per-provider style. These
 * pins guard the collapse invariants:
 *  - exactly ONE cache breakpoint, on the LAST segment, for every provider;
 *  - Claude AND Grok are byte-identical pass-throughs of `[systemPrompt, fewShot]`;
 *  - OpenAI still injects its AGENT_CONTRACT / OUTPUT_CONTRACT (Markdown/stop);
 *  - the single body front-loads submit_answer-terminates-the-turn + GFM;
 *  - the body teaches the two new tools (run_sql / search_wiki), embeds the
 *    run_sql warehouse DDL in the cached prefix, and teaches honest degradation
 *    in place of the removed T20 web_search (no fabricated live/current facts);
 *  - the per-scope generation facts (label + basis tag) ride in the assembled body
 *    and a gen-7 build never leaks "Generation 9".
 */

import { describe, expect, it } from "vitest";

import { buildSystemSegments } from "@/agent/prompts";
import { domainForMode } from "@/agent/prompts/domain";
import { MAINLINE_GEN_INFO } from "@/agent/prompts/gen-info";
import type { SystemSegment } from "@/agent/providers/types";

const PROVIDERS = ["anthropic", "openai", "xai"] as const;

function oneBreakpointOnLast(segments: SystemSegment[]): void {
  const flagged = segments.filter((s) => s.cacheBreakpoint);
  expect(flagged).toHaveLength(1);
  expect(segments[segments.length - 1].cacheBreakpoint).toBe(true);
  for (const s of segments.slice(0, -1)) expect(s.cacheBreakpoint).toBeFalsy();
}

function bodyText(
  provider: (typeof PROVIDERS)[number],
  mode: Parameters<typeof buildSystemSegments>[0]["mode"],
): string {
  return buildSystemSegments({ provider, mode })
    .map((s) => s.text)
    .join("\n");
}

describe("buildSystemSegments — cache breakpoint invariant", () => {
  for (const provider of PROVIDERS) {
    it(`places exactly one breakpoint on the last segment (${provider})`, () => {
      oneBreakpointOnLast(buildSystemSegments({ provider, mode: "standard" }));
      oneBreakpointOnLast(buildSystemSegments({ provider, mode: "champions" }));
      // National Dex (the default) is its own hand-authored scope profile.
      oneBreakpointOnLast(buildSystemSegments({ provider, mode: "national-dex" }));
      // A gen scope builds its own per-scope prefix — same breakpoint invariant.
      oneBreakpointOnLast(buildSystemSegments({ provider, mode: "gen-7" }));
      oneBreakpointOnLast(buildSystemSegments({ provider, mode: "gen-1" }));
    });
  }
});

describe("Claude + Grok styles — byte-identical pass-throughs of the one body", () => {
  // Both plain-wrap providers must be exactly [systemPrompt, fewShot(breakpoint)]
  // for EVERY scope they serve — the collapse means Grok is no longer a separate
  // XML body, so it matches Claude byte-for-byte.
  for (const provider of ["anthropic", "xai"] as const) {
    for (const mode of [
      "standard",
      "gen-7",
      "gen-1",
      "national-dex",
      "champions",
    ] as const) {
      it(`is exactly [systemPrompt, fewShot] for ${provider} / ${mode}`, () => {
        const domain = domainForMode(mode);
        expect(buildSystemSegments({ provider, mode })).toEqual([
          { text: domain.systemPrompt },
          { text: domain.fewShot, cacheBreakpoint: true },
        ]);
      });
    }
  }

  it("Claude and Grok produce the SAME segments (no per-provider fork)", () => {
    for (const mode of ["standard", "gen-7", "champions"] as const) {
      expect(buildSystemSegments({ provider: "xai", mode })).toEqual(
        buildSystemSegments({ provider: "anthropic", mode }),
      );
    }
  });
});

describe("The one body — front-loaded contract + GFM (all plain-wrap providers)", () => {
  for (const provider of ["anthropic", "xai"] as const) {
    const text = bodyText(provider, "standard");
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

describe("The one body — the two new tools + warehouse DDL + no-live-web policy", () => {
  for (const provider of PROVIDERS) {
    for (const mode of ["standard", "champions", "gen-7"] as const) {
      it(`routes run_sql / search_wiki, and does NOT mention web_search (${provider}, ${mode})`, () => {
        const text = bodyText(provider, mode);
        expect(text).toContain("run_sql");
        expect(text).toContain("search_wiki");
        expect(text).not.toContain("web_search");
      });
      it(`teaches honest degradation instead of live web (${provider}, ${mode})`, () => {
        const text = bodyText(provider, mode);
        expect(text).toContain("No live web access");
        expect(text).toContain("cannot check live/current information");
      });
      it(`embeds the run_sql warehouse DDL in the cached prefix (${provider}, ${mode})`, () => {
        // The DDL lands in the systemPrompt (the cached prefix before the
        // breakpoint), not the few-shot segment.
        const prefix = buildSystemSegments({ provider, mode })
          .slice(0, -1)
          .map((s) => s.text)
          .join("\n");
        expect(prefix).toContain("CREATE TABLE natdex_species");
        expect(prefix).toContain("CREATE TABLE natdex_moves");
      });
    }
  }
});

describe("run_sql scope-default sub-bullet — present per provider, shape unchanged", () => {
  for (const provider of PROVIDERS) {
    for (const mode of ["standard", "champions", "gen-1"] as const) {
      it(`carries the unqualified-aggregation-stays-in-scope sub-bullet (${provider}, ${mode})`, () => {
        const text = bodyText(provider, mode);
        // The qualifier on the whole-Pokédex bullet + the new counterweight bullet.
        expect(text).toContain('"Whole-Pokédex" means EXPLICITLY cross-generation');
        expect(text).toContain(
          "An UNQUALIFIED count / superlative / ranking, though, means WITHIN the active",
        );
      });
      it(`still places exactly one breakpoint on the last segment (${provider}, ${mode})`, () => {
        oneBreakpointOnLast(buildSystemSegments({ provider, mode }));
      });
    }
  }
});

describe("Generation-scope facts — per-scope label/basis tag in the assembled body", () => {
  for (const provider of PROVIDERS) {
    it(`carries the standard (Gen 9) label + basis tag (${provider})`, () => {
      const text = bodyText(provider, "standard");
      expect(text).toContain(MAINLINE_GEN_INFO.standard.label);
      expect(text).toContain(MAINLINE_GEN_INFO.standard.basisTag);
    });
    it(`carries the gen-7 label + basis tag and drops "Generation 9" (${provider})`, () => {
      const text = bodyText(provider, "gen-7");
      expect(text).toContain(MAINLINE_GEN_INFO["gen-7"].label);
      expect(text).toContain(MAINLINE_GEN_INFO["gen-7"].basisTag);
      expect(text).not.toContain("Generation 9");
    });
  }
});

describe("GPT-5.5 style — tuned scaffolding wraps the same body", () => {
  const text = bodyText("openai", "standard");

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

describe("Interpreting attached images — present in every scope + provider", () => {
  for (const provider of PROVIDERS) {
    for (const mode of ["standard", "champions"] as const) {
      it(`carries the image-interpreting section (${provider}, ${mode})`, () => {
        const text = bodyText(provider, mode);
        expect(text).toContain("# Interpreting attached images");
        expect(text).toContain("general, not just teams");
        expect(text).toContain("uncertainty_flags");
      });

      it(`teaches the nature-chevron glyph guidance in every scope (${provider}, ${mode})`, () => {
        const text = bodyText(provider, mode);
        expect(text).toContain("small colored chevron");
        expect(text).toContain("STAT LABEL");
      });
    }

    it(`teaches the Champions stats-screen chevron note in champions scope only (${provider})`, () => {
      const championsText = bodyText(provider, "champions");
      const standardText = bodyText(provider, "standard");
      expect(championsText).toContain("NATURE ON THIS SCREEN");
      expect(championsText).toContain("blue DOWN-chevron");
      expect(standardText).not.toContain("NATURE ON THIS SCREEN");
    });
  }
});

describe("get_learnset parity guard (B-13) — present in every scope + provider", () => {
  for (const provider of PROVIDERS) {
    for (const mode of ["standard", "champions"] as const) {
      it(`mentions get_learnset (${provider}, ${mode})`, () => {
        expect(bodyText(provider, mode)).toContain("get_learnset");
      });
    }
  }
});

describe("Anti-leak — no internal machinery in user-visible fields", () => {
  for (const provider of PROVIDERS) {
    for (const mode of ["standard", "champions", "gen-7"] as const) {
      it(`states the anti-leak rule in the body (${provider}, ${mode})`, () => {
        const text = bodyText(provider, mode);
        expect(text).toContain("NEVER expose Oak's internal machinery");
      });
      it(`few-shot no longer models leaking internals (${provider}, ${mode})`, () => {
        const fewShot = domainForMode(mode).fewShot;
        expect(fewShot).not.toContain("offline warehouse");
        expect(fewShot).not.toContain("ran one read-only SQL");
        expect(fewShot).not.toContain("meta_usage warehouse");
      });
    }
  }
});

describe("get_meta_usage routing (B-5) — present + DDL in the cached prefix", () => {
  for (const provider of PROVIDERS) {
    for (const mode of ["standard", "champions", "gen-7"] as const) {
      it(`routes get_meta_usage (${provider}, ${mode})`, () => {
        expect(bodyText(provider, mode)).toContain("get_meta_usage");
      });
      it(`embeds the meta_usage warehouse table in the cached prefix (${provider}, ${mode})`, () => {
        const prefix = buildSystemSegments({ provider, mode })
          .slice(0, -1)
          .map((s) => s.text)
          .join("\n");
        expect(prefix).toContain("CREATE TABLE meta_usage");
      });
    }
  }
});
