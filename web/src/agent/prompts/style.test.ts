/**
 * Tests for the provider style wrappers + the buildSystemSegments dispatcher.
 *
 * Since Oak v2 P3 (prompt collapse) there is ONE canonical Markdown domain body
 * (`./domain`) for a turn's scope, wrapped by a thin per-provider style. These
 * pins guard the collapse invariants:
 *  - exactly ONE cache breakpoint, on the LAST *cached* segment, for every
 *    provider (bound-teams is appended after that prefix and must not take it);
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
import type { BoundTeam } from "@/agent/types";
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
  { id: "11111111-1111-4111-8111-111111111111", name: "Rain", format: "scarlet-violet" },
];

function prefixThroughBreakpoint(segments: SystemSegment[]): SystemSegment[] {
  const idx = segments.findIndex((s) => s.cacheBreakpoint);
  expect(idx).toBeGreaterThanOrEqual(0);
  return segments.slice(0, idx + 1);
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

describe("buildSystemSegments — bound-teams extra segment (ADR-5)", () => {
  for (const provider of PROVIDERS) {
    it(`prefix through the flagged segment is byte-identical with/without boundTeams (${provider})`, () => {
      const plain = buildSystemSegments({ provider, mode: "standard" });
      const bound = buildSystemSegments({
        provider,
        mode: "standard",
        boundTeams: SAMPLE_BOUND_TEAMS,
      });
      expect(prefixThroughBreakpoint(bound)).toEqual(
        prefixThroughBreakpoint(plain),
      );
    });

    it(`keeps exactly one breakpoint on the prefix last segment (${provider})`, () => {
      const bound = buildSystemSegments({
        provider,
        mode: "standard",
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
        mode: "standard",
        boundTeams: SAMPLE_BOUND_TEAMS,
      });
      const extra = bound[bound.length - 1];
      expect(extra).toBeDefined();
      expect(extra!.cacheBreakpoint).toBeFalsy();
      expect(extra!.text).toContain("get_team");
      expect(bound.length).toBe(
        buildSystemSegments({ provider, mode: "standard" }).length + 1,
      );
    });

    it(`omits the extra segment when boundTeams is empty (${provider})`, () => {
      const plain = buildSystemSegments({ provider, mode: "standard" });
      expect(
        buildSystemSegments({ provider, mode: "standard", boundTeams: [] }),
      ).toEqual(plain);
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

describe("The one body — G8 never bail on answerable filters", () => {
  // Restored after oak-v2 prompt collapse dropped the Grok-only rule; now shared.
  for (const provider of PROVIDERS) {
    for (const mode of ["standard", "champions", "gen-7"] as const) {
      it(`forbids insufficient_data on tool-answerable questions (${provider}, ${mode})`, () => {
        const text = bodyText(provider, mode);
        expect(text).toContain(
          "NEVER return status `insufficient_data` for a question you can answer by",
        );
        expect(text).toContain(
          "`insufficient_data` is only for genuine tool failure",
        );
      });
    }
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

describe("Team-build budget policy — batch learnsets + staple items", () => {
  for (const provider of PROVIDERS) {
    for (const mode of ["standard", "champions"] as const) {
      it(`requires parallel get_learnset batching on builds (${provider}, ${mode})`, () => {
        const text = bodyText(provider, mode);
        expect(text).toContain("HARD RULE");
        expect(text).toContain("in parallel");
        expect(text).toContain("get_learnset");
      });
      it(`prefers staples over per-slot get_item verification (${provider}, ${mode})`, () => {
        const text = bodyText(provider, mode);
        expect(text).toContain("competitive staples");
        // Source wraps mid-sentence; match the durable policy phrases.
        expect(text).toContain("Do NOT spend a tool call per slot on");
        expect(text).toContain("get_item for staples");
        expect(text).not.toContain("verify with get_item");
      });
    }
    it(`Champions item bullet skips pre-verifying every held item (${provider})`, () => {
      const text = bodyText(provider, "champions");
      expect(text).toContain("operator-curated allowlist");
      expect(text).toContain("do NOT pre-verify every held item with get_item");
      expect(text).toContain("legal held-item list");
    });
  }
});

describe("Roster vs full-build policy — catalog shortlist, not exhaustive", () => {
  for (const provider of PROVIDERS) {
    for (const mode of ["standard", "champions"] as const) {
      it(`splits roster/catalog from full build (${provider}, ${mode})`, () => {
        const text = bodyText(provider, mode);
        expect(text).toContain("roster/catalog vs full build");
        expect(text).toContain("8–12 staples");
        expect(text).toContain("representative coverage");
        // Source wraps mid-sentence; match durable fragments, not the join.
        expect(text).toContain("Do NOT call get_learnset per");
        expect(text).toContain("on a roster turn");
        expect(text).toContain("partial high-signal list");
        // Pasted owned list / box-build is not this Full-build sequence.
        expect(text).toContain("Box-build section above");
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

describe("Box-build section — lookup_box short path in the cached body", () => {
  // Phase 3 pins (BOX-US-2/3/4, BOX-AC-2.2/2.4, BOX-BR-5/6/7): a Box-build
  // section above the full-build sequence teaches lookup_box, do-not-drop,
  // and no run_sql/search_wiki/per-species get_learnset on that path. The
  // rest of the body still documents the full agent (BOX-BR-6/7).
  for (const provider of PROVIDERS) {
    for (const mode of ["standard", "champions"] as const) {
      it(`contains lookup_box (${provider}, ${mode})`, () => {
        expect(bodyText(provider, mode)).toContain("lookup_box");
      });

      it(`teaches do-not-drop named species (${provider}, ${mode})`, () => {
        const plain = promptPlain(boxBuildSection(bodyText(provider, mode)));
        expect(plain).toMatch(/do not drop|don't drop/i);
        expect(plain).toMatch(/named/i);
      });

      it(`forbids run_sql and search_wiki inside Box-build, not the rest of the body (${provider}, ${mode})`, () => {
        const text = bodyText(provider, mode);
        const section = promptPlain(boxBuildSection(text));
        expect(section).toMatch(/do not call run_sql|don't call run_sql/i);
        expect(section).toMatch(
          /do not call search_wiki|don't call search_wiki|run_sql.{0,80}search_wiki/i,
        );
        expect(section).toContain("lookup_box");
        // BOX-BR-6: non-box turns still get the warehouse/wiki tools + full build.
        expect(text).toContain("**run_sql**");
        expect(text).toContain("**search_wiki**");
        expect(text).toContain("### Full build");
      });

      it(`places the Box-build section above the full-build sequence (${provider}, ${mode})`, () => {
        const text = bodyText(provider, mode);
        const boxHeadingAt = text.search(/#{1,3}\s+[^\n]*box-build/i);
        const fullAt = text.indexOf("### Full build");
        expect(boxHeadingAt).toBeGreaterThanOrEqual(0);
        expect(fullAt).toBeGreaterThan(boxHeadingAt);
        expect(text.indexOf("lookup_box")).toBeGreaterThanOrEqual(0);
        expect(text.indexOf("lookup_box")).toBeLessThan(fullAt);
      });

      it(`does not call get_learnset per species on the box-build path (${provider}, ${mode})`, () => {
        const text = bodyText(provider, mode);
        const section = promptPlain(boxBuildSection(text));
        expect(section).toContain("lookup_box");
        expect(section).toMatch(
          /do not call get_learnset|don't call get_learnset|get_learnset per|per-species get_learnset/i,
        );
        // BOX-BR-7: full-movepool questions still route to get_learnset.
        expect(text).toContain("get_learnset");
        expect(text).toContain("what moves can/does X learn");
      });

      it(`allows cuts from a box larger than six (BOX-AC-2.2) (${provider}, ${mode})`, () => {
        const section = promptPlain(boxBuildSection(bodyText(provider, mode)));
        expect(section).toContain("more than six names");
        expect(section).toMatch(/cuts/i);
      });

      it(`submits proposed_team for the user to apply (BOX-AC-2.4) (${provider}, ${mode})`, () => {
        const section = promptPlain(boxBuildSection(bodyText(provider, mode)));
        expect(section).toContain("proposed_team");
        expect(section).toContain("user applies");
      });

      it(`pins Box-build heading and lookup_box in the cached prefix (${provider}, ${mode})`, () => {
        // Same idea as the get_meta_usage DDL pin: the section lives in the
        // cached prefix (system body), not the few-shot segment.
        const prefix = prefixThroughBreakpoint(
          buildSystemSegments({ provider, mode }),
        )
          .slice(0, -1)
          .map((s) => s.text)
          .join("\n");
        expect(prefix).toContain("## Box-build");
        expect(prefix).toContain("lookup_box");
      });
    }
  }
});
