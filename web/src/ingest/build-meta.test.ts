/**
 * build-meta.test.ts — unit tests for the pure chaos→warehouse transform.
 *
 * No DB: loads the committed `meta-chaos-sample.json` fixture (6 interlinked
 * gen9ou species, trimmed from a real 2026-06 chaos file — see its header) and
 * a hand-rolled resolver. Every expected number is computed BY HAND from the
 * fixture's own values (the trim changed category sums, so live-file numbers
 * do not apply). The resolver deliberately omits one Pokémon ("Darkrai") and
 * one move ("brickbreak") to exercise the unresolved-name fallback + warning.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildMetaRows,
  normalizeName,
  type BuildMetaOpts,
  type NameResolver,
  type NameResolverEntry,
} from "./build-meta";

const fixturePath = fileURLToPath(
  new URL("../../test/fixtures/meta-chaos-sample.json", import.meta.url),
);
const chaos = JSON.parse(readFileSync(fixturePath, "utf8")) as {
  info: Record<string, unknown>;
  data: Record<string, Record<string, unknown>>;
};

/** Local replica of build-meta's fallback slug — used to derive expectations. */
function slugifyKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Build a resolver from the fixture itself — every display name / id gets a
 * canonical entry — then delete the two deliberate omissions and override a
 * couple of names with clearly-canonical values (so a resolved element reads
 * distinctly from a fallback one).
 */
function buildResolver(): NameResolver {
  const pokemon = new Map<string, NameResolverEntry>();
  const moves = new Map<string, NameResolverEntry>();
  const abilities = new Map<string, NameResolverEntry>();
  const items = new Map<string, NameResolverEntry>();

  const addPokemon = (display: string) =>
    pokemon.set(normalizeName(display), { slug: slugifyKey(display), name: display });

  for (const [name, entry] of Object.entries(chaos.data)) {
    addPokemon(name);
    for (const t of Object.keys((entry.Teammates as object) ?? {})) addPokemon(t);
    for (const c of Object.keys((entry["Checks and Counters"] as object) ?? {})) addPokemon(c);
    for (const m of Object.keys((entry.Moves as object) ?? {})) {
      if (normalizeName(m).length > 0) moves.set(normalizeName(m), { slug: m, name: m });
    }
    for (const a of Object.keys((entry.Abilities as object) ?? {})) {
      abilities.set(normalizeName(a), { slug: a, name: a });
    }
    for (const it of Object.keys((entry.Items as object) ?? {})) {
      items.set(normalizeName(it), { slug: it, name: it });
    }
  }

  // Canonical overrides for clean "resolved, not fallback" assertions.
  moves.set(normalizeName("suckerpunch"), { slug: "sucker-punch", name: "Sucker Punch" });
  abilities.set(normalizeName("supremeoverlord"), {
    slug: "supreme-overlord",
    name: "Supreme Overlord",
  });

  // Deliberate omissions → fallback + warning.
  moves.delete(normalizeName("brickbreak"));
  pokemon.delete(normalizeName("Darkrai"));

  return { pokemon, moves, abilities, items };
}

const OPTS: Omit<BuildMetaOpts, "resolver"> = {
  metaFormat: "gen9ou",
  month: "2026-06",
  smogonFormatId: "gen9ou",
  cutoff: 1695,
  sourceUrl: "https://www.smogon.com/stats/2026-06/chaos/gen9ou-1695.json",
  fetchedAt: 1_720_000_000_000,
};

function build() {
  return buildMetaRows(chaos, { ...OPTS, resolver: buildResolver() });
}

type NamedPct = { name: string; slug: string; pct: number };
type SpreadEntry = { nature: string; evs: string; pct: number };
type CounterEntry = {
  name: string;
  slug: string;
  score: number;
  ko_or_switch_pct: number;
  n: number;
};

function usageFor(species: string) {
  const row = build().usage.find((u) => u.display_name === species);
  if (!row) throw new Error(`no usage row for ${species}`);
  return row;
}

describe("buildMetaRows — snapshot", () => {
  it("carries the opts + info-derived snapshot fields", () => {
    const { snapshot, usage } = build();
    expect(snapshot.meta_format).toBe("gen9ou");
    expect(snapshot.month).toBe("2026-06");
    expect(snapshot.smogon_format_id).toBe("gen9ou");
    expect(snapshot.cutoff).toBe(1695);
    expect(snapshot.source_url).toBe(OPTS.sourceUrl);
    expect(snapshot.fetched_at).toBe(OPTS.fetchedAt);
    // info["number of battles"] in the fixture.
    expect(snapshot.total_battles).toBe(767456);
    // species_count === number of usage rows.
    expect(snapshot.species_count).toBe(6);
    expect(snapshot.species_count).toBe(usage.length);
  });
});

describe("buildMetaRows — usage rank & ordering", () => {
  it("ranks species 1-based by usage desc", () => {
    const { usage } = build();
    expect(usage.map((u) => u.display_name)).toEqual([
      "Great Tusk", // 0.32830
      "Kingambit", // 0.23893
      "Zamazenta", // 0.22418
      "Slowking-Galar", // 0.13184
      "Corviknight", // 0.11474
      "Darkrai", // 0.09474
    ]);
    expect(usage.map((u) => u.rank)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("computes usage_pct = usage × 100, rounded to 2dp", () => {
    expect(usageFor("Great Tusk").usage_pct).toBe(32.83);
    expect(usageFor("Kingambit").usage_pct).toBe(23.89);
  });

  it("passes through Raw count as raw_count", () => {
    expect(usageFor("Kingambit").raw_count).toBe(327248);
  });
});

describe("buildMetaRows — moves normalization (÷ Σ/4, blank-slot excluded)", () => {
  it("normalizes each move by Σ(Moves)/4 and rounds to 2dp", () => {
    const moves = JSON.parse(usageFor("Kingambit").moves) as NamedPct[];
    // Σ(Kingambit Moves incl "") = 122284.8599 → denom = 30571.21497.
    // suckerpunch 30595.7959 / 30571.21497 × 100 = 100.08 (a mon can carry a
    // move in ~every set, so pct can exceed 100 against a per-slot denominator).
    const sucker = moves.find((m) => m.slug === "sucker-punch");
    expect(sucker).toEqual({ name: "Sucker Punch", slug: "sucker-punch", pct: 100.08 });
    // swordsdance 29844.9904 / 30571.21497 × 100 = 97.62.
    expect(moves.find((m) => m.name === "swordsdance")?.pct).toBe(97.62);
    // ironhead 26246.2427 / 30571.21497 × 100 = 85.85.
    expect(moves.find((m) => m.name === "ironhead")?.pct).toBe(85.85);
  });

  it("excludes the blank move-slot key and keeps it in the denominator", () => {
    const moves = JSON.parse(usageFor("Kingambit").moves) as NamedPct[];
    // Fixture Kingambit Moves has 8 keys incl "" → 7 real moves emitted.
    expect(moves).toHaveLength(7);
    expect(moves.every((m) => m.slug.length > 0 && m.name.length > 0)).toBe(true);
    // Highest-pct move is first.
    expect(moves[0].slug).toBe("sucker-punch");
  });
});

describe("buildMetaRows — abilities normalization (÷ Σ)", () => {
  it("normalizes an ability by Σ(Abilities) and resolves its canonical name", () => {
    const abilities = JSON.parse(usageFor("Kingambit").abilities) as NamedPct[];
    // supremeoverlord 30110.4078 / 30702.5319 × 100 = 98.07.
    expect(abilities[0]).toEqual({
      name: "Supreme Overlord",
      slug: "supreme-overlord",
      pct: 98.07,
    });
  });
});

describe("buildMetaRows — spreads parse (nature/evs/pct)", () => {
  it("splits 'Nature:evs' and normalizes by Σ(Spreads)", () => {
    const spreads = JSON.parse(usageFor("Kingambit").spreads) as SpreadEntry[];
    // Top spread by pct: "Adamant:0/252/4/0/0/252" → 34.43.
    expect(spreads[0]).toEqual({
      nature: "Adamant",
      evs: "0/252/4/0/0/252",
      pct: 34.43,
    });
  });
});

describe("buildMetaRows — counters (score/ko_or_switch_pct/n, sorted by score)", () => {
  it("computes score = (p − 4d)×100, ko_or_switch_pct = p×100, sorted desc", () => {
    const counters = JSON.parse(usageFor("Kingambit").counters) as CounterEntry[];
    // Fixture order is Corviknight-first, but Volcanion wins on score.
    // Volcanion: p 0.598869, d 0.036949 → (0.598869 − 0.147796)×100 = 45.11.
    expect(counters[0]).toEqual({
      name: "Volcanion",
      slug: "volcanion",
      score: 45.11,
      ko_or_switch_pct: 59.89,
      n: 175.96,
    });
    // Corviknight: p 0.486557, d 0.015274 → 42.55; ko 48.66; n 1070.80.
    const corv = counters.find((c) => c.slug === "corviknight");
    expect(corv).toEqual({
      name: "Corviknight",
      slug: "corviknight",
      score: 42.55,
      ko_or_switch_pct: 48.66,
      n: 1070.8,
    });
    // Sorted strictly descending by score.
    const scores = counters.map((c) => c.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});

describe("buildMetaRows — items (nothing→None, resolved)", () => {
  it("maps the itemless 'nothing' key to {name:'None', slug:'nothing'} without a warning", () => {
    const { usage, warnings } = build();
    const tusk = usage.find((u) => u.display_name === "Great Tusk")!;
    const items = JSON.parse(tusk.items) as NamedPct[];
    const none = items.find((i) => i.slug === "nothing");
    // nothing 4000 / Σ(Items 44802.3447) × 100 = 8.93.
    expect(none).toEqual({ name: "None", slug: "nothing", pct: 8.93 });
    expect(warnings.some((w) => w.includes("nothing"))).toBe(false);
  });
});

describe("buildMetaRows — unresolved-name fallback + warnings", () => {
  it("falls back to a slugified/prettified key and warns (deduped) for an unresolved species", () => {
    const { usage, warnings } = build();
    const darkrai = usage.find((u) => u.display_name === "Darkrai")!;
    // Resolver omits Darkrai → species slug is the slugified display name.
    expect(darkrai.species).toBe("darkrai");
    expect(warnings).toContain('unresolved species: "Darkrai"');
  });

  it("falls back + warns for an unresolved move", () => {
    const { usage, warnings } = build();
    const kingambit = usage.find((u) => u.display_name === "Kingambit")!;
    const moves = JSON.parse(kingambit.moves) as NamedPct[];
    const brick = moves.find((m) => m.slug === "brickbreak");
    // Omitted from the resolver → prettified id name, slugified id slug.
    expect(brick).toMatchObject({ name: "Brickbreak", slug: "brickbreak" });
    expect(warnings).toContain('unresolved move: "brickbreak"');
  });

  it("dedupes repeated warnings", () => {
    const { warnings } = build();
    expect(new Set(warnings).size).toBe(warnings.length);
  });
});

describe("buildMetaRows — truncation caps", () => {
  // Synthetic chaos: categories deliberately larger than every cap.
  function bigChaos() {
    const moves: Record<string, number> = {};
    for (let i = 0; i < 20; i++) moves[`move${i}`] = 20 - i;
    const items: Record<string, number> = {};
    for (let i = 0; i < 20; i++) items[`item${i}`] = 20 - i;
    const abilities: Record<string, number> = {};
    for (let i = 0; i < 20; i++) abilities[`ability${i}`] = 20 - i;
    const spreads: Record<string, number> = {};
    for (let i = 0; i < 14; i++) spreads[`Adamant:${i}/0/0/0/0/0`] = 14 - i;
    const teammates: Record<string, number> = {};
    for (let i = 0; i < 16; i++) teammates[`Mon${i}`] = 16 - i;
    const counters: Record<string, { n: number; p: number; d: number }> = {};
    for (let i = 0; i < 14; i++) counters[`Foe${i}`] = { n: 100, p: (14 - i) / 20, d: 0.01 };
    return {
      info: { "number of battles": 1000 },
      data: {
        Testmon: {
          "Raw count": 500,
          usage: 0.5,
          Moves: moves,
          Items: items,
          Abilities: abilities,
          Spreads: spreads,
          Teammates: teammates,
          "Checks and Counters": counters,
        },
      },
    };
  }

  it("caps each category at its documented top-N", () => {
    const emptyResolver: NameResolver = {
      pokemon: new Map(),
      moves: new Map(),
      abilities: new Map(),
      items: new Map(),
    };
    const { usage } = buildMetaRows(bigChaos(), { ...OPTS, resolver: emptyResolver });
    const row = usage[0];
    expect(JSON.parse(row.moves)).toHaveLength(15);
    expect(JSON.parse(row.items)).toHaveLength(15);
    expect(JSON.parse(row.abilities)).toHaveLength(15);
    expect(JSON.parse(row.spreads)).toHaveLength(10);
    expect(JSON.parse(row.teammates)).toHaveLength(12);
    expect(JSON.parse(row.counters)).toHaveLength(10);
  });
});

describe("buildMetaRows — malformed input", () => {
  const resolver: NameResolver = {
    pokemon: new Map(),
    moves: new Map(),
    abilities: new Map(),
    items: new Map(),
  };

  it("throws on a non-object top level", () => {
    expect(() => buildMetaRows(null, { ...OPTS, resolver })).toThrow(/top level/);
    expect(() => buildMetaRows("nope", { ...OPTS, resolver })).toThrow(/top level/);
  });

  it("throws on missing data / info", () => {
    expect(() => buildMetaRows({ info: {} }, { ...OPTS, resolver })).toThrow(/"data"/);
    expect(() => buildMetaRows({ data: {} }, { ...OPTS, resolver })).toThrow(/"info"/);
  });

  it("throws on a species entry missing a numeric usage", () => {
    const bad = { info: {}, data: { Testmon: { "Raw count": 1 } } };
    expect(() => buildMetaRows(bad, { ...OPTS, resolver })).toThrow(/usage/);
  });
});
