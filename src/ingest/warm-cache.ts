/**
 * src/ingest/warm-cache.ts
 *
 * Optional eager warm of reference_cache for move/ability/type/evolution/item
 * entries. Invoked from run.ts when opts.warmCache = true; off by default
 * (every cache miss falls back to the lazy read-through path in
 * src/data/repos/reference-cache.ts at runtime — BR-8).
 *
 * Design (design.md Phase 3 / § Component Design Ingest pipeline):
 *   - Collects resource slugs from searchable_names (moves, abilities, items)
 *     + hardcoded 18 type names + distinct species_name from pokemon table.
 *   - Skips any key whose cached fetched_at is within the TTL window (24 h).
 *   - Fetches PokeAPI resources exclusively through the caller-supplied
 *     PokeApiClient — the only code that may call PokeAPI (BR-8).
 *   - Normalizes raw JSON to the exact tool-output shapes (tools.md T4–T8) and
 *     upserts into reference_cache.  Payload field names match schemas.ts.
 *   - Returns a WarmCacheReport; never throws for per-resource failures.
 *
 * Module-boundary rules (design.md Code Conventions):
 *   - Accepts PokebotDb + PokeApiClient as parameters — does NOT import the
 *     db singleton or construct a client.
 *   - Does NOT import agent/ or server/ modules.
 */

import { eq } from "drizzle-orm";

import type { PokebotDb } from "@/data/db";
import { reference_cache, searchable_names, pokemon } from "@/data/schema";
import type { PokeApiClient, Json } from "@/data/pokeapi-client";
import { TYPE_NAMES } from "@/agent/schemas";
import type {
  MoveDetail,
  AbilityDetail,
  TypeMatchupsDetail,
  EvolutionChainDetail,
  ItemDetail,
} from "@/agent/schemas";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The five reference-cache resource kinds (data-sources.md DS-4). */
export type RefKind = "move" | "ability" | "type" | "evolution" | "item";

export interface WarmCacheOptions {
  db: PokebotDb;
  client: PokeApiClient;
  /** Subset of kinds to warm; defaults to all five. */
  kinds?: RefKind[];
  /**
   * Skip any entry whose cached fetched_at is fresher than this many ms ago.
   * Default: 24 h (86_400_000 ms) — matches the DS-4 TTL in data-sources.md.
   */
  skipIfFreshWithinMs?: number;
  /** Optional status callback; called once per entry. */
  onProgress?: (msg: string) => void;
  /**
   * PokeAPI base URL (no trailing slash). Injected so tests can override it
   * without touching process.env; defaults to env.POKEAPI_BASE_URL at call
   * time when omitted.
   */
  baseUrl?: string;
}

export interface WarmCacheReport {
  attempted: number;
  stored: number;
  skipped: number;
  failed: number;
  errors: Array<{ key: string; detail: string }>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Cast a Json value to a plain record (object); returns {} for anything else. */
function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/** Extract the `name` string from a PokeAPI named-resource object. */
function asNameSlug(v: unknown): string | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const name = (v as Record<string, unknown>).name;
  return typeof name === "string" && name.length > 0 ? name : null;
}

/** Find the English entry from a PokeAPI `names[]` array. */
function getEnName(names: unknown): string {
  if (!Array.isArray(names)) return "";
  const en = (
    names as Array<{ name?: string; language?: { name?: string } }>
  ).find((n) => n.language?.name === "en");
  return en?.name ?? "";
}

/** Extract English effect text from a PokeAPI `effect_entries[]` array. */
function getEnEffect(entries: unknown): {
  effect: string;
  short_effect: string;
} {
  if (!Array.isArray(entries)) return { effect: "", short_effect: "" };
  const en = (
    entries as Array<{
      effect?: string;
      short_effect?: string;
      language?: { name?: string };
    }>
  ).find((e) => e.language?.name === "en");
  return { effect: en?.effect ?? "", short_effect: en?.short_effect ?? "" };
}

/** Extract string names from a PokeAPI damage-relations sub-array. */
function extractTypeNames(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return (arr as Array<{ name?: string }>)
    .map((e) => e.name ?? "")
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Normalizers (exported so unit tests can exercise them in isolation)
// ---------------------------------------------------------------------------

/**
 * Map a raw PokeAPI /move/{slug} response to the MoveDetail tool shape (T4).
 * Returns null if required fields are absent.
 */
export function normalizeMove(raw: Json): MoveDetail | null {
  const r = asRecord(raw);
  if (!r.name) return null;

  const { effect, short_effect } = getEnEffect(r.effect_entries);
  const dcRaw = asNameSlug(r.damage_class);
  const validDc = ["physical", "special", "status"].includes(dcRaw ?? "")
    ? (dcRaw as "physical" | "special" | "status")
    : "status";

  return {
    found: true,
    display_name: getEnName(r.names) || String(r.name),
    type: asNameSlug(r.type) ?? "normal",
    damage_class: validDc,
    power: typeof r.power === "number" ? r.power : null,
    accuracy: typeof r.accuracy === "number" ? r.accuracy : null,
    pp: typeof r.pp === "number" ? r.pp : null,
    priority: typeof r.priority === "number" ? r.priority : 0,
    target: asNameSlug(r.target) ?? "selected-pokemon",
    effect_short: short_effect,
    effect_full: effect,
  };
}

/**
 * Map a raw PokeAPI /ability/{slug} response to the AbilityDetail shape (T5).
 */
export function normalizeAbility(raw: Json): AbilityDetail | null {
  const r = asRecord(raw);
  if (!r.name) return null;

  const { effect, short_effect } = getEnEffect(r.effect_entries);

  return {
    found: true,
    display_name: getEnName(r.names) || String(r.name),
    effect_short: short_effect,
    effect_full: effect,
  };
}

/**
 * Map a raw PokeAPI /type/{slug} response to the TypeMatchupsDetail shape (T6).
 * Immunities are represented in immune_to (0×), never collapsed into resists.
 */
export function normalizeType(raw: Json): TypeMatchupsDetail | null {
  const r = asRecord(raw);
  if (!r.name) return null;

  const rel = asRecord(r.damage_relations);

  return {
    found: true,
    types: [String(r.name)],
    offensive: {
      super_effective_against: extractTypeNames(rel.double_damage_to),
      not_very_effective_against: extractTypeNames(rel.half_damage_to),
      no_effect_against: extractTypeNames(rel.no_damage_to),
    },
    defensive: {
      weak_to: extractTypeNames(rel.double_damage_from),
      resists: extractTypeNames(rel.half_damage_from),
      immune_to: extractTypeNames(rel.no_damage_from),
    },
  };
}

/**
 * Recursively flatten a PokeAPI chain-link tree into a flat array of
 * `{ from, to, conditions }` edges (T7 output format).
 *
 * Exported separately so tests can verify the recursion without needing a full
 * /evolution-chain response wrapper.
 */
export interface ChainLink {
  species: { name: string };
  evolves_to: ChainLink[];
  evolution_details: Array<Record<string, unknown>>;
}

export function flattenChainLinks(
  link: ChainLink,
): EvolutionChainDetail["chain"] {
  const edges: EvolutionChainDetail["chain"] = [];

  for (const evo of link.evolves_to ?? []) {
    const conditions = (evo.evolution_details ?? []).map((d) => {
      const cond: Record<string, unknown> = {
        trigger: asNameSlug(d.trigger) ?? "unknown",
      };
      for (const [key, val] of Object.entries(d)) {
        if (key === "trigger") continue;
        // Skip falsy / zero / empty-string — PokeAPI uses null/0/"" for absent
        if (val === null || val === false || val === 0 || val === "") continue;
        // Named-resource object → extract slug
        if (
          val !== null &&
          typeof val === "object" &&
          !Array.isArray(val) &&
          "name" in (val as Record<string, unknown>)
        ) {
          const slug = asNameSlug(val);
          if (slug) cond[key] = slug;
        } else {
          cond[key] = val;
        }
      }
      return cond as { trigger: string } & Record<string, unknown>;
    });

    edges.push({
      from: link.species.name,
      to: evo.species.name,
      conditions,
    });
    edges.push(...flattenChainLinks(evo));
  }

  return edges;
}

/**
 * Map a raw PokeAPI /evolution-chain/{id} response to EvolutionChainDetail (T7).
 */
export function normalizeEvolutionChain(
  raw: Json,
): EvolutionChainDetail | null {
  const r = asRecord(raw);
  if (!r.chain) return null;

  const chain = flattenChainLinks(r.chain as ChainLink);
  return { found: true, chain };
}

/**
 * Map a raw PokeAPI /item/{slug} response to ItemDetail (T8).
 */
export function normalizeItem(raw: Json): ItemDetail | null {
  const r = asRecord(raw);
  if (!r.name) return null;

  const { effect, short_effect } = getEnEffect(r.effect_entries);

  const held_by_wild: Array<{ pokemon: string; rarity_percent: number }> = [];
  if (Array.isArray(r.held_by_pokemon)) {
    for (const h of r.held_by_pokemon as Array<{
      pokemon?: { name?: string };
      version_details?: Array<{ rarity?: number }>;
    }>) {
      const name = h.pokemon?.name;
      if (!name) continue;
      const rarities = (h.version_details ?? []).map((v) => v.rarity ?? 0);
      const rarity_percent = rarities.length > 0 ? Math.max(...rarities) : 0;
      held_by_wild.push({ pokemon: name, rarity_percent });
    }
  }

  return {
    found: true,
    display_name: getEnName(r.names) || String(r.name),
    effect_short: short_effect,
    effect_full: effect,
    ...(held_by_wild.length > 0 ? { held_by_wild } : {}),
  };
}

// ---------------------------------------------------------------------------
// Entry collection — build the list of keys to warm from the DB
// ---------------------------------------------------------------------------

interface ResourceEntry {
  /** reference_cache.resource_key, e.g. "move/fake-out". */
  key: string;
  kind: RefKind;
  /**
   * Relative PokeAPI path for a direct fetch, e.g. "move/fake-out".
   * For evolution entries this is the SPECIES path (step 1 of the two-step
   * fetch); the actual chain URL is discovered at fetch time.
   */
  endpoint: string;
}

function collectEntries(db: PokebotDb, kinds: RefKind[]): ResourceEntry[] {
  const entries: ResourceEntry[] = [];

  for (const kind of kinds) {
    switch (kind) {
      case "move":
      case "ability":
      case "item": {
        const rows = db
          .select({ slug: searchable_names.slug })
          .from(searchable_names)
          .where(eq(searchable_names.kind, kind))
          .all();
        for (const row of rows) {
          entries.push({
            key: `${kind}/${row.slug}`,
            kind,
            endpoint: `${kind}/${row.slug}`,
          });
        }
        break;
      }

      case "type": {
        for (const typeName of TYPE_NAMES) {
          entries.push({
            key: `type/${typeName}`,
            kind: "type",
            endpoint: `type/${typeName}`,
          });
        }
        break;
      }

      case "evolution": {
        // One evolution-chain entry per distinct species in the Pokédex.
        // Multiple forms share a species_name; selectDistinct deduplicates.
        const rows = db
          .selectDistinct({ species_name: pokemon.species_name })
          .from(pokemon)
          .all();
        for (const row of rows) {
          entries.push({
            key: `evolution-chain/${row.species_name}`,
            kind: "evolution",
            endpoint: `pokemon-species/${row.species_name}`,
          });
        }
        break;
      }
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Per-entry fetch + normalize
// ---------------------------------------------------------------------------

async function fetchAndNormalize(
  entry: ResourceEntry,
  client: PokeApiClient,
  baseUrl: string,
): Promise<{ payload: Json; endpointUrl: string } | null> {
  const { kind, endpoint } = entry;

  if (kind === "evolution") {
    // Step 1 — fetch the species resource to discover the evolution_chain URL.
    const speciesResult = await client.get(endpoint);
    if (!speciesResult.ok) return null;

    const speciesData = asRecord(speciesResult.value);
    const chainRef = asRecord(speciesData.evolution_chain);
    const chainUrl = typeof chainRef.url === "string" ? chainRef.url : null;
    if (!chainUrl) return null;

    // Step 2 — fetch the actual evolution chain.
    const chainResult = await client.get(chainUrl);
    if (!chainResult.ok) return null;

    const normalized = normalizeEvolutionChain(chainResult.value);
    if (!normalized) return null;

    return { payload: normalized as unknown as Json, endpointUrl: chainUrl };
  }

  // Direct single-step fetch for all other kinds.
  const result = await client.get(endpoint);
  if (!result.ok) return null;

  let normalized:
    | MoveDetail
    | AbilityDetail
    | TypeMatchupsDetail
    | ItemDetail
    | null = null;

  switch (kind) {
    case "move":
      normalized = normalizeMove(result.value);
      break;
    case "ability":
      normalized = normalizeAbility(result.value);
      break;
    case "type":
      normalized = normalizeType(result.value);
      break;
    case "item":
      normalized = normalizeItem(result.value);
      break;
  }

  if (!normalized) return null;

  const endpointUrl = `${baseUrl.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`;
  return { payload: normalized as unknown as Json, endpointUrl };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 h — matches DS-4 TTL
const ALL_KINDS: RefKind[] = ["move", "ability", "type", "evolution", "item"];

/**
 * Eagerly populate reference_cache for the requested resource kinds.
 *
 * Idempotent: entries fresher than `skipIfFreshWithinMs` are skipped.
 * Per-resource errors are recorded in the report and do not abort the warm.
 */
export async function warmCache(
  opts: WarmCacheOptions,
): Promise<WarmCacheReport> {
  const {
    db,
    client,
    kinds = ALL_KINDS,
    skipIfFreshWithinMs = DEFAULT_TTL_MS,
    onProgress,
  } = opts;

  // Resolve baseUrl at call time so tests can override without touching env.
  const baseUrl: string =
    opts.baseUrl ??
    // Dynamic import of env to avoid a top-level side-effect in this module
    // (env throws if ANTHROPIC_API_KEY is absent — not relevant to warm-cache).
    (await import("@/env").then((m) => m.env.POKEAPI_BASE_URL));

  const report: WarmCacheReport = {
    attempted: 0,
    stored: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const entries = collectEntries(db, kinds);
  const ttlCutoff = Date.now() - skipIfFreshWithinMs;

  // Bulk-load existing keys + timestamps to avoid one SELECT per entry.
  const cachedRows = db
    .select({
      resource_key: reference_cache.resource_key,
      fetched_at: reference_cache.fetched_at,
    })
    .from(reference_cache)
    .all();
  const cachedMap = new Map<string, number>(
    cachedRows.map((r) => [r.resource_key, r.fetched_at]),
  );

  for (const entry of entries) {
    report.attempted++;

    // TTL check — skip if already fresh.
    const existingAt = cachedMap.get(entry.key);
    if (existingAt !== undefined && existingAt > ttlCutoff) {
      report.skipped++;
      onProgress?.(`skip  ${entry.key}`);
      continue;
    }

    onProgress?.(`fetch ${entry.key}`);

    let fetched: { payload: Json; endpointUrl: string } | null = null;
    try {
      fetched = await fetchAndNormalize(entry, client, baseUrl);
    } catch (e) {
      report.failed++;
      const detail = e instanceof Error ? e.message : String(e);
      report.errors.push({ key: entry.key, detail });
      onProgress?.(`fail  ${entry.key} — ${detail}`);
      continue;
    }

    if (!fetched) {
      report.failed++;
      report.errors.push({ key: entry.key, detail: "normalize returned null" });
      onProgress?.(`fail  ${entry.key}`);
      continue;
    }

    try {
      const now = Date.now();
      db.insert(reference_cache)
        .values({
          resource_key: entry.key,
          resource_kind: entry.kind,
          payload: JSON.stringify(fetched.payload),
          endpoint_url: fetched.endpointUrl,
          fetched_at: now,
        })
        .onConflictDoUpdate({
          target: reference_cache.resource_key,
          set: {
            resource_kind: entry.kind,
            payload: JSON.stringify(fetched.payload),
            endpoint_url: fetched.endpointUrl,
            fetched_at: now,
          },
        })
        .run();

      report.stored++;
      onProgress?.(`ok    ${entry.key}`);
    } catch (e) {
      report.failed++;
      const detail = e instanceof Error ? e.message : String(e);
      report.errors.push({ key: entry.key, detail });
      onProgress?.(`fail  ${entry.key} — ${detail}`);
    }
  }

  return report;
}
