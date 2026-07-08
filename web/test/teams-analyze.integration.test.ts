/**
 * Integration tests for `POST /api/teams/analyze` (#9). Drives the real route
 * handler against a real migrated + seeded Postgres schema (Testcontainers),
 * mirroring test/entity-api.integration.test.ts.
 *
 * Asserts: a happy team → 200 `ok` with computed stats and a sane defensive
 * matrix + offensive coverage; an unknown species degrading per-member to
 * `found: false`; a malformed body → 400; and an unbuilt format partition →
 * `unavailable`. The service reads the `@/data/db` singleton (via the route's
 * dynamic import), so the fixture is installed via `installAsSingleton`.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "./support/pg";
import { seedEntityRefs } from "./fixtures/entity-refs";
import { _resetStoreForTests } from "@/server/rate-limit";

import {
  teamAnalysisResponseSchema,
  type TeamAnalysisResponse,
} from "@/lib/teams/team-analysis";
import type { TeamMember } from "@/data/teams/team-schema";

// Route deps (@/data/db etc.) load dynamically at call time, so a static import
// here does NOT touch @/data/db before installAsSingleton runs.
import { POST } from "@/app/api/teams/analyze/route";

let fix: PgFixture;

beforeAll(async () => {
  fix = await createPgSchema({ seed: "tools", after: seedEntityRefs });
  await installAsSingleton(fix);
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

// Shares the `pub:<ip>` read rate-limit bucket — reset between cases.
beforeEach(() => _resetStoreForTests());

function member(overrides: Partial<TeamMember>): TeamMember {
  return {
    species: null,
    ability: null,
    item: null,
    moves: [],
    nature: null,
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    tera_type: null,
    level: 50,
    ...overrides,
  };
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/teams/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function envelope(res: Response): Promise<TeamAnalysisResponse> {
  expect(res.status).toBe(200);
  return teamAnalysisResponseSchema.parse(await res.json());
}

describe("POST /api/teams/analyze — happy path", () => {
  it("analyzes a resolvable team with computed stats and coverage", async () => {
    const env = await envelope(
      await post({
        format: "scarlet-violet",
        members: [
          member({
            species: "garchomp",
            moves: ["earthquake", "dragon-claw"],
            nature: "jolly",
            evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 },
          }),
        ],
      }),
    );

    if (env.status !== "ok") throw new Error("expected ok");

    // Member readout.
    expect(env.members).toHaveLength(1);
    const chomp = env.members[0]!;
    if (!chomp.found) throw new Error("expected found member");
    expect(chomp.display_name).toBe("Garchomp");
    expect(chomp.types).toEqual(["dragon", "ground"]);
    expect(chomp.bst).toBe(600);
    expect(chomp.stats.spe).not.toBeNull();
    expect(chomp.stats.spe).toBeGreaterThan(0);

    // Defensive matrix: Garchomp is weak to Dragon (dragon×2, ground×1).
    const dragonRow = env.defense.find((r) => r.type === "dragon");
    expect(dragonRow?.weak).toContain("garchomp");

    // Offensive coverage: Dragon Claw makes Dragon super-effectively covered.
    const dragonCov = env.offense.covered.find((c) => c.type === "dragon");
    expect(dragonCov?.by).toContainEqual({
      member: "garchomp",
      move: "dragon-claw",
    });

    // Speed tier present; caveat note surfaced.
    expect(env.speed_tiers.map((t) => t.member)).toContain("garchomp");
    expect(env.notes.length).toBeGreaterThan(0);
  });
});

describe("POST /api/teams/analyze — per-member degradation", () => {
  it("degrades an unknown species to found:false without failing the call", async () => {
    const env = await envelope(
      await post({
        format: "scarlet-violet",
        members: [member({ species: "zzznotapokemon" })],
      }),
    );
    if (env.status !== "ok") throw new Error("expected ok");
    expect(env.members[0]).toEqual({ slug: "zzznotapokemon", found: false });
  });
});

describe("POST /api/teams/analyze — malformed body → 400", () => {
  it("rejects an invalid format", async () => {
    const res = await post({ format: "gen1", members: [] });
    expect(res.status).toBe(400);
  });

  it("rejects a non-array members field", async () => {
    const res = await post({ format: "scarlet-violet", members: "nope" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/teams/analyze — unbuilt partition → unavailable", () => {
  it("returns unavailable when the format's type chart is unbuilt", async () => {
    // The "tools" seed builds scarlet-violet / gen-7 / champions — gen-8 has no
    // index, so its type chart is empty.
    const env = await envelope(
      await post({
        format: "gen-8",
        members: [member({ species: "garchomp" })],
      }),
    );
    expect(env).toEqual({ status: "unavailable", format: "gen-8" });
  });
});
