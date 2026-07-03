/**
 * Node-project test for the converged sitemap — exercises the request-time
 * default export (never evaluated at `next build`; the module is
 * `dynamic = "force-dynamic"`) against a real migrated+seeded Postgres schema.
 *
 * Shard 0 is static (no DB touch). Shards 1–4 read the Postgres index via
 * dynamic imports of `@/data/db` + `@/data/reference-pages` inside the
 * function body, resolving the `@/data/db` SINGLETON at request time — so,
 * like `resolve_entity`, the test installs the fixture as that singleton
 * (`installAsSingleton`) rather than injecting a handle directly.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// sitemap.ts transitively imports "@/data/reference-pages" -> "@/data/db",
// both of which `import "server-only"`; neutralize it under the node test env
// (same pattern as src/data/reference-pages.test.ts).
vi.mock("server-only", () => ({}));

import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../test/support/pg";

describe("sitemap (shards 0-4)", () => {
  let fix: PgFixture;

  beforeAll(async () => {
    fix = await createPgSchema({ seed: "tools" });
    await installAsSingleton(fix);
  }, 60_000);

  afterAll(async () => {
    await fix?.cleanup();
  });

  it("shard 0 lists the static pages with absolute oak.gowtam.ai URLs", async () => {
    const sitemap = (await import("./sitemap")).default;
    const entries = await sitemap({ id: 0 });
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.url).toMatch(/^https:\/\/oak\.gowtam\.ai/);
    }
    expect(entries.some((e) => e.url === "https://oak.gowtam.ai/")).toBe(
      true,
    );
    expect(
      entries.some((e) => e.url === "https://oak.gowtam.ai/pokedex"),
    ).toBe(true);
  });

  it("shard 1 lists pokedex detail URLs from the seeded index", async () => {
    const sitemap = (await import("./sitemap")).default;
    const entries = await sitemap({ id: 1 });
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.url).toMatch(/^https:\/\/oak\.gowtam\.ai\/pokedex\//);
    }
    expect(
      entries.some(
        (e) => e.url === "https://oak.gowtam.ai/pokedex/garchomp",
      ),
    ).toBe(true);
  });
});
