import { describe, expect, it } from "vitest";

import {
  LANDING_DISCLAIMER,
  LANDING_FAQ,
  LANDING_FEATURES,
  LANDING_INTRO,
} from "./landing-content";

/**
 * Champions-first landing copy (CF-UI-BR-1, CF-UI-BR-3, CF-UI-BR-4, CF-INT-BR-10).
 * Colocated tsx so the jsdom project picks it up (node excludes components).
 */

function landingBlob() {
  const features = LANDING_FEATURES.map((f) => `${f.title} ${f.body}`).join("\n");
  const faq = LANDING_FAQ.map((e) => `${e.q} ${e.a}`).join("\n");
  return [LANDING_INTRO, features, faq, LANDING_DISCLAIMER].join("\n");
}

describe("landing-content — Champions-only (CF-UI-US-3, CF-UI-BR-1, CF-UI-BR-3)", () => {
  it("intro, features, and FAQ name Pokémon Champions and Oak", () => {
    expect(LANDING_INTRO).toMatch(/Oak/);
    expect(LANDING_INTRO).toMatch(/Champions/i);
    expect(landingBlob()).toMatch(/Pokémon Champions/i);
  });

  it("does not claim eleven/six scopes, National Dex default, Gens 1–4 in/out, or Smogon OU", () => {
    const blob = landingBlob();
    const lower = blob.toLowerCase();
    expect(lower).not.toContain("eleven");
    expect(lower).not.toContain("six data scopes");
    expect(lower).not.toContain("six scopes");
    expect(lower).not.toContain("national dex");
    expect(blob).not.toMatch(/generations?\s*1\s*[–-]\s*4/i);
    expect(lower).not.toContain("smogon");
    expect(lower).not.toContain("gen9ou");
    expect(lower).not.toContain("every generation");
    expect(LANDING_FEATURES.map((f) => f.title).join(" ")).not.toMatch(
      /scope/i,
    );
  });

  it("FAQ may explain Champions and that Oak covers only that game", () => {
    expect(LANDING_FAQ.length).toBeGreaterThan(0);
    const faq = LANDING_FAQ.map((e) => `${e.q} ${e.a}`).join("\n");
    expect(faq).toMatch(/Pokémon Champions/i);
    expect(faq).not.toMatch(/Scarlet/i);
    expect(faq).not.toMatch(/National Dex/i);
    expect(faq).not.toMatch(/\bGen [1-8]\b/);
  });
});

describe("landing-content — disclaimer (CF-UI-BR-4)", () => {
  it("keeps the independent fan-project / non-affiliation line", () => {
    expect(LANDING_DISCLAIMER).toMatch(/independent fan project/i);
    expect(LANDING_DISCLAIMER).toMatch(/Nintendo/);
    expect(LANDING_DISCLAIMER).toMatch(/Game Freak/);
    expect(LANDING_DISCLAIMER).toMatch(/Creatures/);
    expect(LANDING_DISCLAIMER).toMatch(/Pokémon Company/);
  });
});
