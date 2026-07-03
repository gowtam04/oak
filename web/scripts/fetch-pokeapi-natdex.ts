/**
 * scripts/fetch-pokeapi-natdex.ts — the OFFLINE snapshot builder for Oak's
 * global, Pokédex-wide "natdex" warehouse tables (Oak v2, design §4.1).
 *
 * This is the SECOND network-touching script in the repo (the first is
 * fetch-pokeapi-encounters.ts). Like that one it is run MANUALLY and RARELY
 * (`npm run fetch:natdex`) — NEVER by `npm run ingest`. It downloads the
 * veekun-derived CSVs from the PokeAPI repo (raw.githubusercontent.com,
 * permissive license) plus the Pokémon Mystery Dungeon dataset CSV
 * (github.com/pa5sarinho/pmd_dataset), trims them to just the columns the new
 * tables need, resolves numeric ids to human PokeAPI-style slugs, and writes
 * committed offline snapshots to src/ingest/data/:
 *
 *   natdex.json            — one row per species (natdex#, gen, color, shape,
 *                            capture rate, BST, evolves-from, types)
 *   machines.json          — TM/HM/TR machines per version group
 *   natdex-moves.json      — every move's gen / type / damage-class (covers the
 *                            Gens 1–4 gap @pkmn's per-format learnsets omit)
 *   classic-encounters.json.gz — wild encounter tables, Gens 1–7 ONLY (gzipped:
 *                            ~70k rows), best-effort (PokeAPI has no Gen 8–9 data)
 *   pmd.json               — Mystery Dungeon recruit locations + rates
 *
 * The ingest pipeline reads these via `fs` (see src/ingest/build-natdex.ts etc.)
 * so ingest stays 100% offline + deterministic and the multi-MB blobs never
 * enter the Next bundle.
 *
 * All snapshots are GLOBAL — keyed by species/version-group/move slug, with NO
 * Oak `format` column (these tables are not format-partitioned).
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const POKEAPI_CSV =
  "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv";
const PMD_CSV =
  "https://raw.githubusercontent.com/pa5sarinho/pmd_dataset/main/PMD_data.csv";
const USER_AGENT =
  "Oak-PokemonAgent/1.0 (offline natdex snapshot builder; contact: oak app)";
const SNAPSHOT_VERSION = 1;
const GENERATED_AT = new Date().toISOString().slice(0, 10);

/** Generations covered by PokeAPI's wild-encounter data (Gens 8–9 are empty). */
const CLASSIC_ENCOUNTER_MAX_GEN = 7;

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, "..");
const OUT_DIR = path.resolve(PROJECT_ROOT, "src", "ingest", "data");

// ---------------------------------------------------------------------------
// Tiny CSV parser (handles quoted fields with embedded commas / quotes / CRLF)
// ---------------------------------------------------------------------------

/** Parse CSV text into an array of records keyed by the header row. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      // Consume \r\n as a single break; ignore a bare trailing \r.
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      // Skip fully-empty trailing lines.
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows[0]!;
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]!] = r[j] ?? "";
    return obj;
  });
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** GET a text body with a couple of polite retries. */
async function getText(url: string, retries = 3): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (attempt >= retries) throw e;
      await sleep(500 * (attempt + 1));
    }
  }
}

/** Fetch + parse one PokeAPI CSV by base name (e.g. "moves"). */
async function fetchCsv(name: string): Promise<Record<string, string>[]> {
  const rows = parseCsv(await getText(`${POKEAPI_CSV}/${name}.csv`));
  console.log(`[natdex]   ${name}.csv: ${rows.length} rows`);
  return rows;
}

const num = (s: string | undefined): number | null =>
  s == null || s === "" ? null : Number.parseInt(s, 10);

// ---------------------------------------------------------------------------
// Snapshot shapes (mirrored by the builder modules)
// ---------------------------------------------------------------------------

export interface NatdexSpecies {
  slug: string;
  natdex: number;
  gen: number;
  color: string | null;
  shape: string | null;
  capture_rate: number | null;
  bst: number;
  evolves_from: string | null;
  type1: string;
  type2: string | null;
}

export interface NatdexMachine {
  version_group: string;
  machine: string; // "HM02" / "TM24" / "TR50"
  move_slug: string;
  item_slug: string;
}

export interface NatdexMove {
  slug: string;
  gen: number;
  type: string | null;
  damage_class: string | null;
}

export interface ClassicEncounter {
  version: string;
  location: string;
  area: string | null;
  method: string;
  species: string;
  rarity: number | null;
  min_level: number | null;
  max_level: number | null;
}

export interface PmdRecruit {
  game: string;
  species: string;
  location: string;
  recruit_rate: string | null;
  friend_area: string | null;
}

interface Snapshot<T> {
  snapshot_version: number;
  generated_at: string;
  source: string;
  [key: string]: unknown;
  rows: T[];
}

function writeJson<T>(file: string, source: string, key: string, rows: T[]): void {
  const payload = {
    snapshot_version: SNAPSHOT_VERSION,
    generated_at: GENERATED_AT,
    source,
    [key]: rows,
  };
  const out = path.resolve(OUT_DIR, file);
  fs.writeFileSync(out, JSON.stringify(payload), "utf8");
  const mb = (fs.statSync(out).size / (1024 * 1024)).toFixed(2);
  console.log(`[natdex] wrote ${file} (${mb} MB, ${rows.length} rows)`);
}

function writeJsonGz<T>(file: string, source: string, key: string, rows: T[]): void {
  const payload = {
    snapshot_version: SNAPSHOT_VERSION,
    generated_at: GENERATED_AT,
    source,
    [key]: rows,
  };
  const out = path.resolve(OUT_DIR, file);
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(payload), "utf8"), {
    level: 9,
  });
  fs.writeFileSync(out, gz);
  const mb = (fs.statSync(out).size / (1024 * 1024)).toFixed(2);
  console.log(`[natdex] wrote ${file} (${mb} MB gzipped, ${rows.length} rows)`);
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

async function buildSpecies(): Promise<NatdexSpecies[]> {
  const [species, colors, shapes, pokemon, stats, ptypes, types] =
    await Promise.all([
      fetchCsv("pokemon_species"),
      fetchCsv("pokemon_colors"),
      fetchCsv("pokemon_shapes"),
      fetchCsv("pokemon"),
      fetchCsv("pokemon_stats"),
      fetchCsv("pokemon_types"),
      fetchCsv("types"),
    ]);

  const colorSlug = new Map(colors.map((c) => [c.id!, c.identifier!]));
  const shapeSlug = new Map(shapes.map((s) => [s.id!, s.identifier!]));
  const typeSlug = new Map(types.map((t) => [t.id!, t.identifier!]));
  const speciesSlugById = new Map(species.map((s) => [s.id!, s.identifier!]));

  // Default pokemon row per species → its stats + types.
  const defaultPokemonBySpecies = new Map<string, string>(); // species_id -> pokemon_id
  for (const p of pokemon) {
    if (p.is_default === "1") defaultPokemonBySpecies.set(p.species_id!, p.id!);
  }
  const bstByPokemon = new Map<string, number>();
  for (const st of stats) {
    bstByPokemon.set(
      st.pokemon_id!,
      (bstByPokemon.get(st.pokemon_id!) ?? 0) + (num(st.base_stat) ?? 0),
    );
  }
  const typesByPokemon = new Map<string, { slot: number; type: string }[]>();
  for (const pt of ptypes) {
    const list = typesByPokemon.get(pt.pokemon_id!) ?? [];
    list.push({ slot: num(pt.slot) ?? 0, type: typeSlug.get(pt.type_id!) ?? "" });
    typesByPokemon.set(pt.pokemon_id!, list);
  }

  const rows: NatdexSpecies[] = [];
  for (const s of species) {
    const defPoke = defaultPokemonBySpecies.get(s.id!);
    const bst = defPoke ? (bstByPokemon.get(defPoke) ?? 0) : 0;
    const typeList = (defPoke ? typesByPokemon.get(defPoke) : undefined) ?? [];
    typeList.sort((a, b) => a.slot - b.slot);
    rows.push({
      slug: s.identifier!,
      natdex: num(s.id) ?? 0,
      gen: num(s.generation_id) ?? 0,
      color: s.color_id ? (colorSlug.get(s.color_id) ?? null) : null,
      shape: s.shape_id ? (shapeSlug.get(s.shape_id) ?? null) : null,
      capture_rate: num(s.capture_rate),
      bst,
      evolves_from: s.evolves_from_species_id
        ? (speciesSlugById.get(s.evolves_from_species_id) ?? null)
        : null,
      type1: typeList[0]?.type ?? "",
      type2: typeList[1]?.type ?? null,
    });
  }
  rows.sort((a, b) => a.natdex - b.natdex);
  return rows;
}

async function buildMachines(): Promise<NatdexMachine[]> {
  const [machines, items, moves, vgroups] = await Promise.all([
    fetchCsv("machines"),
    fetchCsv("items"),
    fetchCsv("moves"),
    fetchCsv("version_groups"),
  ]);
  const itemSlug = new Map(items.map((i) => [i.id!, i.identifier!]));
  const moveSlug = new Map(moves.map((m) => [m.id!, m.identifier!]));
  const vgSlug = new Map(vgroups.map((v) => [v.id!, v.identifier!]));

  const rows: NatdexMachine[] = [];
  for (const m of machines) {
    const item = itemSlug.get(m.item_id!);
    const move = moveSlug.get(m.move_id!);
    const vg = vgSlug.get(m.version_group_id!);
    if (!item || !move || !vg) continue;
    rows.push({
      version_group: vg,
      machine: item.toUpperCase(), // "hm02" -> "HM02"
      move_slug: move,
      item_slug: item,
    });
  }
  rows.sort(
    (a, b) =>
      a.version_group.localeCompare(b.version_group) ||
      a.machine.localeCompare(b.machine),
  );
  return rows;
}

async function buildMoves(): Promise<NatdexMove[]> {
  const [moves, types, classes] = await Promise.all([
    fetchCsv("moves"),
    fetchCsv("types"),
    fetchCsv("move_damage_classes"),
  ]);
  const typeSlug = new Map(types.map((t) => [t.id!, t.identifier!]));
  const classSlug = new Map(classes.map((c) => [c.id!, c.identifier!]));
  const rows: NatdexMove[] = moves.map((m) => ({
    slug: m.identifier!,
    gen: num(m.generation_id) ?? 0,
    type: m.type_id ? (typeSlug.get(m.type_id) ?? null) : null,
    damage_class: m.damage_class_id
      ? (classSlug.get(m.damage_class_id) ?? null)
      : null,
  }));
  rows.sort((a, b) => a.slug.localeCompare(b.slug));
  return rows;
}

async function buildClassicEncounters(): Promise<ClassicEncounter[]> {
  const [
    encounters,
    versions,
    vgroups,
    slots,
    methods,
    areas,
    locations,
    pokemon,
    species,
  ] = await Promise.all([
    fetchCsv("encounters"),
    fetchCsv("versions"),
    fetchCsv("version_groups"),
    fetchCsv("encounter_slots"),
    fetchCsv("encounter_methods"),
    fetchCsv("location_areas"),
    fetchCsv("locations"),
    fetchCsv("pokemon"),
    fetchCsv("pokemon_species"),
  ]);

  const vgGen = new Map(vgroups.map((v) => [v.id!, num(v.generation_id) ?? 0]));
  const versionInfo = new Map(
    versions.map((v) => [
      v.id!,
      { slug: v.identifier!, gen: vgGen.get(v.version_group_id!) ?? 0 },
    ]),
  );
  const methodSlug = new Map(methods.map((m) => [m.id!, m.identifier!]));
  const slotInfo = new Map(
    slots.map((s) => [
      s.id!,
      { method: methodSlug.get(s.encounter_method_id!) ?? "unknown", rarity: num(s.rarity) },
    ]),
  );
  const speciesSlugById = new Map(species.map((s) => [s.id!, s.identifier!]));
  // pokemon.id -> species slug (encounters reference a pokemon form id).
  const pokeSpeciesSlug = new Map(
    pokemon.map((p) => [p.id!, speciesSlugById.get(p.species_id!) ?? p.identifier!]),
  );
  const areaInfo = new Map(
    areas.map((a) => [a.id!, { location_id: a.location_id!, area: a.identifier || null }]),
  );
  const locationSlug = new Map(locations.map((l) => [l.id!, l.identifier!]));

  // Dedupe identical rows (PokeAPI emits one row per version×slot; many collapse).
  const seen = new Set<string>();
  const rows: ClassicEncounter[] = [];
  for (const e of encounters) {
    const v = versionInfo.get(e.version_id!);
    if (!v || v.gen < 1 || v.gen > CLASSIC_ENCOUNTER_MAX_GEN) continue;
    const area = areaInfo.get(e.location_area_id!);
    const slot = slotInfo.get(e.encounter_slot_id!);
    const species_slug = pokeSpeciesSlug.get(e.pokemon_id!);
    if (!area || !slot || !species_slug) continue;
    const location = locationSlug.get(area.location_id) ?? null;
    if (!location) continue;
    const row: ClassicEncounter = {
      version: v.slug,
      location,
      area: area.area,
      method: slot.method,
      species: species_slug,
      rarity: slot.rarity,
      min_level: num(e.min_level),
      max_level: num(e.max_level),
    };
    const key = `${row.version}|${row.location}|${row.area ?? ""}|${row.method}|${row.species}|${row.rarity ?? ""}|${row.min_level ?? ""}|${row.max_level ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  rows.sort(
    (a, b) =>
      a.version.localeCompare(b.version) ||
      a.location.localeCompare(b.location) ||
      a.species.localeCompare(b.species) ||
      a.method.localeCompare(b.method),
  );
  return rows;
}

async function buildPmd(species: NatdexSpecies[]): Promise<PmdRecruit[]> {
  const text = await getText(PMD_CSV);
  const raw = parseCsv(text);
  console.log(`[natdex]   PMD_data.csv: ${raw.length} rows`);
  // PMD is keyed by national dex number (the unnamed first column) — join to the
  // canonical species slug so PMD species keys line up with natdex_species.
  const slugByNatdex = new Map(species.map((s) => [s.natdex, s.slug]));

  const rows: PmdRecruit[] = [];
  for (const r of raw) {
    // The first column header is empty ("") — it holds the pokedex number.
    const natdex = num(r[""]);
    if (natdex == null) continue;
    const slug = slugByNatdex.get(natdex);
    if (!slug) continue;
    const friend = r.friend_area?.trim() || null;
    // Red/Blue Rescue Team.
    if (r.rt_location?.trim()) {
      rows.push({
        game: "red-blue-rescue-team",
        species: slug,
        location: r.rt_location.trim(),
        recruit_rate: r.rt_rate?.trim() || null,
        friend_area: friend,
      });
    }
    // Explorers of Sky.
    if (r.sky_location?.trim()) {
      rows.push({
        game: "explorers-of-sky",
        species: slug,
        location: r.sky_location.trim(),
        recruit_rate: r.sky_rate?.trim() || null,
        friend_area: friend,
      });
    }
  }
  rows.sort(
    (a, b) => a.game.localeCompare(b.game) || a.species.localeCompare(b.species),
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("[natdex] building species snapshot…");
  const species = await buildSpecies();
  writeJson("natdex.json", "pokeapi.co", "species", species);

  console.log("[natdex] building machines snapshot…");
  writeJson("machines.json", "pokeapi.co", "machines", await buildMachines());

  console.log("[natdex] building moves snapshot…");
  writeJson("natdex-moves.json", "pokeapi.co", "moves", await buildMoves());

  console.log("[natdex] building classic encounters snapshot (Gens 1–7)…");
  writeJsonGz(
    "classic-encounters.json.gz",
    "pokeapi.co",
    "encounters",
    await buildClassicEncounters(),
  );

  console.log("[natdex] building PMD recruits snapshot…");
  writeJson(
    "pmd.json",
    "github.com/pa5sarinho/pmd_dataset",
    "recruits",
    await buildPmd(species),
  );

  console.log("[natdex] done.");
}

main().catch((e: unknown) => {
  console.error(
    `[natdex] crashed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`,
  );
  process.exit(1);
});
