/**
 * gen-provider.ts — the SINGLE @pkmn integration point for the ingest pipeline.
 *
 * After the migration, all index data comes from the @pkmn ecosystem (local npm
 * packages — no network, no throttle, no read-through cache):
 *   - standard (`scarlet-violet`)    ← `Dex.forGen(9)`
 *   - champions                      ← `Dex.mod('champions', @pkmn/mods/champions)`
 *   - national-dex                   ← `Dex.forGen(9)` (same path as standard,
 *                                       under a new format name — no new branch
 *                                       needed; see loadFormat's else arm)
 *   - gen scopes (`gen-1`…`gen-8`)    ← `Dex.forGen(n)` (generation-scope feature)
 *
 * The ingest builders consume the `FormatSource` returned by {@link loadFormat}
 * and never import @pkmn directly, so every @pkmn-specific quirk lives here.
 *
 * Verified facts (probed against @pkmn/{dex,mods} 0.10.11):
 *   - The Champions legal roster is NOT `dex.species.all()` (that is the full
 *     ~876 gen-9 set). It lives in the mod's FormatsData: a species is legal iff
 *     its FormatsData entry has a falsy `isNonstandard`. That yields ~314 legal
 *     species including ~76 Megas (restricted legendaries excluded for Reg M-B).
 *   - `Dex.mod` applies the mod's ~259 move + 13 ability overrides, and Mega
 *     species resolve via `modDex.species.get('venusaurmega')`.
 *   - Champions learnsets via `modDex.learnsets.get(id)` are genuinely scoped.
 *   - Move source strings encode gen+method at indexes 0/1 ('9M','9L42','9E'…).
 *   - `Dex.forGen(7)` returns a gen-7-scoped view: its roster (real species,
 *     >700) EXCLUDES gen 8/9 species — those surface with `isNonstandard ===
 *     "Future"`, which `isRealSpecies` now drops (so e.g. Grookey is absent from
 *     a gen-7 roster). `"Past"` species are KEPT (the BR-1 native/fallback flag).
 *     `getLearnset('raichualola')` is non-empty in gen 7.
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

function isRealSpecies(s: PkmnSpecies): boolean {
  return (
    s.exists &&
    typeof s.num === "number" &&
    s.num > 0 &&
    s.isNonstandard !== "CAP" &&
    s.isNonstandard !== "Custom" &&
    // In an older-gen dex (e.g. Dex.forGen(7)) species introduced in a LATER
    // generation surface as `isNonstandard === "Future"`; they are not part of
    // that gen's game and must not be indexed (unlike "Past" species, which we
    // KEEP as native/fallback rows — BR-1). No-op for the Gen 9 dex.
    s.isNonstandard !== "Future"
  );
}

/**
 * Standard / mainline roster: the full national-dex view as @pkmn knows it in
 * the resolved generation — real species + battle formes, INCLUDING species not
 * native to the current game (`isNonstandard === "Past"`), so the scope keeps
 * answering about the whole reachable dex with a native/fallback flag (BR-1),
 * matching today's Gen 9 behavior. Native ⟺ `isNonstandard` is falsy; otherwise
 * the species is a fallback from `gen-{n}`. For gen scopes 1–8 (and
 * `national-dex`) this is the `Dex.forGen(n)` view, whose later-generation
 * species are dropped as "Future" by {@link isRealSpecies}.
 */
function standardRoster(dex: PkmnDex): PkmnSpecies[] {
  return dex.species.all().filter(isRealSpecies);
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
 * Resolve the @pkmn data source for a format. Async because the Champions mod is
 * dynamically imported (keeps @pkmn/mods out of the standard-mode path).
 */
export async function loadFormat(format: Format): Promise<FormatSource> {
  let dex: PkmnDex;
  let roster: PkmnSpecies[];
  let genNumber: number;

  if (format === CHAMPIONS_FORMAT) {
    const champData = (await import("@pkmn/mods/champions")) as unknown as ModData;
    dex = Dex.mod("champions" as ID, champData);
    roster = championsRoster(dex, champData);
    genNumber = 9; // Champions rides the Gen 9 dex.
  } else {
    const gen = genNumberForFormat(format); // 9 for "scarlet-violet"/"national-dex", else 1–8
    dex = Dex.forGen(gen);
    roster = standardRoster(dex);
    genNumber = gen;
  }

  const types = dex.types.all().filter((t) => BATTLE_TYPE_NAMES.has(t.name));
  const moves = dex.moves.all().filter((m) => m.exists && m.isNonstandard !== "CAP");
  const abilities = dex.abilities
    .all()
    .filter((a) => a.exists && a.isNonstandard !== "CAP" && a.id !== "noability");
  const items = dex.items.all().filter((i) => i.exists && i.isNonstandard !== "CAP");
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
    async getLearnset(speciesId: string): Promise<Record<string, string[]>> {
      const ls = await dex.learnsets.get(speciesId);
      const learnset = (ls as { learnset?: Record<string, string[]> } | null)?.learnset;
      return learnset ?? {};
    },
  };
}
