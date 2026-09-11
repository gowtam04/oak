/**
 * gen-provider.ts — the SINGLE @pkmn integration point for the ingest pipeline.
 *
 * After the migration, mainline gen-scope index data comes from the @pkmn
 * ecosystem (local npm packages — no network). Champions roster bytes come
 * from a pinned Pokémon Showdown SHA under `web/vendor/pokemon-showdown/`;
 * `@pkmn/dex` is only the overlay engine (`Dex.mod`):
 *   - standard (`scarlet-violet`)    ← `Dex.forGen(9)`
 *   - champions                      ← Showdown pin + `Dex.mod('champions', …)`
 *   - national-dex                   ← `Dex.forGen(9)` (same path as standard,
 *                                       under a new format name — no new branch
 *                                       needed; see loadFormat's else arm)
 *   - gen scopes (`gen-1`…`gen-8`)    ← `Dex.forGen(n)` (generation-scope feature)
 *
 * The ingest builders consume the `FormatSource` returned by {@link loadFormat}
 * and never import @pkmn or Showdown files directly, so every source-specific
 * quirk lives here.
 *
 * Verified facts:
 *   - The Champions legal roster is NOT `dex.species.all()` (that is the full
 *     national-dex set). It lives in the mod's FormatsData: a species is legal
 *     iff its FormatsData entry has a falsy `isNonstandard`. Uber is still
 *     legal. Restricted legendaries stay out. Roster size is hundreds (gated
 *     >320 and <500), not the full dex.
 *   - `Dex.mod` applies the mod's ~259 move + 13 ability overrides, and Mega
 *     species resolve via `modDex.species.get('venusaurmega')`.
 *   - Champions learnsets via `modDex.learnsets.get(id)` are genuinely scoped.
 *   - Move source strings encode gen+method at indexes 0/1 ('9M','9L42','9E'…).
 *   - `Dex.forGen(7)` returns a gen-7-scoped view: its roster (real species,
 *     >700) EXCLUDES gen 8/9 species — those surface with `isNonstandard ===
 *     "Future"`, which `isRealSpecies` drops on gen ≤8 (so e.g. Grookey is
 *     absent from a gen-7 roster). `"Past"` species are KEPT (the BR-1
 *     native/fallback flag). `getLearnset('raichualola')` is non-empty in gen 7.
 *   - On Gen 9 (`scarlet-violet` / `national-dex`), `Future` is KEPT: @pkmn
 *     marks Legends Z-A / Champions megas (e.g. Raichu-Mega-X/Y and ~48 peers)
 *     as `Future` (not SV-legal), but they are real national-dex forms and must
 *     appear in the Pokédex. Same exception applies to their mega stones and
 *     mega-exclusive abilities/moves.
 *   - `dex.types.all()` always returns the FULL modern 19-type set (incl. Fairy
 *     and Stellar) in EVERY gen dex, even `Dex.forGen(1)` — @pkmn does not
 *     historically gate the type list. `BATTLE_TYPE_NAMES` filters Stellar out
 *     so `types` is always exactly 18 in every gen, not a shrinking set for
 *     older gens; what actually varies by gen is per-species typings (which
 *     types a Pokémon HAS) and the type-effectiveness chart consulted
 *     elsewhere, not the type roster itself.
 *   - Similarly, `dex.abilities.all()` / `dex.natures.all()` return the full
 *     modern-valued sets in every gen dex (abilities/natures didn't exist until
 *     Gen 3/4 in-game, but @pkmn's old-gen dexes still expose them) — this is
 *     why gen-1/gen-2 ingest needs no nullable-column handling for those.
 *   - Gen 1 encodes its unified Special stat as identical `spa`/`spd` base
 *     values (e.g. Alakazam spa=spd=135 in `Dex.forGen(1)`); Gen 2 introduces
 *     the real spa/spd split (Alakazam spd=85 in `Dex.forGen(2)`).
 *   - `Dex.forGen(1)` resolves the real 151-species Gen 1 roster with no new
 *     roster logic — Megas/later-gen forms surface as `isNonstandard ===
 *     "Future"` there too and are dropped by the existing `isRealSpecies` gate.
 */

import { Dex, type ModData, type ID } from "@pkmn/dex";

import { type Format, CHAMPIONS_FORMAT, genNumberForFormat } from "@/data/formats";
import { SHOWDOWN_PIN } from "@/data/pkmn/showdown-pin";
import { loadChampionsShowdownMod } from "@/data/pkmn/showdown-loader";

/** The @pkmn dex flavor we use (gen-scoped or modded — same shape). */
export type PkmnDex = ReturnType<typeof Dex.forGen>;
export type PkmnSpecies = ReturnType<PkmnDex["species"]["get"]>;
export type PkmnMove = ReturnType<PkmnDex["moves"]["get"]>;
export type PkmnAbility = ReturnType<PkmnDex["abilities"]["get"]>;
export type PkmnItem = ReturnType<PkmnDex["items"]["get"]>;
export type PkmnType = ReturnType<PkmnDex["types"]["get"]>;
export type PkmnNature = ReturnType<PkmnDex["natures"]["get"]>;

/**
 * Everything an ingest builder needs for one format, with all @pkmn specifics
 * already resolved.
 */
export interface FormatSource {
  format: Format;
  /**
   * The Dex generation number this source resolves to (Champions,
   * `scarlet-violet`, and `national-dex` → 9; gen scopes → 1–8). Ingest
   * builders use it to filter learnset move sources to this generation.
   */
  genNumber: number;
  /** The resolved (gen-scoped or modded) dex. */
  dex: PkmnDex;
  /**
   * Legal, real (existing) roster species for this format — base forms + battle
   * formes (incl. Megas). Cosmetic-forme collapsing (D8) is applied by the
   * caller; this is the pre-collapse legal set.
   */
  roster: PkmnSpecies[];
  /** Champions-legal-or-standard moves (existing, non-CAP). */
  moves: PkmnMove[];
  abilities: PkmnAbility[];
  items: PkmnItem[];
  /** The 18 classic battle types (excludes Stellar / pseudo-types). */
  types: PkmnType[];
  natures: PkmnNature[];
  /** Per-species learnset: `{ moveid: sourceString[] }` (may be empty). */
  getLearnset(speciesId: string): Promise<Record<string, string[]>>;
  /**
   * Showdown git SHA that supplied Champions bytes. Unset on gen-scope
   * `@pkmn/dex` formats.
   */
  showdownPin?: string;
}

// ---------------------------------------------------------------------------
// slugify — @pkmn display name → PokeAPI-style hyphenated slug
// ---------------------------------------------------------------------------

/**
 * Override map for the handful of names whose generic slugify differs from the
 * legacy PokeAPI slug. Keyed by @pkmn id (lowercased alnum). Extend as the
 * parity check surfaces divergences.
 */
const SLUG_OVERRIDES: Readonly<Record<string, string>> = {
  // (id from @pkmn) : (legacy PokeAPI slug)
  // none needed yet — slugify handles farfetch'd, mr. mime, flabébé, etc.
};

/**
 * Convert an @pkmn display name (e.g. "Will-O-Wisp", "Tauros-Paldea-Aqua",
 * "Farfetch'd", "Flabébé") to the project's legacy PokeAPI-style slug
 * ("will-o-wisp", "tauros-paldea-aqua", "farfetchd", "flabebe").
 *
 * Strips diacritics, drops apostrophes/periods, and collapses any other run of
 * non-alphanumerics to a single hyphen. Keeps PKs / searchable_names / reference
 * keys / citations stable across the PokeAPI→@pkmn migration.
 */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/['.]/g, "") // farfetch'd → farfetchd, mr. → mr
    .replace(/[^a-z0-9]+/g, "-") // any other run → single hyphen
    .replace(/^-+|-+$/g, "");
}

/** Slug for a species/move/etc, applying overrides keyed by @pkmn id. */
export function slugFor(id: string, name: string): string {
  return SLUG_OVERRIDES[id] ?? slugify(name);
}

// ---------------------------------------------------------------------------
// Type filtering
// ---------------------------------------------------------------------------

/**
 * The 18 classic battle types. Excludes "Stellar" (a Gen-9 Tera-only type with
 * no normal defensive chart; absent from the legacy 18-type index and irrelevant
 * to Champions, where Tera is disabled) and any pseudo-types.
 */
const BATTLE_TYPE_NAMES: ReadonlySet<string> = new Set([
  "Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison",
  "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark",
  "Steel", "Fairy",
]);

// ---------------------------------------------------------------------------
// Roster enumeration
// ---------------------------------------------------------------------------

/**
 * @param allowFuture — when true (Gen 9 formats), keep `isNonstandard ===
 *   "Future"` entries. On Gen 9 those are Legends Z-A / Champions megas already
 *   present in @pkmn but not SV-legal. On gen ≤8, Future means later-generation
 *   content and must stay dropped.
 */
function isRealSpecies(
  s: PkmnSpecies,
  opts: { allowFuture: boolean },
): boolean {
  return (
    s.exists &&
    typeof s.num === "number" &&
    s.num > 0 &&
    s.isNonstandard !== "CAP" &&
    s.isNonstandard !== "Custom" &&
    // Older-gen dexes: later-gen species surface as "Future" and must not be
    // indexed (unlike "Past", which we KEEP as BR-1 fallbacks). Gen 9: keep
    // Future so Z-A megas index into scarlet-violet / national-dex.
    (opts.allowFuture || s.isNonstandard !== "Future")
  );
}

/**
 * Standard / mainline roster: the full national-dex view as @pkmn knows it in
 * the resolved generation — real species + battle formes, INCLUDING species not
 * native to the current game (`isNonstandard === "Past"` or, on Gen 9,
 * `"Future"` Z-A megas), so the scope keeps answering about the whole reachable
 * dex with a native/fallback flag (BR-1). Native ⟺ `isNonstandard` is falsy;
 * otherwise the species is a fallback from `gen-{n}`. For gen scopes 1–8 this
 * is the `Dex.forGen(n)` view, whose later-generation species are dropped as
 * "Future" by {@link isRealSpecies}.
 */
function standardRoster(dex: PkmnDex, genNumber: number): PkmnSpecies[] {
  const allowFuture = genNumber >= 9;
  return dex.species.all().filter((s) => isRealSpecies(s, { allowFuture }));
}

/**
 * Champions roster: species whose FormatsData entry is legal (falsy
 * `isNonstandard`), resolved against the modded dex. Includes Megas as distinct
 * species. (FormatsData is the legality gate — `dex.species.all()` is NOT.)
 */
function championsRoster(dex: PkmnDex, champData: ModData): PkmnSpecies[] {
  const fd = (champData as { FormatsData?: Record<string, { isNonstandard?: unknown }> })
    .FormatsData;
  if (!fd) return [];
  const out: PkmnSpecies[] = [];
  for (const id of Object.keys(fd)) {
    if (fd[id]?.isNonstandard) continue; // not legal in Champions
    const sp = dex.species.get(id);
    if (sp && sp.exists && sp.baseStats && typeof sp.num === "number" && sp.num > 0) {
      out.push(sp);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// loadFormat
// ---------------------------------------------------------------------------

/**
 * Resolve the data source for a format. Async because the Champions path
 * dynamically imports the vendored Showdown pin (keeps it out of gen-scope).
 */
export async function loadFormat(format: Format): Promise<FormatSource> {
  let dex: PkmnDex;
  let roster: PkmnSpecies[];
  let genNumber: number;
  let showdownPin: string | undefined;

  if (format === CHAMPIONS_FORMAT) {
    const loaded = await loadChampionsShowdownMod();
    showdownPin = loaded.pinSha;
    // Unique mod id so a leftover npm `champions` cache cannot win, and so
    // Dex.forGen paths stay on the gen9 singleton.
    const modid = `champions-${SHOWDOWN_PIN.sha.slice(0, 12)}` as ID;
    dex = Dex.mod(modid, loaded.modData);
    roster = championsRoster(dex, loaded.modData);
    genNumber = 9; // Champions rides the Gen 9 dex.
  } else {
    const gen = genNumberForFormat(format); // 9 for "scarlet-violet"/"national-dex", else 1–8
    dex = Dex.forGen(gen);
    roster = standardRoster(dex, gen);
    genNumber = gen;
  }

  const types = dex.types.all().filter((t) => BATTLE_TYPE_NAMES.has(t.name));
  // As with isRealSpecies above: in an older-gen dex (e.g. Dex.forGen(3)),
  // moves/abilities/items introduced in a LATER generation surface as
  // isNonstandard === "Future" (e.g. Absolite, Earth Power, Download in
  // Dex.forGen(3)) and must not be indexed. "Past" entries are KEPT — the
  // Gen 9 dex marks now-delisted things like Mega Stones as "Past", and
  // national-dex/scarlet-violet/champions must keep indexing them (BR-1).
  // Gen 9 also keeps Future entities (Z-A mega stones / mega abilities).
  const allowFuture = genNumber >= 9;
  const isIndexableEntity = (x: {
    exists: boolean;
    isNonstandard?: string | null;
  }): boolean =>
    x.exists &&
    x.isNonstandard !== "CAP" &&
    (allowFuture || x.isNonstandard !== "Future");
  const moves = dex.moves.all().filter(isIndexableEntity);
  const abilities = dex.abilities
    .all()
    .filter((a) => isIndexableEntity(a) && a.id !== "noability");
  const items = dex.items.all().filter(isIndexableEntity);
  const natures = dex.natures.all().filter((n) => n.exists);

  return {
    format,
    genNumber,
    dex,
    roster,
    moves,
    abilities,
    items,
    types,
    natures,
    showdownPin,
    async getLearnset(speciesId: string): Promise<Record<string, string[]>> {
      const own = await readLearnset(dex, speciesId);
      if (Object.keys(own).length > 0) return own;
      // Champions (and some mega keys on gen-scope) omit forme learnsets;
      // inherit from the base species so ingest/UI never see a silent empty.
      const sp = dex.species.get(speciesId);
      if (sp?.baseSpecies && sp.baseSpecies !== sp.name) {
        const base = dex.species.get(sp.baseSpecies);
        if (base?.exists) return readLearnset(dex, base.id);
      }
      return own;
    },
  };
}

async function readLearnset(
  dex: PkmnDex,
  speciesId: string,
): Promise<Record<string, string[]>> {
  const ls = await dex.learnsets.get(speciesId);
  const learnset = (ls as { learnset?: Record<string, string[]> } | null)?.learnset;
  return learnset ?? {};
}
