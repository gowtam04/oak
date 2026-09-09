/**
 * meta-pages loaders are retired with Smogon OU (ADR-5). `/meta` redirects
 * to `/usage`; this file pins that the module no longer talks to meta-repo.
 */

import { describe, expect, it } from "vitest";

import * as metaPages from "@/data/meta-pages";

describe("meta-pages (retired, ADR-5, CF-INT-BR-7)", () => {
  it("no longer exposes Smogon leaderboard loaders", () => {
    expect(metaPages).not.toHaveProperty("loadMetaLeaderboardUncached");
    expect(metaPages).not.toHaveProperty("loadMetaSpeciesUncached");
    expect(metaPages).not.toHaveProperty("loadMetaLeaderboard");
    expect(metaPages).not.toHaveProperty("loadMetaSpecies");
  });
});
