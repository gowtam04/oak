/**
 * `runCalc` — resolve + stats + estimateDamage + spreads + old-gen caveat.
 *
 * Production module is not required to exist yet — a failed resolve is the
 * intended red (P2 TDD).
 *
 * Integration checkpoint (implementation-plan after P2): Garchomp Earthquake
 * vs a seeded defender returns a range + `is_estimate`. Uses Testcontainers +
 * `createPgSchema({ seed: "tools" })` + `installAsSingleton` so species/move
 * resolve from the real index. SV `move/earthquake` is layered in `after`
 * (same pattern as `learnset/route.test.ts` — the tools seed keeps that
 * resource_key for champions only).
 *
 * Requirement refs: CALC-US-4, CALC-US-5, CALC-US-6, CALC-AC-4.2–4.4,
 * CALC-AC-5.1–5.4, CALC-AC-6.3, CALC-BR-1, CALC-BR-2, CALC-BR-3, CALC-BR-6,
 * CALC-BR-8. ADR-3, ADR-14.
 */

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// installAsSingleton → resolve-index → @/data/db (`server-only`). Same harness
// mock as the other DB-backed node suites; this file otherwise never loads the
// Next server graph.
vi.mock("server-only", () => ({}));

import {
  ingest_meta,
  pokemon,
  reference_cache,
  searchable_names,
} from "@/data/schema";
import {
  POKEMON_SEED,
  REFERENCE_CACHE_SEED,
} from "../../../test/fixtures/tools-fixture";
import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../test/support/pg";

import { runCalc } from "./calc-engine";

const SV = "scarlet-violet";

const EARTHQUAKE = {
  found: true,
  display_name: "Earthquake",
  type: "ground",
  damage_class: "physical",
  power: 100,
  accuracy: 100,
  pp: 10,
  priority: 0,
  target: "all-other-pokemon",
  effect_short: "Hits every other Pokémon on the field.",
  effect_full: "Inflicts regular damage on every other active Pokémon.",
};

const WILL_O_WISP = {
  found: true,
  display_name: "Will-O-Wisp",
  type: "fire",
  damage_class: "status",
  power: null,
  accuracy: 85,
  pp: 15,
  priority: 0,
  target: "selected-pokemon",
  effect_short: "Burns the target.",
  effect_full: "Burns the target.",
};

/** Loose on purpose: incomplete payloads are a runtime contract (CALC-BR-8). */
function scenario(overrides: Record<string, unknown> = {}) {
  return {
    format: SV,
    attacker: { species: "garchomp" },
    defender: { species: "farigiraf" },
    move: { slug: "earthquake" },
    ...overrides,
  } as Parameters<typeof runCalc>[0];
}

let fix: PgFixture;

beforeAll(async () => {
  fix = await createPgSchema({
    seed: "tools",
    after: async (db) => {
      await db.insert(reference_cache).values({
        format: SV,
        resource_key: "move/earthquake",
        resource_kind: "move",
        payload: JSON.stringify(EARTHQUAKE),
        endpoint_url: "@pkmn/dex (Pokémon Showdown)",
        fetched_at: 0,
      });
      await db.insert(reference_cache).values({
        format: SV,
        resource_key: "move/will-o-wisp",
        resource_kind: "move",
        payload: JSON.stringify(WILL_O_WISP),
        endpoint_url: "@pkmn/dex (Pokémon Showdown)",
        fetched_at: 0,
      });

      // gen-1 slice so CALC-BR-6 can run a modern estimate (tools seed has no
      // gen-1 rows). Copy the shared SV species the happy path already uses.
      const gen1Mons = POKEMON_SEED.filter(
        (p) => p.id === "garchomp" || p.id === "farigiraf",
      );
      await db.insert(pokemon).values(gen1Mons.map((p) => ({ ...p, format: "gen-1" })));
      await db.insert(searchable_names).values([
        {
          format: "gen-1",
          kind: "pokemon",
          slug: "garchomp",
          display_name: "Garchomp",
        },
        {
          format: "gen-1",
          kind: "pokemon",
          slug: "farigiraf",
          display_name: "Farigiraf",
        },
        {
          format: "gen-1",
          kind: "move",
          slug: "earthquake",
          display_name: "Earthquake",
        },
      ]);
      await db.insert(reference_cache).values({
        format: "gen-1",
        resource_key: "move/earthquake",
        resource_kind: "move",
        payload: JSON.stringify(EARTHQUAKE),
        endpoint_url: "@pkmn/dex (Pokémon Showdown)",
        fetched_at: 0,
      });
      const groundChart = REFERENCE_CACHE_SEED.find(
        (r) => r.resource_key === "type/ground",
      );
      if (groundChart) {
        await db.insert(reference_cache).values({
          format: "gen-1",
          resource_key: groundChart.resource_key,
          resource_kind: groundChart.resource_kind,
          payload: JSON.stringify(groundChart.payload),
          endpoint_url: groundChart.endpoint_url,
          fetched_at: 0,
        });
      }
      await db.insert(reference_cache).values({
        format: SV,
        resource_key: "type/fire",
        resource_kind: "type",
        payload: JSON.stringify({
          found: true,
          types: ["fire"],
          offensive: {
            super_effective_against: ["grass", "ice", "bug", "steel"],
            not_very_effective_against: ["fire", "water", "rock", "dragon"],
            no_effect_against: [],
          },
          defensive: {
            weak_to: ["water", "ground", "rock"],
            resists: ["fire", "grass", "ice", "bug", "steel", "fairy"],
            immune_to: [],
          },
        }),
        endpoint_url: "@pkmn/dex (Pokémon Showdown)",
        fetched_at: 0,
      });
      await db.insert(ingest_meta).values({
        format: "gen-1",
        last_success_at: Date.now(),
        pokemon_count: gen1Mons.length,
        learnset_count: 0,
        names_count: 3,
        schema_version: "2",
      });
    },
  });
  await installAsSingleton(fix);
});

afterAll(async () => {
  await fix?.cleanup?.();
});

describe("runCalc — incomplete / status / unresolved (CALC-BR-8, CALC-AC-5.3, CALC-AC-5.4)", () => {
  it("returns { ok: false, error: \"incomplete\" } when a side species is missing — never a fake 0 roll (CALC-BR-8)", async () => {
    const missingAttacker = await runCalc(
      scenario({ attacker: {} }),
    );
    expect(missingAttacker).toMatchObject({ ok: false, error: "incomplete" });
    expect(missingAttacker).not.toMatchObject({ ok: true });
    expect(
      "estimate" in missingAttacker ? missingAttacker.estimate : undefined,
    ).toBeUndefined();

    const missingDefender = await runCalc(
      scenario({ defender: {} }),
    );
    expect(missingDefender).toMatchObject({ ok: false, error: "incomplete" });
    expect(
      "estimate" in missingDefender ? missingDefender.estimate : undefined,
    ).toBeUndefined();
  });

  it("returns { ok: false, error: \"incomplete\" } when move identity is missing — never a fake 0 roll (CALC-BR-8)", async () => {
    const result = await runCalc(scenario({ move: {} }));
    expect(result).toMatchObject({ ok: false, error: "incomplete" });
    expect("estimate" in result ? result.estimate : undefined).toBeUndefined();
  });

  it("returns { ok: false, error: \"status_move\" } with no damage range (CALC-AC-5.3)", async () => {
    const result = await runCalc(
      scenario({ move: { slug: "will-o-wisp", category: "status" } }),
    );
    expect(result).toMatchObject({ ok: false, error: "status_move" });
    expect("estimate" in result ? result.estimate : undefined).toBeUndefined();
  });

  it("returns { ok: false, error: \"unresolved\" } when a species is not in the format", async () => {
    const result = await runCalc(
      scenario({ attacker: { species: "not-a-real-mon" } }),
    );
    expect(result).toMatchObject({ ok: false, error: "unresolved" });
    expect(result).not.toMatchObject({ ok: true });
  });
});

describe("runCalc — Garchomp Earthquake vs Farigiraf (CALC-US-5, CALC-AC-4.4, CALC-AC-5.1, CALC-BR-1, CALC-BR-2)", () => {
  it("returns ok: true, a damage range, and is_estimate: true with no model", async () => {
    const result = await runCalc(scenario());
    expect(result).toMatchObject({
      ok: true,
      format: SV,
      estimate: { is_estimate: true },
    });
    if (!("estimate" in result) || !result.ok) return;
    expect(result.estimate.min_damage).toBeGreaterThan(0);
    expect(result.estimate.max_damage).toBeGreaterThanOrEqual(
      result.estimate.min_damage,
    );
    expect(result.estimate.percent_min).toBeGreaterThan(0);
    expect(result.estimate.percent_max).toBeGreaterThanOrEqual(
      result.estimate.percent_min,
    );
    expect(result.estimate.ko.hits).toBeGreaterThanOrEqual(1);
    expect(typeof result.breakdown).toBe("string");
    expect(result.breakdown.length).toBeGreaterThan(0);
    expect(Array.isArray(result.applied.unsupported)).toBe(true);
  });
});

describe("runCalc — modifier catalog (CALC-BR-3, CALC-AC-4.3)", () => {
  it("applies Life Orb (other_modifier reflects it; item named in applied)", async () => {
    const baseline = await runCalc(scenario());
    const withOrb = await runCalc(
      scenario({ attacker: { species: "garchomp", item: "life-orb" } }),
    );
    expect(baseline).toMatchObject({ ok: true });
    expect(withOrb).toMatchObject({ ok: true });
    if (!baseline.ok || !withOrb.ok) return;
    expect(withOrb.applied.other_modifier).not.toBe(1);
    expect(withOrb.applied.other_modifier).toBeGreaterThan(
      baseline.applied.other_modifier,
    );
    expect(String(withOrb.applied.item ?? "").toLowerCase()).toMatch(
      /life[\s-]?orb/,
    );
    expect(
      withOrb.applied.unsupported.map((s) => s.toLowerCase()),
    ).not.toContain("life-orb");
  });

  it("lists Leftovers and an unknown ability in unsupported[] and does not fold them into other_modifier (CALC-BR-3)", async () => {
    const baseline = await runCalc(scenario());
    const leftover = await runCalc(
      scenario({
        attacker: {
          species: "garchomp",
          item: "leftovers",
          ability: "multiscale",
        },
      }),
    );
    expect(leftover).toMatchObject({ ok: true });
    if (!baseline.ok || !leftover.ok) return;
    const unsupported = leftover.applied.unsupported.map((s) =>
      s.toLowerCase().replace(/-/g, " "),
    );
    expect(unsupported.some((s) => s.includes("leftovers"))).toBe(true);
    expect(unsupported.some((s) => s.includes("multiscale"))).toBe(true);
    expect(leftover.applied.other_modifier).toBe(
      baseline.applied.other_modifier,
    );
  });
});

describe("runCalc — old-gen caveat (CALC-BR-6, CALC-AC-6.3, ADR-14)", () => {
  it("returns a modern estimate with caveat set for a gen-1 request (does not fail closed)", async () => {
    const result = await runCalc(scenario({ format: "gen-1" }));
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.estimate.is_estimate).toBe(true);
    expect(result.estimate.min_damage).toBeGreaterThan(0);
    expect(result.caveat).toBeTruthy();
    if (result.ok && result.caveat) {
      expect(typeof result.caveat).toBe("string");
      // ADR-14 names `modern_estimate`; a user-visible sentence is also allowed.
      expect(
        result.caveat === "modern_estimate" || result.caveat.length > 0,
      ).toBe(true);
    }
  });
});

describe("runCalc — common_spreads only on default defender EVs (CALC-AC-5.2)", () => {
  it("includes min / bulky / max spreads when defender EVs are omitted", async () => {
    const result = await runCalc(scenario());
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.common_spreads).toBeDefined();
    const labels = (result.common_spreads ?? []).map((row) => row.label);
    expect(labels).toEqual(["min", "bulky", "max"]);
    for (const row of result.common_spreads ?? []) {
      expect(row.estimate.min_damage).toBeGreaterThan(0);
      expect(row.estimate.max_damage).toBeGreaterThanOrEqual(
        row.estimate.min_damage,
      );
      expect(row.estimate.ko.hits).toBeGreaterThanOrEqual(1);
    }
  });

  it("omits common_spreads when the defender EVs have been edited off the format default", async () => {
    const result = await runCalc(
      scenario({
        defender: { species: "farigiraf", evs: { hp: 252 } },
      }),
    );
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.common_spreads).toBeUndefined();
  });
});

describe("runCalc — type chart honesty (CALC-BR-3, CALC-AC-5.3)", () => {
  it("returns incomplete when the move type chart is missing — does not invent 1×", async () => {
    const result = await runCalc(
      scenario({
        attacker: { species: "ninetales" },
        move: { slug: "flamethrower", type: "fairy" },
      }),
    );
    expect(result).toMatchObject({ ok: false, error: "incomplete" });
    expect("estimate" in result ? result.estimate : undefined).toBeUndefined();
  });
});

describe("runCalc — sand/snow are defensive stat boosts (CALC-BR-3)", () => {
  it("snow boosts Ice-type defender Def (physical hit deals less)", async () => {
    const sides = {
      attacker: { species: "garchomp" },
      defender: { species: "farigiraf", tera: "ice" },
      move: { slug: "earthquake" },
    };
    const clear = await runCalc(scenario(sides));
    const snow = await runCalc(
      scenario({ ...sides, field: { weather: "snow" } }),
    );
    expect(clear).toMatchObject({ ok: true });
    expect(snow).toMatchObject({ ok: true });
    if (!clear.ok || !snow.ok) return;
    expect(snow.applied.weather).toBe("snow");
    expect(snow.applied.other_modifier).toBe(clear.applied.other_modifier);
    expect(snow.estimate.max_damage).toBeLessThan(clear.estimate.max_damage);
  });

  it("sand boosts Rock-type defender SpD (special hit deals less)", async () => {
    const sides = {
      attacker: { species: "ninetales" },
      defender: { species: "farigiraf", tera: "rock" },
      move: { slug: "flamethrower" },
    };
    const clear = await runCalc(scenario(sides));
    const sand = await runCalc(
      scenario({ ...sides, field: { weather: "sand" } }),
    );
    expect(clear).toMatchObject({ ok: true });
    expect(sand).toMatchObject({ ok: true });
    if (!clear.ok || !sand.ok) return;
    expect(sand.applied.weather).toBe("sand");
    expect(sand.applied.other_modifier).toBe(clear.applied.other_modifier);
    expect(sand.estimate.max_damage).toBeLessThan(clear.estimate.max_damage);
  });

  it("sand does not invent an offensive Rock boost on a physical Ground hit", async () => {
    const clear = await runCalc(scenario());
    const sand = await runCalc(scenario({ field: { weather: "sand" } }));
    expect(clear).toMatchObject({ ok: true });
    expect(sand).toMatchObject({ ok: true });
    if (!clear.ok || !sand.ok) return;
    expect(sand.applied.weather).toBe("sand");
    expect(sand.applied.other_modifier).toBe(clear.applied.other_modifier);
    expect(sand.estimate.min_damage).toBe(clear.estimate.min_damage);
    expect(sand.estimate.max_damage).toBe(clear.estimate.max_damage);
  });
});
