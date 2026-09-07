/**
 * src/data/reference-pages.ts — view-model assembler for the programmatic SEO
 * reference pages (/pokedex, /moves, /abilities, /items).
 *
 * Champions-first (CF-DEX-US-1): every loader reads the Champions partition
 * only. There is no other-format fallback and no National Dex secondary
 * lookup. An unknown slug is `null` (→ page 404).
 *
 * It sits ON TOP of `entity-profile.ts` (the artifact assembler): each detail
 * loader resolves an entity through `assembleEntityProfile` in Champions.
 * Detail loaders additionally batch evolution edges, ability effect prose,
 * learnset enrichment, and best-effort live Champions usage (bounded by a
 * timeout; never fails the page). Index loaders enumerate a whole kind for
 * the crawl.
 *
 * INDEX-UNAVAILABLE CONTRACT. B1's list repos return `[]` on an unreadable index
 * (no distinction between "empty" and "broken"). A reference page must NOT
 * render an empty-but-200 index off a pre-ingest DB — a crawler would cache the
 * empty page. So every loader first checks `isIndexAvailable(CHAMPIONS_FORMAT)`
 * and THROWS `Error("index_unavailable")` when it is not built. Pages let that
 * propagate → a 500 the crawler retries, never a soft-200 or a wrong 404.
 *
 * CACHING. Detail loaders are wrapped in React `cache()` so a page and its
 * `generateMetadata` share one query per request. Index loaders are ALSO wrapped
 * in `unstable_cache(..., { revalidate: 86400 })` so per-request renders don't
 * re-enumerate the whole dex. Tests call the UNCACHED inner `*Uncached(db)`
 * variants directly with an injected fixture handle — they never touch the
 * `@/data/db` singleton or the Next cache.
 *
 * `server-only`: it reads the repo/DB layer and must never reach a client
 * bundle. It is itself only ever dynamically imported by the reference pages.
 */

import "server-only";

import { eq } from "drizzle-orm";
import { cache } from "react";
import { unstable_cache } from "next/cache";

import type { OakDb } from "@/data/db";
import { CHAMPIONS_FORMAT, type Format } from "@/data/formats";
import { ingest_meta } from "@/data/schema";
import {
  assembleEntityProfile,
  isIndexAvailable,
} from "@/data/entity-profile";
import type { EntityArtifactOk } from "@/lib/entity-artifact";
import type { EntityKind } from "@/agent/schemas";
import type {
  AbilityDetail,
  EvolutionChainDetail,
} from "@/agent/schemas";
import {
  listAllPokemon,
  pokemonRequiringItem,
} from "@/data/repos/pokedex-repo";
import { learnersOfMove } from "@/data/repos/learnset-repo";
import {
  allMoveSummaries,
  getReference,
  listNamesByKind,
  moveSummaries,
} from "@/data/repos/reference-cache";
import type {
  AbilityEntry,
  AbilityPageData,
  DefensiveMatchups,
  EvolutionEdge,
  ItemPageData,
  MoveIndexRow,
  MovePageData,
  MovepoolGroupView,
  MovesIndexData,
  NamesIndexData,
  PokedexIndexData,
  PokemonPageData,
  PokemonStats,
  UsageBlock,
} from "@/lib/reference-pages-types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Thrown message when the Champions index is not built (→ page 500s). */
export const INDEX_UNAVAILABLE = "index_unavailable";

/** Best-effort Champions-usage bound; a slower/failed lookup yields null. */
const USAGE_TIMEOUT_MS = 2500;
/** How many top entries of each usage category to surface. */
const USAGE_TOP_N = 8;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Title-case a slug ("rough-skin" → "Rough Skin"). */
function titleCase(slug: string): string {
  return slug
    .split(/[-\s]+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Throw the index-unavailable sentinel when the primary index isn't built. */
function requireIndex(available: boolean): void {
  if (!available) throw new Error(INDEX_UNAVAILABLE);
}

/** Resolve the `@/data/db` singleton for the cached wrappers (pages only). */
async function singletonDb(): Promise<OakDb> {
  const mod = await import("@/data/db");
  return mod.db;
}

/**
 * Resolve an entity to its Champions `ok` artifact envelope.
 * `preferredFormat` is ignored (old `?format=` clients must not pull another
 * game). Throws `index_unavailable` if the Champions index isn't built;
 * returns null when the slug is not on the roster.
 */
async function resolveEntityProfile(
  kind: EntityKind,
  slug: string,
  db: OakDb,
  _preferredFormat?: Format,
): Promise<{ ok: EntityArtifactOk; sourceFormat: Format } | null> {
  requireIndex(await isIndexAvailable(CHAMPIONS_FORMAT, db));

  const res = await assembleEntityProfile(kind, slug, CHAMPIONS_FORMAT, db);
  if (res.status === "ok") {
    return { ok: res, sourceFormat: CHAMPIONS_FORMAT };
  }
  return null;
}

/** True when the ability reference resolved to a found detail record. */
function foundAbility(
  ref: Awaited<ReturnType<typeof getReference>>,
): ref is AbilityDetail {
  return "found" in ref && ref.found === true && "effect_short" in ref;
}

/**
 * Best-effort live Champions usage for a Pokémon by display name. Bounded by
 * {@link USAGE_TIMEOUT_MS} and wrapped so ANY failure (network, timeout, parse,
 * name miss) collapses to `null` — usage never fails or slows the page. The
 * usage client is dynamically imported so a page that never needs it (a
 * non-Champions species) doesn't pull it, and so tests can mock the module.
 */
async function bestEffortUsage(displayName: string): Promise<UsageBlock | null> {
  try {
    const mod = await import("@/server/champions-usage/usage-client");
    const controller = new AbortController();
    const abortTimer = setTimeout(
      () => controller.abort(),
      USAGE_TIMEOUT_MS,
    );
    let raceTimer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      raceTimer = setTimeout(() => resolve(null), USAGE_TIMEOUT_MS);
    });
    try {
      const result = await Promise.race([
        mod.getUsage(displayName, "doubles", { signal: controller.signal }),
        timeout,
      ]);
      if (!result || result.found === false) return null;
      const d = result.data;
      const top = (entries: { name: string; pct: number | null }[]) =>
        entries.slice(0, USAGE_TOP_N).map((e) => ({ name: e.name, pct: e.pct }));
      return {
        savedName: d.saved_name,
        season: d.season,
        topMoves: top(d.moves),
        topItems: top(d.items),
        topAbilities: top(d.abilities),
        topTeammates: top(d.teammates),
        attribution: mod.USAGE_ATTRIBUTION,
        sourceUrl: d.source_url,
      };
    } finally {
      clearTimeout(abortTimer);
      if (raceTimer) clearTimeout(raceTimer);
    }
  } catch {
    return null;
  }
}

// ===========================================================================
// Detail loaders (uncached inner fns take an injected db; cached wrappers below)
// ===========================================================================

export async function loadPokemonPageUncached(
  slug: string,
  db: OakDb,
  preferredFormat?: Format,
): Promise<PokemonPageData | null> {
  const resolved = await resolveEntityProfile(
    "pokemon",
    slug,
    db,
    preferredFormat,
  );
  if (!resolved || resolved.ok.kind !== "pokemon") return null;
  const { ok, sourceFormat } = resolved;
  const data = ok.data;

  const abilitySlots: { slug: string; isHidden: boolean }[] = [
    { slug: data.abilities.slot1, isHidden: false },
  ];
  if (data.abilities.slot2)
    abilitySlots.push({ slug: data.abilities.slot2, isHidden: false });
  if (data.abilities.hidden)
    abilitySlots.push({ slug: data.abilities.hidden, isHidden: true });

  const moveSlugs = data.movepool.flatMap((g) => g.moves.map((m) => m.slug));

  const [evolutionRef, abilityRefs, summaries] = await Promise.all([
    getReference("evolution", slug, sourceFormat, { db }),
    Promise.all(
      abilitySlots.map((a) =>
        getReference("ability", a.slug, sourceFormat, { db }),
      ),
    ),
    moveSummaries(moveSlugs, sourceFormat, db),
  ]);

  const usage = await bestEffortUsage(data.display_name);

  const abilities: AbilityEntry[] = abilitySlots.map((a, i) => {
    const ref = abilityRefs[i]!;
    const detail = foundAbility(ref) ? ref : null;
    return {
      slug: a.slug,
      displayName: detail?.display_name ?? titleCase(a.slug),
      ...(a.isHidden ? { isHidden: true } : {}),
      effectShort: detail?.effect_short ?? "",
      ...(detail?.effect_full ? { effectFull: detail.effect_full } : {}),
    };
  });

  const movepool: MovepoolGroupView[] = data.movepool.map((g) => ({
    method: g.method,
    moves: g.moves.map((m) => {
      const s = summaries.get(m.slug);
      return {
        slug: m.slug,
        displayName: m.display_name,
        type: m.type || s?.type,
        power: s?.power ?? null,
        damageClass: s?.damageClass ?? null,
      };
    }),
  }));

  const matchups: DefensiveMatchups = {
    weak_to: data.matchups.weak_to,
    resists: data.matchups.resists,
    immune_to: data.matchups.immune_to,
    quad_weak_to: data.matchups.quad_weak_to ?? [],
    quad_resists: data.matchups.quad_resists ?? [],
  };

  const stats: PokemonStats = {
    hp: data.base_stats.hp,
    atk: data.base_stats.attack,
    def: data.base_stats.defense,
    spa: data.base_stats.special_attack,
    spd: data.base_stats.special_defense,
    spe: data.base_stats.speed,
  };

  const evolution =
    "found" in evolutionRef && evolutionRef.found === true
      ? ((evolutionRef as EvolutionChainDetail).chain as EvolutionEdge[])
      : undefined;

  return {
    slug,
    displayName: data.display_name,
    dexNumber: data.national_dex_number,
    types: data.types,
    stats,
    baseStatTotal: data.base_stat_total,
    abilities,
    matchups,
    movepool,
    ...(evolution && evolution.length > 0 ? { evolution } : {}),
    forms: data.forms,
    availability: [CHAMPIONS_FORMAT],
    isNative: data.is_gen9_native,
    spriteUrl: data.sprite_url,
    artworkUrl: data.artwork_url,
    sourceFormat,
    usage,
  };
}

export async function loadMovePageUncached(
  slug: string,
  db: OakDb,
  preferredFormat?: Format,
): Promise<MovePageData | null> {
  const resolved = await resolveEntityProfile(
    "move",
    slug,
    db,
    preferredFormat,
  );
  if (!resolved || resolved.ok.kind !== "move") return null;
  const { ok, sourceFormat } = resolved;
  const data = ok.data;

  const learners = await learnersOfMove(slug, sourceFormat, db);

  return {
    slug,
    displayName: data.display_name,
    type: data.type,
    damageClass: data.damage_class,
    power: data.power,
    accuracy: data.accuracy,
    pp: data.pp,
    priority: data.priority,
    target: data.target,
    effectShort: data.effect_short,
    effectFull: data.effect_full,
    learners,
    learnerCount: learners.length,
    availability: [CHAMPIONS_FORMAT],
    sourceFormat,
  };
}

export async function loadAbilityPageUncached(
  slug: string,
  db: OakDb,
  preferredFormat?: Format,
): Promise<AbilityPageData | null> {
  const resolved = await resolveEntityProfile(
    "ability",
    slug,
    db,
    preferredFormat,
  );
  if (!resolved || resolved.ok.kind !== "ability") return null;
  const { ok, sourceFormat } = resolved;
  const data = ok.data;

  return {
    slug,
    displayName: data.display_name,
    effectShort: data.effect_short,
    effectFull: data.effect_full,
    learnedBy: data.learned_by.map((h) => ({
      slug: h.slug,
      displayName: h.display_name,
    })),
    availability: [CHAMPIONS_FORMAT],
    sourceFormat,
  };
}

export async function loadItemPageUncached(
  slug: string,
  db: OakDb,
  preferredFormat?: Format,
): Promise<ItemPageData | null> {
  const resolved = await resolveEntityProfile(
    "item",
    slug,
    db,
    preferredFormat,
  );
  if (!resolved || resolved.ok.kind !== "item") return null;
  const { ok, sourceFormat } = resolved;
  const data = ok.data;

  const requiredBy = await pokemonRequiringItem(slug, sourceFormat, db);

  return {
    slug,
    displayName: data.display_name,
    effectShort: data.effect_short,
    effectFull: data.effect_full,
    heldByWild: (data.held_by_wild ?? []).map((h) => ({
      pokemon: h.pokemon,
      rarityPercent: h.rarity_percent,
    })),
    requiredBy,
    availability: [CHAMPIONS_FORMAT],
    sourceFormat,
  };
}

// ===========================================================================
// Index loaders (uncached inner fns)
// ===========================================================================

export async function loadPokedexIndexUncached(
  db: OakDb,
): Promise<PokedexIndexData> {
  requireIndex(await isIndexAvailable(CHAMPIONS_FORMAT, db));
  const rows = await listAllPokemon(CHAMPIONS_FORMAT, db);
  return { rows, extras: [] };
}

export async function loadMovesIndexUncached(
  db: OakDb,
): Promise<MovesIndexData> {
  requireIndex(await isIndexAvailable(CHAMPIONS_FORMAT, db));
  const [names, summaries] = await Promise.all([
    listNamesByKind("move", CHAMPIONS_FORMAT, db),
    allMoveSummaries(CHAMPIONS_FORMAT, db),
  ]);
  const rows: MoveIndexRow[] = names.map((n) => {
    const s = summaries.get(n.slug);
    return {
      slug: n.slug,
      displayName: n.displayName,
      ...(s
        ? { type: s.type, power: s.power, damageClass: s.damageClass }
        : {}),
    };
  });
  return { rows };
}

export async function loadAbilitiesIndexUncached(
  db: OakDb,
): Promise<NamesIndexData> {
  requireIndex(await isIndexAvailable(CHAMPIONS_FORMAT, db));
  return { rows: await listNamesByKind("ability", CHAMPIONS_FORMAT, db) };
}

export async function loadItemsIndexUncached(
  db: OakDb,
): Promise<NamesIndexData> {
  requireIndex(await isIndexAvailable(CHAMPIONS_FORMAT, db));
  return { rows: await listNamesByKind("item", CHAMPIONS_FORMAT, db) };
}

/**
 * The Champions index's last successful ingest, as a Date for the sitemap's
 * `lastModified`. Null when the index isn't built or the read fails (the sitemap
 * omits the field). Does NOT throw — the sitemap should still emit URLs.
 */
export async function referenceLastModifiedUncached(
  db: OakDb,
): Promise<Date | null> {
  try {
    const rows = await db
      .select({ ts: ingest_meta.last_success_at })
      .from(ingest_meta)
      .where(eq(ingest_meta.format, CHAMPIONS_FORMAT))
      .limit(1);
    const ts = rows[0]?.ts;
    return ts != null ? new Date(ts) : null;
  } catch {
    return null;
  }
}

// ===========================================================================
// Cached wrappers (used by pages; resolve the @/data/db singleton)
// ===========================================================================

/** Detail loaders — React `cache()` dedupes page + generateMetadata per request. */
export const loadPokemonPage = cache(
  async (
    slug: string,
    preferredFormat?: Format,
  ): Promise<PokemonPageData | null> =>
    loadPokemonPageUncached(slug, await singletonDb(), preferredFormat),
);
export const loadMovePage = cache(
  async (
    slug: string,
    preferredFormat?: Format,
  ): Promise<MovePageData | null> =>
    loadMovePageUncached(slug, await singletonDb(), preferredFormat),
);
export const loadAbilityPage = cache(
  async (
    slug: string,
    preferredFormat?: Format,
  ): Promise<AbilityPageData | null> =>
    loadAbilityPageUncached(slug, await singletonDb(), preferredFormat),
);
export const loadItemPage = cache(
  async (
    slug: string,
    preferredFormat?: Format,
  ): Promise<ItemPageData | null> =>
    loadItemPageUncached(slug, await singletonDb(), preferredFormat),
);

/** `referenceLastModified` — deduped per request for the sitemap. */
export const referenceLastModified = cache(
  async (): Promise<Date | null> =>
    referenceLastModifiedUncached(await singletonDb()),
);

/** Index loaders — additionally ISR-cached 24h so renders don't re-enumerate. */
const cachedPokedexIndex = unstable_cache(
  async (): Promise<PokedexIndexData> =>
    loadPokedexIndexUncached(await singletonDb()),
  ["ref-pokedex-index"],
  { revalidate: 86400 },
);
const cachedMovesIndex = unstable_cache(
  async (): Promise<MovesIndexData> =>
    loadMovesIndexUncached(await singletonDb()),
  ["ref-moves-index"],
  { revalidate: 86400 },
);
const cachedAbilitiesIndex = unstable_cache(
  async (): Promise<NamesIndexData> =>
    loadAbilitiesIndexUncached(await singletonDb()),
  ["ref-abilities-index"],
  { revalidate: 86400 },
);
const cachedItemsIndex = unstable_cache(
  async (): Promise<NamesIndexData> =>
    loadItemsIndexUncached(await singletonDb()),
  ["ref-items-index"],
  { revalidate: 86400 },
);

export function loadPokedexIndex(): Promise<PokedexIndexData> {
  return cachedPokedexIndex();
}
export function loadMovesIndex(): Promise<MovesIndexData> {
  return cachedMovesIndex();
}
export function loadAbilitiesIndex(): Promise<NamesIndexData> {
  return cachedAbilitiesIndex();
}
export function loadItemsIndex(): Promise<NamesIndexData> {
  return cachedItemsIndex();
}
