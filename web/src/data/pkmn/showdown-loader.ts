/**
 * Load vendored Showdown data/ + data/mods/champions/ into a Dex.mod ModData.
 *
 * Champions inherit:true overlays are resolved against the Showdown base tables
 * here. Dex.mod's parent is @pkmn/dex gen9; inheriting there would keep stale
 * Z-A leftovers (Adaptability on Lucario-Mega-Z, etc.).
 *
 * Offline — reads web/vendor/pokemon-showdown only.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { ModData } from "@pkmn/dex";

import { SHOWDOWN_PIN } from "./showdown-pin";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
/** web/ — parent of src/ */
export const WEB_ROOT = path.resolve(MODULE_DIR, "../../..");
export const SHOWDOWN_VENDOR_DIR = path.join(
  WEB_ROOT,
  "vendor",
  "pokemon-showdown",
);

type Table = Record<string, unknown>;

interface ShowdownDataModule {
  Pokedex?: Table;
  Abilities?: Table;
  Items?: Table;
  Moves?: Table;
  Learnsets?: Table;
  FormatsData?: Table;
  Conditions?: Table;
}

function vendorFile(rel: string): string {
  return path.join(SHOWDOWN_VENDOR_DIR, rel);
}

export function readVendoredPinSha(): string {
  return readFileSync(vendorFile("SHA"), "utf8").trim();
}

async function importVendorTable(rel: string): Promise<ShowdownDataModule> {
  const href = pathToFileURL(vendorFile(rel)).href;
  return (await import(href)) as ShowdownDataModule;
}

/**
 * Apply a Showdown mod overlay onto a base table. `inherit: true` copies missing
 * keys from the base id; overlay keys set to `undefined` are deleted (Showdown's
 * "no inherit" encoding).
 */
export function applyInherit(base: Table, overlay: Table): Table {
  const out: Table = { ...base };
  for (const [id, raw] of Object.entries(overlay)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      out[id] = raw;
      continue;
    }
    const entry = raw as Table & { inherit?: boolean };
    if (!entry.inherit) {
      out[id] = entry;
      continue;
    }
    const merged: Table = { ...((base[id] as Table | undefined) ?? {}), ...entry };
    delete merged.inherit;
    for (const [key, value] of Object.entries(entry)) {
      if (value === undefined) delete merged[key];
    }
    out[id] = merged;
  }
  return out;
}

export interface ChampionsShowdownMod {
  pinSha: string;
  modData: ModData;
}

/**
 * Build the Champions ModData from the vendored Showdown pin.
 * Throws if the vendor SHA file does not match {@link SHOWDOWN_PIN}.
 */
export async function loadChampionsShowdownMod(): Promise<ChampionsShowdownMod> {
  const pinSha = readVendoredPinSha();
  if (pinSha !== SHOWDOWN_PIN.sha) {
    throw new Error(
      `Showdown vendor SHA mismatch: vendor/pokemon-showdown/SHA=${pinSha} ` +
        `SHOWDOWN_PIN.sha=${SHOWDOWN_PIN.sha}. Re-run web/scripts/sync-showdown-pin.sh.`,
    );
  }

  const [pokedex, abilities, items, moves, champAbilities, champConditions, champFormats, champItems, champLearnsets, champMoves] =
    await Promise.all([
      importVendorTable("data/pokedex.ts"),
      importVendorTable("data/abilities.ts"),
      importVendorTable("data/items.ts"),
      importVendorTable("data/moves.ts"),
      importVendorTable("data/mods/champions/abilities.ts"),
      importVendorTable("data/mods/champions/conditions.ts"),
      importVendorTable("data/mods/champions/formats-data.ts"),
      importVendorTable("data/mods/champions/items.ts"),
      importVendorTable("data/mods/champions/learnsets.ts"),
      importVendorTable("data/mods/champions/moves.ts"),
    ]);

  const species = pokedex.Pokedex;
  const formatsData = champFormats.FormatsData;
  const learnsets = champLearnsets.Learnsets;
  if (!species || !formatsData || !learnsets) {
    throw new Error(
      "Showdown vendor tables missing Pokedex, FormatsData, or Learnsets",
    );
  }
  if (!abilities.Abilities || !items.Items || !moves.Moves) {
    throw new Error("Showdown vendor base tables missing Abilities/Items/Moves");
  }
  if (!champAbilities.Abilities || !champItems.Items || !champMoves.Moves) {
    throw new Error("Showdown champions mod missing Abilities/Items/Moves");
  }

  const modData = {
    Species: species,
    Abilities: applyInherit(abilities.Abilities, champAbilities.Abilities),
    Items: applyInherit(items.Items, champItems.Items),
    Moves: applyInherit(moves.Moves, champMoves.Moves),
    Learnsets: learnsets,
    FormatsData: formatsData,
    Conditions: champConditions.Conditions ?? {},
  } as unknown as ModData;

  return { pinSha, modData };
}
