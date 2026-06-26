/**
 * DS-2 Pokédex index builder — Phase 3 of the ingest pipeline.
 *
 * Exports:
 *   PokemonRow    — interface mirroring the `pokemon` table columns exactly
 *                   (src/data/schema.ts).
 *   buildPokemonRow — pure transform from /pokemon + /pokemon-species resources
 *                     to a PokemonRow. No I/O; tested in build-pokedex.test.ts.
 *   buildPokedex  — orchestrating crawler: fetches all species → forms via
 *                   PokeApiClient, applies the D8 forms rule, returns PokemonRow[].
 *
 * Rules enforced:
 *   D8  (data-sources.md § Forms handling) — each battle-relevant form is a
 *       distinct indexed row; purely cosmetic forms (identical type / stats /
 *       abilities to the base form) are collapsed to nothing (the base row
 *       already covers them).
 *   BR-1 (design.md § pokemon table) — is_gen9_native / source_generation are
 *       set based on whether the pokemon has any move entries in a Gen-9
 *       version group.
 */

import type { Json, PokeApiClient, PokeApiError } from "@/data/pokeapi-client";

// ---------------------------------------------------------------------------
// PokeAPI error classification (RISK DIRECTIVE — reuse-last-good)
// ---------------------------------------------------------------------------

/**
 * Classify a PokeApiError as a FATAL upstream outage vs. a benign "this
 * resource genuinely doesn't exist" (404).
 *
 * The crawl-then-write discipline requires that any sustained PokeAPI failure
 * aborts the build BEFORE the first SQLite write, so run.ts's catch can reuse
 * the last-good index instead of overwriting it with a partial/smaller one.
 * Only a true 404 (resource missing) is safe to skip-and-continue.
 *
 *   - network_error                          → fatal (host unreachable / DNS /
 *                                               timeout, retries exhausted).
 *   - http_error, retryable status (429/5xx) → fatal (the client already
 *                                               exhausted its retries on a
 *                                               transient status → outage).
 *   - http_error, non-retryable status (404,
 *     400, …)                                → NOT fatal (skip this resource).
 */
export function isFatalPokeApiError(error: PokeApiError): boolean {
  if (error.code === "network_error") return true;
  // RETRYABLE_STATUSES in pokeapi-client = {429, 500, 502, 503, 504}; any such
  // status surfacing as an error means retries were exhausted → sustained.
  return error.status === 429 || error.status >= 500;
}

/** Compact, log-friendly one-line description of a PokeApiError. */
export function describePokeApiError(error: PokeApiError): string {
  if (error.code === "network_error") {
    return `network_error (${error.url}): ${error.detail} after ${error.attempts} attempts`;
  }
  return `http_error ${error.status} (${error.url}) after ${error.attempts} attempts`;
}

// ---------------------------------------------------------------------------
// PokemonRow — mirrors the `pokemon` table columns in src/data/schema.ts
// ---------------------------------------------------------------------------

export interface PokemonRow {
  /** PokeAPI pokemon slug, e.g. "tauros-paldea-aqua". PK. */
  id: string;
  /** Species slug, e.g. "tauros". */
  species_name: string;
  /** Form suffix, e.g. "paldea-aqua"; null for the base form. */
  form_name: string | null;
  /** Human-readable label, e.g. "Tauros (Paldea-Aqua)". */
  display_name: string;
  national_dex_number: number;
  type1: string;
  type2: string | null;
  ability_slot1: string;
  ability_slot2: string | null;
  ability_hidden: string | null;
  stat_hp: number;
  stat_attack: number;
  stat_defense: number;
  stat_special_attack: number;
  stat_special_defense: number;
  stat_speed: number;
  /** Precomputed sum of all six base stats. */
  base_stat_total: number;
  sprite_url: string;
  artwork_url: string;
  /** Always "gen-9" in the DS-2 index. */
  generation: string;
  /** 1 if the form has moves in a Gen-9 version group; 0 otherwise (BR-1). */
  is_gen9_native: 0 | 1;
  /** Set when is_gen9_native = 0, e.g. "gen-8" (BR-1); null when native. */
  source_generation: string | null;
}

// ---------------------------------------------------------------------------
// Internal JSON navigation helpers — avoid unsafe `as any` casts
// ---------------------------------------------------------------------------

function asObj(v: Json | undefined): Record<string, Json> | null {
  if (
    v !== null &&
    v !== undefined &&
    typeof v === "object" &&
    !Array.isArray(v)
  ) {
    return v as Record<string, Json>;
  }
  return null;
}

function asArr(v: Json | undefined): Json[] | null {
  return Array.isArray(v) ? v : null;
}

function asStr(v: Json | undefined): string | null {
  return typeof v === "string" ? v : null;
}

function asNum(v: Json | undefined): number | null {
  return typeof v === "number" ? v : null;
}

// ---------------------------------------------------------------------------
// Generation slug helpers
// ---------------------------------------------------------------------------

const ROMAN_TO_NUM: Readonly<Record<string, number>> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
};

/**
 * Convert a PokeAPI generation name to a gen-slug.
 * "generation-viii" → "gen-8"
 * "generation-ix"  → "gen-9"
 */
function generationNameToSlug(genName: string): string {
  const match = /^generation-(.+)$/i.exec(genName);
  if (!match) return genName.toLowerCase();
  const roman = match[1].toLowerCase();
  const num = ROMAN_TO_NUM[roman];
  return num !== undefined ? `gen-${num}` : genName.toLowerCase();
}

// ---------------------------------------------------------------------------
// Display-name helpers
// ---------------------------------------------------------------------------

/**
 * Title-case a slug segment: "paldea-aqua" → "Paldea-Aqua".
 * Each hyphen-separated word is individually capitalised.
 */
function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join("-");
}

function makeDisplayName(speciesName: string, formName: string | null): string {
  if (formName === null) {
    return titleCase(speciesName);
  }
  return `${titleCase(speciesName)} (${titleCase(formName)})`;
}

// ---------------------------------------------------------------------------
// buildPokemonRow — pure, synchronous transform (tested against fixtures)
// ---------------------------------------------------------------------------

/**
 * Map a single PokeAPI `/pokemon/{id}` resource and its `/pokemon-species/{id}`
 * resource to a PokemonRow.
 *
 * This function is pure (no I/O, no side-effects) and is tested directly
 * against recorded fixtures in build-pokedex.test.ts.
 */
export function buildPokemonRow(
  pokemon: Json,
  species: Json,
  opts: { gen9VersionGroups: string[] },
): PokemonRow {
  const p = asObj(pokemon)!;
  const s = asObj(species)!;
  const { gen9VersionGroups } = opts;

  // id and species_name -------------------------------------------------
  const id = asStr(p["name"])!;
  const speciesRef = asObj(p["species"]);
  const species_name = speciesRef ? (asStr(speciesRef["name"]) ?? id) : id;

  // form_name -----------------------------------------------------------
  // null for the base form (when pokemon slug === species slug).
  // Otherwise strip the "<species_name>-" prefix to get the form suffix.
  let form_name: string | null = null;
  if (id !== species_name) {
    const prefix = species_name + "-";
    form_name = id.startsWith(prefix) ? id.slice(prefix.length) : id;
  }

  // national dex number -------------------------------------------------
  const pokedexNumbers = asArr(s["pokedex_numbers"]) ?? [];
  let national_dex_number = 0;
  for (const entry of pokedexNumbers) {
    const e = asObj(entry);
    if (!e) continue;
    const dex = asObj(e["pokedex"]);
    if (dex && asStr(dex["name"]) === "national") {
      national_dex_number = asNum(e["entry_number"]) ?? 0;
      break;
    }
  }
  // Fallback to the numeric `id` field on the species resource
  if (national_dex_number === 0) {
    national_dex_number = asNum(s["id"]) ?? 0;
  }

  // types (ordered by slot) ---------------------------------------------
  const typesRaw = asArr(p["types"]) ?? [];
  const typesSorted = typesRaw.slice().sort((a, b) => {
    const aSlot = asNum(asObj(a)?.["slot"]) ?? 99;
    const bSlot = asNum(asObj(b)?.["slot"]) ?? 99;
    return aSlot - bSlot;
  });

  const type1Obj = asObj(typesSorted[0]);
  const type1 = asStr(asObj(type1Obj?.["type"])?.["name"]) ?? "normal";

  const type2Raw = typesSorted[1];
  const type2 = type2Raw
    ? (asStr(asObj(asObj(type2Raw)?.["type"])?.["name"]) ?? null)
    : null;

  // abilities -----------------------------------------------------------
  // Slot 1/2 are non-hidden, assigned in slot-number order.
  // is_hidden = true → ability_hidden.
  const abilitiesRaw = asArr(p["abilities"]) ?? [];
  const abilitiesSorted = abilitiesRaw.slice().sort((a, b) => {
    const aSlot = asNum(asObj(a)?.["slot"]) ?? 99;
    const bSlot = asNum(asObj(b)?.["slot"]) ?? 99;
    return aSlot - bSlot;
  });

  let ability_slot1: string | null = null;
  let ability_slot2: string | null = null;
  let ability_hidden: string | null = null;

  for (const ab of abilitiesSorted) {
    const abObj = asObj(ab);
    if (!abObj) continue;
    const isHidden = abObj["is_hidden"] === true;
    const abilityName = asStr(asObj(abObj["ability"])?.["name"]);
    if (!abilityName) continue;

    if (isHidden) {
      ability_hidden = abilityName;
    } else if (ability_slot1 === null) {
      ability_slot1 = abilityName;
    } else if (ability_slot2 === null) {
      ability_slot2 = abilityName;
    }
  }
  // ability_slot1 is NOT NULL in the schema — use a placeholder only if
  // PokeAPI data is unexpectedly missing (should never happen in production).
  if (ability_slot1 === null) {
    ability_slot1 = "none";
  }

  // base stats ----------------------------------------------------------
  const statsRaw = asArr(p["stats"]) ?? [];
  const statMap: Record<string, number> = {};
  for (const stat of statsRaw) {
    const statObj = asObj(stat);
    if (!statObj) continue;
    const statName = asStr(asObj(statObj["stat"])?.["name"]);
    const baseStat = asNum(statObj["base_stat"]);
    if (statName !== null && baseStat !== null) {
      statMap[statName] = baseStat;
    }
  }

  const stat_hp = statMap["hp"] ?? 0;
  const stat_attack = statMap["attack"] ?? 0;
  const stat_defense = statMap["defense"] ?? 0;
  const stat_special_attack = statMap["special-attack"] ?? 0;
  const stat_special_defense = statMap["special-defense"] ?? 0;
  const stat_speed = statMap["speed"] ?? 0;
  const base_stat_total =
    stat_hp +
    stat_attack +
    stat_defense +
    stat_special_attack +
    stat_special_defense +
    stat_speed;

  // sprites -------------------------------------------------------------
  const spritesObj = asObj(p["sprites"]);
  const sprite_url = asStr(spritesObj?.["front_default"]) ?? "";
  const otherSprites = asObj(spritesObj?.["other"]);
  const officialArtwork = asObj(otherSprites?.["official-artwork"]);
  const artwork_url = asStr(officialArtwork?.["front_default"]) ?? "";

  // is_gen9_native / source_generation (BR-1) ---------------------------
  // A form is Gen-9 native if it has at least one move whose
  // version_group_details[] entry names a Gen-9 version group.
  const movesRaw = asArr(p["moves"]) ?? [];
  let is_gen9_native: 0 | 1 = 0;

  outer: for (const move of movesRaw) {
    const moveObj = asObj(move);
    if (!moveObj) continue;
    const vgDetails = asArr(moveObj["version_group_details"]) ?? [];
    for (const vgd of vgDetails) {
      const vgdObj = asObj(vgd);
      const vgName = asStr(asObj(vgdObj?.["version_group"])?.["name"]);
      if (vgName !== null && gen9VersionGroups.includes(vgName)) {
        is_gen9_native = 1;
        break outer;
      }
    }
  }

  let source_generation: string | null = null;
  if (is_gen9_native === 0) {
    const genName = asStr(asObj(s["generation"])?.["name"]);
    source_generation = genName !== null ? generationNameToSlug(genName) : null;
  }

  return {
    id,
    species_name,
    form_name,
    display_name: makeDisplayName(species_name, form_name),
    national_dex_number,
    type1,
    type2,
    ability_slot1,
    ability_slot2,
    ability_hidden,
    stat_hp,
    stat_attack,
    stat_defense,
    stat_special_attack,
    stat_special_defense,
    stat_speed,
    base_stat_total,
    sprite_url,
    artwork_url,
    generation: "gen-9",
    is_gen9_native,
    source_generation,
  };
}

// ---------------------------------------------------------------------------
// D8 forms-rule helper
// ---------------------------------------------------------------------------

/**
 * Returns true when a non-default form is battle-relevant — i.e. when it
 * differs from the base form in type, stats, or abilities (D8).
 *
 * Purely cosmetic forms (e.g. variant patterns with identical battle data)
 * return false and are collapsed to the base row by the caller.
 */
function isBattleRelevant(form: PokemonRow, base: PokemonRow): boolean {
  // types
  if (form.type1 !== base.type1 || form.type2 !== base.type2) return true;
  // base stats
  if (
    form.stat_hp !== base.stat_hp ||
    form.stat_attack !== base.stat_attack ||
    form.stat_defense !== base.stat_defense ||
    form.stat_special_attack !== base.stat_special_attack ||
    form.stat_special_defense !== base.stat_special_defense ||
    form.stat_speed !== base.stat_speed
  )
    return true;
  // abilities
  if (
    form.ability_slot1 !== base.ability_slot1 ||
    form.ability_slot2 !== base.ability_slot2 ||
    form.ability_hidden !== base.ability_hidden
  )
    return true;
  return false;
}

// ---------------------------------------------------------------------------
// buildPokedex — orchestrating crawler
// ---------------------------------------------------------------------------

/**
 * Build the full DS-2 Pokédex index by crawling PokeAPI.
 *
 * Strategy:
 *   1. Fetch the paginated `/pokemon-species?limit=10000` list.
 *   2. For each species, fetch its detail resource to discover varieties.
 *   3. For each variety, fetch the `/pokemon/{id}` resource.
 *   4. Call `buildPokemonRow` for every variety.
 *   5. Apply D8 forms rule: include the base form always; include a non-default
 *      form only if it is battle-relevant (differs from base in type/stats/abilities).
 *
 * Errors (RISK DIRECTIVE — reuse-last-good):
 *   - The initial species-list fetch throws on ANY failure.
 *   - A per-species or per-variety FATAL error (network_error, or a retryable
 *     429/5xx that exhausted retries — i.e. a sustained upstream outage) also
 *     throws, so the caller (run.ts) aborts before the first write and reuses
 *     the last-good index rather than persisting a partial, smaller build.
 *   - Only a genuine 404 (resource truly missing) is skip-and-continue, so one
 *     bad/legacy resource doesn't abort the entire build.
 *
 * @param client         The PokeApiClient instance (throttled + retrying).
 * @param opts           Build options including the Gen-9 version group slugs.
 * @param onProgress     Optional callback fired after each species is processed
 *                       (useful for CLI progress feedback).
 */
export async function buildPokedex(
  client: PokeApiClient,
  opts: { gen9VersionGroups: string[] },
  onProgress?: (done: number, total: number) => void,
): Promise<PokemonRow[]> {
  // 1. Fetch the full species list ----------------------------------------
  const listResult = await client.get("pokemon-species?limit=10000");
  if (!listResult.ok) {
    throw new Error(
      `build-pokedex: failed to fetch pokemon-species list — ${listResult.error.code} (${listResult.error.url})`,
    );
  }
  const listObj = asObj(listResult.value);
  const speciesRefs = asArr(listObj?.["results"]) ?? [];
  const total = speciesRefs.length;

  const rows: PokemonRow[] = [];

  // 2. Iterate every species -----------------------------------------------
  for (let i = 0; i < speciesRefs.length; i++) {
    const speciesRef = asObj(speciesRefs[i]);
    const speciesUrl = asStr(speciesRef?.["url"]);
    if (!speciesUrl) continue;

    // Fetch species detail
    const speciesResult = await client.get(speciesUrl);
    if (!speciesResult.ok) {
      // Fatal upstream error (network / sustained 429-5xx) → abort the whole
      // build so run.ts can reuse the last-good index. Only a true 404 is
      // skipped (the species genuinely doesn't exist).
      if (isFatalPokeApiError(speciesResult.error)) {
        throw new Error(
          `build-pokedex: fatal PokeAPI error fetching species — ${describePokeApiError(speciesResult.error)}`,
        );
      }
      continue;
    }
    const speciesData = speciesResult.value;
    const speciesObj = asObj(speciesData);

    // 3. Collect variety rows (fetch each pokemon form) --------------------
    const varieties = asArr(speciesObj?.["varieties"]) ?? [];
    const collectedRows: Array<{ isDefault: boolean; row: PokemonRow }> = [];

    for (const variety of varieties) {
      const varietyObj = asObj(variety);
      const isDefault = varietyObj?.["is_default"] === true;
      const pokemonRef = asObj(varietyObj?.["pokemon"]);
      const pokemonUrl = asStr(pokemonRef?.["url"]);
      if (!pokemonUrl) continue;

      const pokemonResult = await client.get(pokemonUrl);
      if (!pokemonResult.ok) {
        // Fatal upstream error → abort (reuse-last-good); only skip true 404s.
        if (isFatalPokeApiError(pokemonResult.error)) {
          throw new Error(
            `build-pokedex: fatal PokeAPI error fetching variety — ${describePokeApiError(pokemonResult.error)}`,
          );
        }
        continue; // genuine 404 → skip this form only
      }

      const row = buildPokemonRow(pokemonResult.value, speciesData, opts);
      collectedRows.push({ isDefault, row });
    }

    // 4. Apply D8 forms rule -----------------------------------------------
    const baseEntry = collectedRows.find((e) => e.isDefault);
    const baseRow = baseEntry?.row ?? null;

    for (const { isDefault, row } of collectedRows) {
      if (isDefault) {
        rows.push(row);
      } else if (baseRow === null || isBattleRelevant(row, baseRow)) {
        // Battle-relevant non-default form → distinct row
        rows.push(row);
      }
      // Purely cosmetic form (identical battle data to base) → omit
    }

    onProgress?.(i + 1, total);
  }

  return rows;
}
