/**
 * build-meta.ts — pure transform from a Smogon chaos-stats JSON blob to Oak's
 * competitive-warehouse rows (`meta_snapshot` + `meta_usage`, backlog B-5).
 *
 * This module is DELIBERATELY pure: no network, no DB, no @pkmn. It takes the
 * already-fetched chaos JSON plus a caller-supplied {@link NameResolver} (built
 * by the sync CLI from Oak's searchable_names) and returns plain insert rows the
 * CLI wraps in its atomic (meta_format, month) table swap. Every Smogon quirk —
 * the four normalization rules, the "nothing" itemless item, the blank move
 * slot, the Checks-and-Counters score — is encoded here so the CLI stays a thin
 * fetch/write shell.
 *
 * Chaos shape (top level): `{ data: { "<Display Name>": entry }, info: {...} }`.
 * Per-species `entry`: "Raw count", "usage" (0–1 weighted share), "Abilities" /
 * "Items" / "Spreads" / "Moves" (id-or-key → weighted count), "Teammates"
 * (display-name → weight) and "Checks and Counters" (display-name → {n,p,d}).
 *
 * Normalization (numerically verified against a live gen9ou-1695 file):
 *   - Abilities / Items / Spreads / Teammates:  pct = value / Σ(category) × 100.
 *   - Moves:  pct = value / (Σ(Moves) / 4) × 100  — a set carries 4 moves, so the
 *     category total is 4× a "per-slot" denominator; the blank-slot key ("") is
 *     kept in Σ(Moves) but never emitted as a move.
 *   - usage_pct = usage × 100; rank = 1-based position by usage desc.
 *   - counters: score = (p − 4·d) × 100 (Smogon's C&C ranking score),
 *     ko_or_switch_pct = p × 100, kept top 10 by score desc.
 */

import type { MetaFormat } from "@/data/meta-formats";
import type { meta_snapshot, meta_usage } from "@/data/schema";

// ---------------------------------------------------------------------------
// Resolver contract (built by the sync CLI from Oak's searchable_names)
// ---------------------------------------------------------------------------

/** One canonical resolution: Oak's slug + human display name for a raw key. */
export interface NameResolverEntry {
  slug: string;
  name: string;
}

/**
 * Name→canonical maps, keyed by {@link normalizeName} of the raw chaos key.
 * The CLI populates these from searchable_names; `buildMetaRows` never guesses
 * a slug when a lookup hits — it only falls back (with a warning) on a miss.
 */
export interface NameResolver {
  pokemon: Map<string, NameResolverEntry>;
  moves: Map<string, NameResolverEntry>;
  abilities: Map<string, NameResolverEntry>;
  items: Map<string, NameResolverEntry>;
}

/** Options the sync CLI supplies alongside the fetched chaos blob. */
export interface BuildMetaOpts {
  metaFormat: MetaFormat;
  /** "YYYY-MM" the snapshot covers. */
  month: string;
  /** Exact Smogon format id the blob was fetched under, e.g. "gen9ou". */
  smogonFormatId: string;
  /** Minimum-battles cutoff the fetch used. */
  cutoff: number;
  /** Chaos-stats URL fetched (citation/audit). */
  sourceUrl: string;
  /** Epoch ms of the fetch. */
  fetchedAt: number;
  resolver: NameResolver;
}

/** The two row-sets the CLI writes, plus deduped unresolved-name warnings. */
export interface BuildMetaResult {
  snapshot: typeof meta_snapshot.$inferInsert;
  usage: Array<typeof meta_usage.$inferInsert>;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Truncation caps (top-N per category, sorted desc by pct / score)
// ---------------------------------------------------------------------------

const CAP_MOVES = 15;
const CAP_ITEMS = 15;
const CAP_ABILITIES = 15;
const CAP_SPREADS = 10;
const CAP_TEAMMATES = 12;
const CAP_COUNTERS = 10;

// ---------------------------------------------------------------------------
// Emitted element shapes (serialized as JSON strings into the text columns)
// ---------------------------------------------------------------------------

interface NamedPct {
  name: string;
  slug: string;
  pct: number;
}

interface SpreadEntry {
  nature: string;
  /** "HP/Atk/Def/SpA/SpD/Spe", e.g. "112/252/0/0/0/144". */
  evs: string;
  pct: number;
}

interface CounterEntry {
  name: string;
  slug: string;
  /** Smogon C&C ranking score: (p − 4·d) × 100. */
  score: number;
  /** KO-or-forced-switch rate: p × 100. */
  ko_or_switch_pct: number;
  /** Weighted encounter count backing the score. */
  n: number;
}

// ---------------------------------------------------------------------------
// Name normalization + fallback helpers
// ---------------------------------------------------------------------------

/** Lowercase + strip every non-alphanumeric char — the resolver map key. */
export function normalizeName(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Kebab slug for an unresolved key, e.g. "Great Tusk" → "great-tusk". */
function slugifyKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Human-ish label for an unresolved key: capitalize a bare Showdown id. */
function prettifyKey(raw: string): string {
  const t = raw.trim();
  if (t.length === 0) return t;
  if (/^[a-z0-9]+$/.test(t)) return t.charAt(0).toUpperCase() + t.slice(1);
  return t;
}

/** Round to 2 decimal places (guards float noise like 42.54607…). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Defensive shape validation
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * A numeric-valued category object (Abilities/Items/Spreads/Moves/Teammates).
 * Non-finite / non-number values are dropped defensively rather than throwing.
 */
function numericEntries(v: unknown): Array<[string, number]> {
  if (!isRecord(v)) return [];
  const out: Array<[string, number]> = [];
  for (const [key, value] of Object.entries(v)) {
    if (typeof value === "number" && Number.isFinite(value)) out.push([key, value]);
  }
  return out;
}

function sumValues(entries: Array<[string, number]>): number {
  let s = 0;
  for (const [, v] of entries) s += v;
  return s;
}

// ---------------------------------------------------------------------------
// Category transforms
// ---------------------------------------------------------------------------

/**
 * Resolve id-keyed entries (moves/items/abilities) to {name, slug, pct},
 * normalized against `denom`, truncated to `cap`, sorted desc by pct.
 * `nothing` (itemless) is special-cased to {name:"None", slug:"nothing"}.
 */
function buildIdKeyed(
  entries: Array<[string, number]>,
  denom: number,
  cap: number,
  resolver: Map<string, NameResolverEntry>,
  kindLabel: string,
  warn: (msg: string) => void,
  opts: { itemless?: boolean } = {},
): NamedPct[] {
  const out: NamedPct[] = [];
  for (const [key, value] of entries) {
    const pct = denom > 0 ? (value / denom) * 100 : 0;
    if (opts.itemless && key === "nothing") {
      out.push({ name: "None", slug: "nothing", pct: round2(pct) });
      continue;
    }
    const hit = resolver.get(normalizeName(key));
    if (hit) {
      out.push({ name: hit.name, slug: hit.slug, pct: round2(pct) });
    } else {
      out.push({ name: prettifyKey(key), slug: slugifyKey(key), pct: round2(pct) });
      warn(`unresolved ${kindLabel}: "${key}"`);
    }
  }
  out.sort((a, b) => b.pct - a.pct);
  return out.slice(0, cap);
}

/** Moves: exclude the blank-slot key ("") from output but keep it in `denom`. */
function buildMoves(
  entries: Array<[string, number]>,
  denom: number,
  resolver: Map<string, NameResolverEntry>,
  warn: (msg: string) => void,
): NamedPct[] {
  const real = entries.filter(([key]) => normalizeName(key).length > 0);
  return buildIdKeyed(real, denom, CAP_MOVES, resolver, "move", warn);
}

/** Spreads: keys are "Nature:HP/Atk/Def/SpA/SpD/Spe" → {nature, evs, pct}. */
function buildSpreads(entries: Array<[string, number]>, denom: number): SpreadEntry[] {
  const out: SpreadEntry[] = [];
  for (const [key, value] of entries) {
    const pct = denom > 0 ? (value / denom) * 100 : 0;
    const colon = key.indexOf(":");
    const nature = colon >= 0 ? key.slice(0, colon) : key;
    const evs = colon >= 0 ? key.slice(colon + 1) : "";
    out.push({ nature, evs, pct: round2(pct) });
  }
  out.sort((a, b) => b.pct - a.pct);
  return out.slice(0, CAP_SPREADS);
}

/** Teammates: keys are display names → {name, slug, pct} via the pokemon map. */
function buildTeammates(
  entries: Array<[string, number]>,
  denom: number,
  resolver: Map<string, NameResolverEntry>,
  warn: (msg: string) => void,
): NamedPct[] {
  const out: NamedPct[] = [];
  for (const [key, value] of entries) {
    const pct = denom > 0 ? (value / denom) * 100 : 0;
    const hit = resolver.get(normalizeName(key));
    if (hit) {
      out.push({ name: hit.name, slug: hit.slug, pct: round2(pct) });
    } else {
      out.push({ name: prettifyKey(key), slug: slugifyKey(key), pct: round2(pct) });
      warn(`unresolved teammate: "${key}"`);
    }
  }
  out.sort((a, b) => b.pct - a.pct);
  return out.slice(0, CAP_TEAMMATES);
}

/** Checks-and-Counters: {n,p,d} → {name, slug, score, ko_or_switch_pct, n}. */
function buildCounters(
  raw: unknown,
  resolver: Map<string, NameResolverEntry>,
  warn: (msg: string) => void,
): CounterEntry[] {
  if (!isRecord(raw)) return [];
  const out: CounterEntry[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue;
    const p = typeof value.p === "number" && Number.isFinite(value.p) ? value.p : 0;
    const d = typeof value.d === "number" && Number.isFinite(value.d) ? value.d : 0;
    const n = typeof value.n === "number" && Number.isFinite(value.n) ? value.n : 0;
    const score = (p - 4 * d) * 100;
    const hit = resolver.get(normalizeName(key));
    const named = hit
      ? { name: hit.name, slug: hit.slug }
      : { name: prettifyKey(key), slug: slugifyKey(key) };
    if (!hit) warn(`unresolved counter: "${key}"`);
    out.push({
      ...named,
      score: round2(score),
      ko_or_switch_pct: round2(p * 100),
      n: round2(n),
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, CAP_COUNTERS);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Transform a Smogon chaos blob into `meta_snapshot` + `meta_usage` insert
 * rows. Throws a descriptive Error on malformed input (the CLI treats a throw
 * as a fetch-level failure and skips the (format, month) write).
 */
export function buildMetaRows(chaos: unknown, opts: BuildMetaOpts): BuildMetaResult {
  if (!isRecord(chaos)) {
    throw new Error("malformed chaos: top level is not an object");
  }
  if (!isRecord(chaos.data)) {
    throw new Error('malformed chaos: missing or non-object "data"');
  }
  if (!isRecord(chaos.info)) {
    throw new Error('malformed chaos: missing or non-object "info"');
  }

  const { resolver } = opts;
  const warningSet = new Set<string>();
  const warn = (msg: string) => warningSet.add(msg);

  const totalBattlesRaw = chaos.info["number of battles"];
  const totalBattles =
    typeof totalBattlesRaw === "number" && Number.isFinite(totalBattlesRaw)
      ? Math.trunc(totalBattlesRaw)
      : null;

  // Order species by usage desc → 1-based rank.
  const speciesEntries = Object.entries(chaos.data);
  const ranked = speciesEntries.map(([displayKey, entry]) => {
    if (!isRecord(entry)) {
      throw new Error(`malformed chaos: species "${displayKey}" entry is not an object`);
    }
    const usage = entry.usage;
    if (typeof usage !== "number" || !Number.isFinite(usage)) {
      throw new Error(`malformed chaos: species "${displayKey}" has no numeric "usage"`);
    }
    return { displayKey, entry, usage };
  });
  ranked.sort((a, b) => b.usage - a.usage);

  const usage: Array<typeof meta_usage.$inferInsert> = ranked.map((r, i) => {
    const { displayKey, entry } = r;

    const speciesHit = resolver.pokemon.get(normalizeName(displayKey));
    const speciesSlug = speciesHit ? speciesHit.slug : slugifyKey(displayKey);
    if (!speciesHit) warn(`unresolved species: "${displayKey}"`);

    const rawCountVal = entry["Raw count"];
    const rawCount =
      typeof rawCountVal === "number" && Number.isFinite(rawCountVal)
        ? Math.trunc(rawCountVal)
        : null;

    const abilityEntries = numericEntries(entry.Abilities);
    const itemEntries = numericEntries(entry.Items);
    const spreadEntries = numericEntries(entry.Spreads);
    const moveEntries = numericEntries(entry.Moves);
    const teammateEntries = numericEntries(entry.Teammates);

    const abilities = buildIdKeyed(
      abilityEntries,
      sumValues(abilityEntries),
      CAP_ABILITIES,
      resolver.abilities,
      "ability",
      warn,
    );
    const items = buildIdKeyed(
      itemEntries,
      sumValues(itemEntries),
      CAP_ITEMS,
      resolver.items,
      "item",
      warn,
      { itemless: true },
    );
    // A set carries 4 moves — the category total is 4× the per-slot denominator.
    const moves = buildMoves(moveEntries, sumValues(moveEntries) / 4, resolver.moves, warn);
    const spreads = buildSpreads(spreadEntries, sumValues(spreadEntries));
    const teammates = buildTeammates(
      teammateEntries,
      sumValues(teammateEntries),
      resolver.pokemon,
      warn,
    );
    const counters = buildCounters(entry["Checks and Counters"], resolver.pokemon, warn);

    return {
      meta_format: opts.metaFormat,
      month: opts.month,
      species: speciesSlug,
      display_name: displayKey,
      rank: i + 1,
      usage_pct: round2(r.usage * 100),
      raw_count: rawCount,
      moves: JSON.stringify(moves),
      items: JSON.stringify(items),
      abilities: JSON.stringify(abilities),
      spreads: JSON.stringify(spreads),
      teammates: JSON.stringify(teammates),
      counters: JSON.stringify(counters),
    } satisfies typeof meta_usage.$inferInsert;
  });

  const snapshot: typeof meta_snapshot.$inferInsert = {
    meta_format: opts.metaFormat,
    month: opts.month,
    smogon_format_id: opts.smogonFormatId,
    cutoff: opts.cutoff,
    total_battles: totalBattles,
    species_count: usage.length,
    fetched_at: opts.fetchedAt,
    source_url: opts.sourceUrl,
  };

  return { snapshot, usage, warnings: [...warningSet] };
}
