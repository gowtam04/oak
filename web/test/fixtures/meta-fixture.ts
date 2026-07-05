/**
 * Deterministic fixture seed for the B-5 meta (`meta_snapshot`/`meta_usage`)
 * read layer's oracle tests (`src/data/repos/meta-repo.oracle.test.ts`,
 * `src/data/meta-pages.test.ts`).
 *
 * This file is NOT a test itself (no `.test.ts` suffix) — it is the shared
 * seed consumed by those suites, mirroring `test/fixtures/tools-fixture.ts`'s
 * shape but scoped to just the two meta tables.
 *
 * Shape: ONE ladder (`"gen9ou"`) × THREE months (`"2026-03"`, `"2026-04"`,
 * `"2026-05"`) × up to six species, hand-picked so month-over-month deltas and
 * trends are assertable without arithmetic surprises:
 *
 *   - `kingambit` — rank 1 in every month; usage 45.0 → 44.2 → 46.1 (the exact
 *     values the plan calls out), so its delta math is a simple subtraction.
 *   - `great-tusk` — climbing: rank 4 → 3 → 2, usage 20.0 → 25.0 → 30.0.
 *   - `gholdengo` — present all three months, gently declining usage.
 *   - `garchomp` — present all three months; ALSO seeded into
 *     `searchable_names` under `scarlet-violet` by `test/fixtures/tools-fixture.ts`
 *     (seed: "tools"), so it's the `hasDexPage: true` probe.
 *   - `iron-valiant` — present in '2026-03' and '2026-04' only; DROPS OUT of
 *     '2026-05' (the "no longer ranked" case).
 *   - `dragapult` — present ONLY in '2026-05'; a brand-new arrival with no
 *     prior month row (`prev_usage_pct`/delta must read null, not 0).
 *
 * `kingambit` doubles as the showdown-export fixture: its '2026-05' row's top
 * item/ability/spread/moves are chosen to produce an exact, pinned Showdown
 * export string in `meta-pages.test.ts`.
 */

import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/data/schema";
import { meta_snapshot, meta_usage } from "@/data/schema";

/** The Drizzle handle shape this seeder needs (matches `test/support/pg.ts`'s `PgDb`). */
export type MetaFixtureDb = NodePgDatabase<typeof schema>;

const GEN9OU = "gen9ou";
const SMOGON_FORMAT_ID = "gen9ou";
const CUTOFF = 1695;

/** One JSON-column usage entry, `{name, slug, pct}` (moves/items/abilities/teammates shape). */
export interface FixtureNamedUsage {
  name: string;
  slug: string;
  pct: number;
}

/** One spread usage entry. */
export interface FixtureSpreadUsage {
  nature: string;
  evs: string;
  pct: number;
}

/**
 * One checks-and-counters entry — corrected shape per the data-source probe:
 * the chaos JSON only carries `{n, p, d}` per counter, so `score` and
 * `ko_or_switch_pct` are derived (score = (p-4d)x100, ko_or_switch_pct = px100),
 * with no separate KO-vs-switch split.
 */
export interface FixtureCounterUsage {
  name: string;
  slug: string;
  score: number;
  ko_or_switch_pct: number;
  n: number;
}

interface FixtureUsageRow {
  month: string;
  species: string;
  display_name: string;
  rank: number;
  usage_pct: number;
  raw_count: number;
  moves: FixtureNamedUsage[];
  items: FixtureNamedUsage[];
  abilities: FixtureNamedUsage[];
  spreads: FixtureSpreadUsage[];
  teammates: FixtureNamedUsage[];
  counters: FixtureCounterUsage[];
}

/** Generic small usage payload, varied slightly per row via a seed offset. */
function genericMoves(offset: number): FixtureNamedUsage[] {
  return [
    { name: "Move A", slug: "move-a", pct: 60 + offset },
    { name: "Move B", slug: "move-b", pct: 40 + offset },
    { name: "Move C", slug: "move-c", pct: 25 + offset },
  ];
}
function genericItems(offset: number): FixtureNamedUsage[] {
  return [
    { name: "Leftovers", slug: "leftovers", pct: 50 + offset },
    { name: "Heavy-Duty Boots", slug: "heavy-duty-boots", pct: 30 + offset },
  ];
}
function genericAbilities(offset: number): FixtureNamedUsage[] {
  return [{ name: "Some Ability", slug: "some-ability", pct: 90 + offset }];
}
function genericSpreads(offset: number): FixtureSpreadUsage[] {
  return [
    { nature: "Adamant", evs: "0/252/4/0/0/252", pct: 40 + offset },
    { nature: "Jolly", evs: "0/252/0/0/4/252", pct: 20 + offset },
  ];
}
function genericTeammates(offset: number): FixtureNamedUsage[] {
  return [
    { name: "Great Tusk", slug: "great-tusk", pct: 30 + offset },
    { name: "Gholdengo", slug: "gholdengo", pct: 20 + offset },
  ];
}
function genericCounters(offset: number): FixtureCounterUsage[] {
  return [
    {
      name: "Great Tusk",
      slug: "great-tusk",
      score: 60 + offset,
      ko_or_switch_pct: 65 + offset,
      n: 1200 + offset,
    },
  ];
}

// ---------------------------------------------------------------------------
// kingambit — rank 1 every month; the exact usage values the plan pins, and
// the pinned Showdown-export fixture (its 2026-05 row's top item/ability/
// spread/moves are chosen deliberately, not generic).
// ---------------------------------------------------------------------------
const KINGAMBIT_ROWS: FixtureUsageRow[] = [
  {
    month: "2026-03",
    species: "kingambit",
    display_name: "Kingambit",
    rank: 1,
    usage_pct: 45.0,
    raw_count: 45000,
    moves: genericMoves(0),
    items: genericItems(0),
    abilities: genericAbilities(0),
    spreads: genericSpreads(0),
    teammates: genericTeammates(0),
    counters: genericCounters(0),
  },
  {
    month: "2026-04",
    species: "kingambit",
    display_name: "Kingambit",
    rank: 1,
    usage_pct: 44.2,
    raw_count: 44200,
    moves: genericMoves(1),
    items: genericItems(1),
    abilities: genericAbilities(1),
    spreads: genericSpreads(1),
    teammates: genericTeammates(1),
    counters: genericCounters(1),
  },
  {
    month: "2026-05",
    species: "kingambit",
    display_name: "Kingambit",
    rank: 1,
    usage_pct: 46.1,
    raw_count: 46100,
    // Deliberately specific — pinned by meta-pages.test.ts's showdownExport assertion.
    moves: [
      { name: "Sucker Punch", slug: "sucker-punch", pct: 78.5 },
      { name: "Iron Head", slug: "iron-head", pct: 65.2 },
      { name: "Swords Dance", slug: "swords-dance", pct: 54.1 },
      { name: "Kowtow Cleave", slug: "kowtow-cleave", pct: 50.0 },
    ],
    items: [
      { name: "Leftovers", slug: "leftovers", pct: 60.0 },
      { name: "Black Glasses", slug: "black-glasses", pct: 20.0 },
    ],
    abilities: [
      { name: "Supreme Overlord", slug: "supreme-overlord", pct: 95.0 },
    ],
    spreads: [
      { nature: "Adamant", evs: "0/252/4/0/0/252", pct: 40.0 },
      { nature: "Jolly", evs: "0/252/0/0/4/252", pct: 25.0 },
    ],
    teammates: [{ name: "Great Tusk", slug: "great-tusk", pct: 30.0 }],
    counters: [
      {
        name: "Great Tusk",
        slug: "great-tusk",
        score: 60.0,
        ko_or_switch_pct: 68.0,
        n: 1500,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// great-tusk — climbing: rank 4 -> 3 -> 2, usage 20.0 -> 25.0 -> 30.0.
// ---------------------------------------------------------------------------
const GREAT_TUSK_ROWS: FixtureUsageRow[] = [
  {
    month: "2026-03",
    species: "great-tusk",
    display_name: "Great Tusk",
    rank: 4,
    usage_pct: 20.0,
    raw_count: 20000,
    moves: genericMoves(0),
    items: genericItems(0),
    abilities: genericAbilities(0),
    spreads: genericSpreads(0),
    teammates: genericTeammates(0),
    counters: genericCounters(0),
  },
  {
    month: "2026-04",
    species: "great-tusk",
    display_name: "Great Tusk",
    rank: 3,
    usage_pct: 25.0,
    raw_count: 25000,
    moves: genericMoves(1),
    items: genericItems(1),
    abilities: genericAbilities(1),
    spreads: genericSpreads(1),
    teammates: genericTeammates(1),
    counters: genericCounters(1),
  },
  {
    month: "2026-05",
    species: "great-tusk",
    display_name: "Great Tusk",
    rank: 2,
    usage_pct: 30.0,
    raw_count: 30000,
    moves: genericMoves(2),
    items: genericItems(2),
    abilities: genericAbilities(2),
    spreads: genericSpreads(2),
    teammates: genericTeammates(2),
    counters: genericCounters(2),
  },
];

// ---------------------------------------------------------------------------
// gholdengo — present all three months, gently declining.
// ---------------------------------------------------------------------------
const GHOLDENGO_ROWS: FixtureUsageRow[] = [
  {
    month: "2026-03",
    species: "gholdengo",
    display_name: "Gholdengo",
    rank: 2,
    usage_pct: 35.0,
    raw_count: 35000,
    moves: genericMoves(0),
    items: genericItems(0),
    abilities: genericAbilities(0),
    spreads: genericSpreads(0),
    teammates: genericTeammates(0),
    counters: genericCounters(0),
  },
  {
    month: "2026-04",
    species: "gholdengo",
    display_name: "Gholdengo",
    rank: 2,
    usage_pct: 33.0,
    raw_count: 33000,
    moves: genericMoves(1),
    items: genericItems(1),
    abilities: genericAbilities(1),
    spreads: genericSpreads(1),
    teammates: genericTeammates(1),
    counters: genericCounters(1),
  },
  {
    month: "2026-05",
    species: "gholdengo",
    display_name: "Gholdengo",
    rank: 3,
    usage_pct: 29.0,
    raw_count: 29000,
    moves: genericMoves(2),
    items: genericItems(2),
    abilities: genericAbilities(2),
    spreads: genericSpreads(2),
    teammates: genericTeammates(2),
    counters: genericCounters(2),
  },
];

// ---------------------------------------------------------------------------
// garchomp — present all three months; the hasDexPage:true probe (also in
// `SEARCHABLE_NAMES_SEED` under scarlet-violet, seed: "tools").
// ---------------------------------------------------------------------------
const GARCHOMP_ROWS: FixtureUsageRow[] = [
  {
    month: "2026-03",
    species: "garchomp",
    display_name: "Garchomp",
    rank: 3,
    usage_pct: 28.0,
    raw_count: 28000,
    moves: genericMoves(0),
    items: genericItems(0),
    abilities: genericAbilities(0),
    spreads: genericSpreads(0),
    teammates: genericTeammates(0),
    counters: genericCounters(0),
  },
  {
    month: "2026-04",
    species: "garchomp",
    display_name: "Garchomp",
    rank: 4,
    usage_pct: 24.0,
    raw_count: 24000,
    moves: genericMoves(1),
    items: genericItems(1),
    abilities: genericAbilities(1),
    spreads: genericSpreads(1),
    teammates: genericTeammates(1),
    counters: genericCounters(1),
  },
  {
    month: "2026-05",
    species: "garchomp",
    display_name: "Garchomp",
    rank: 4,
    usage_pct: 22.0,
    raw_count: 22000,
    moves: genericMoves(2),
    items: genericItems(2),
    abilities: genericAbilities(2),
    spreads: genericSpreads(2),
    teammates: genericTeammates(2),
    counters: genericCounters(2),
  },
];

// ---------------------------------------------------------------------------
// iron-valiant — present in '2026-03'/'2026-04' only; drops out of '2026-05'.
// ---------------------------------------------------------------------------
const IRON_VALIANT_ROWS: FixtureUsageRow[] = [
  {
    month: "2026-03",
    species: "iron-valiant",
    display_name: "Iron Valiant",
    rank: 5,
    usage_pct: 15.0,
    raw_count: 15000,
    moves: genericMoves(0),
    items: genericItems(0),
    abilities: genericAbilities(0),
    spreads: genericSpreads(0),
    teammates: genericTeammates(0),
    counters: genericCounters(0),
  },
  {
    month: "2026-04",
    species: "iron-valiant",
    display_name: "Iron Valiant",
    rank: 5,
    usage_pct: 12.0,
    raw_count: 12000,
    moves: genericMoves(1),
    items: genericItems(1),
    abilities: genericAbilities(1),
    spreads: genericSpreads(1),
    teammates: genericTeammates(1),
    counters: genericCounters(1),
  },
  // No 2026-05 row — dropped out of the ranked list.
];

// ---------------------------------------------------------------------------
// dragapult — a brand-new '2026-05' arrival, no row in any prior month.
// ---------------------------------------------------------------------------
const DRAGAPULT_ROWS: FixtureUsageRow[] = [
  {
    month: "2026-05",
    species: "dragapult",
    display_name: "Dragapult",
    rank: 5,
    usage_pct: 18.0,
    raw_count: 18000,
    moves: genericMoves(0),
    items: genericItems(0),
    abilities: genericAbilities(0),
    spreads: genericSpreads(0),
    teammates: genericTeammates(0),
    counters: genericCounters(0),
  },
];

const ALL_USAGE_ROWS: FixtureUsageRow[] = [
  ...KINGAMBIT_ROWS,
  ...GREAT_TUSK_ROWS,
  ...GHOLDENGO_ROWS,
  ...GARCHOMP_ROWS,
  ...IRON_VALIANT_ROWS,
  ...DRAGAPULT_ROWS,
];

/** Species count per month, matching `ALL_USAGE_ROWS` above (for `meta_snapshot`). */
const SPECIES_COUNT_BY_MONTH: Record<string, number> = {
  "2026-03": 5, // kingambit, great-tusk, gholdengo, garchomp, iron-valiant
  "2026-04": 5, // same five
  "2026-05": 5, // kingambit, great-tusk, gholdengo, garchomp, dragapult (iron-valiant dropped)
};

const SNAPSHOT_MONTHS = ["2026-03", "2026-04", "2026-05"] as const;

/**
 * Seed `meta_snapshot` + `meta_usage` for `gen9ou` across the three fixture
 * months. Deterministic (no `Date.now()` in any assertable value — `fetched_at`
 * uses a fixed epoch-ms per month so a re-run is byte-identical).
 */
export async function seedMetaFixture(db: MetaFixtureDb): Promise<void> {
  const baseFetchedAt = Date.UTC(2026, 5, 1); // fixed, deterministic reference point

  await db.insert(meta_snapshot).values(
    SNAPSHOT_MONTHS.map((month, i) => ({
      meta_format: GEN9OU,
      month,
      smogon_format_id: SMOGON_FORMAT_ID,
      cutoff: CUTOFF,
      total_battles: 3_000_000 + i * 50_000,
      species_count: SPECIES_COUNT_BY_MONTH[month]!,
      fetched_at: baseFetchedAt + i * 86_400_000,
      source_url: `https://www.smogon.com/stats/${month}/chaos/gen9ou-${CUTOFF}.json`,
    })),
  );

  await db.insert(meta_usage).values(
    ALL_USAGE_ROWS.map((r) => ({
      meta_format: GEN9OU,
      month: r.month,
      species: r.species,
      display_name: r.display_name,
      rank: r.rank,
      usage_pct: r.usage_pct,
      raw_count: r.raw_count,
      moves: JSON.stringify(r.moves),
      items: JSON.stringify(r.items),
      abilities: JSON.stringify(r.abilities),
      spreads: JSON.stringify(r.spreads),
      teammates: JSON.stringify(r.teammates),
      counters: JSON.stringify(r.counters),
    })),
  );
}
