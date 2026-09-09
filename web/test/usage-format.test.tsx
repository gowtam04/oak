/**
 * Usage snapshot helpers — local fetched time + split attribution.
 * jsdom project (no Docker); pure functions only.
 */

import { describe, expect, it } from "vitest";

import {
  formatUsageFetchedAtLocal,
  parseUsageAttribution,
} from "@/app/(reference)/usage/usage-format";

describe("formatUsageFetchedAtLocal", () => {
  it("formats in the given time zone without ISO or a trailing Z", () => {
    // 2023-11-14 22:13:20 UTC → 2:13 PM in America/Los_Angeles (PST).
    const formatted = formatUsageFetchedAtLocal(
      1_700_000_000_000,
      "America/Los_Angeles",
      "en-US",
    );
    expect(formatted).not.toMatch(/Z/);
    expect(formatted).not.toMatch(/T/);
    expect(formatted).not.toContain("2023-11-14");
    expect(formatted).not.toContain("UTC");
    expect(formatted).toContain("2023");
    expect(formatted).toMatch(/Nov/);
    expect(formatted).toContain("2:13");
  });

  it("omits Z even when the zone is UTC", () => {
    const formatted = formatUsageFetchedAtLocal(
      1_700_000_000_000,
      "UTC",
      "en-US",
    );
    expect(formatted).not.toMatch(/Z/);
    expect(formatted).not.toContain("2023-11-14");
    expect(formatted).toContain("2023");
  });
});

describe("parseUsageAttribution", () => {
  it("splits an em-dash attribution into source and legal", () => {
    const parts = parseUsageAttribution(
      "championsbattledata.com — a community-maintained Pokémon Champions project (not affiliated with Nintendo / Game Freak / The Pokémon Company).",
    );
    expect(parts.source).toBe("championsbattledata.com");
    expect(parts.legal).toMatch(/not affiliated/);
    expect(parts.legal).toMatch(/Nintendo/);
  });

  it("treats a domain-only string as source with no legal line", () => {
    const parts = parseUsageAttribution("championsbattledata.com");
    expect(parts.source).toBe("championsbattledata.com");
    expect(parts.legal).toBeNull();
  });
});
