import { describe, expect, it } from "vitest";

import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  WEB_APP_JSONLD,
} from "./site";

/**
 * Public site/SEO copy (CF-INT-BR-10, CF-AS-9, CF-UI-BR-1, CF-UI-BR-3).
 */

describe("site identity — Champions coach (CF-INT-BR-10, CF-AS-9)", () => {
  it("keeps the product name Oak", () => {
    expect(SITE_NAME).toBe("Oak");
    expect(SITE_TITLE).toMatch(/Oak/);
  });

  it("title and description describe Oak as a Pokémon Champions coach", () => {
    expect(SITE_TITLE).toMatch(/Champions/i);
    expect(SITE_DESCRIPTION).toMatch(/Champions/i);
  });

  it("does not claim every generation, National Dex default, or Smogon OU", () => {
    const blob = `${SITE_TITLE}\n${SITE_DESCRIPTION}`;
    expect(blob).not.toMatch(/every generation/i);
    expect(blob).not.toMatch(/national\s*dex/i);
    expect(blob).not.toMatch(/\bsmogon\b/i);
    expect(blob).not.toMatch(/\beleven\b/i);
    expect(blob).not.toMatch(/\bsix (?:data )?scopes?\b/i);
  });

  it("JSON-LD reuses the Champions site description under the Oak name", () => {
    const parsed = JSON.parse(WEB_APP_JSONLD) as {
      name: string;
      description: string;
    };
    expect(parsed.name).toBe("Oak");
    expect(parsed.description).toBe(SITE_DESCRIPTION);
    expect(parsed.description).toMatch(/Champions/i);
  });
});
