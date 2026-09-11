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
  AbilitiesText?: Table;
  MovesText?: Table;
  ItemsText?: Table;
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

/** Pull current-gen prose off a Showdown text entry (ignore nested `genN`). */
function proseFrom(entry: unknown): { shortDesc: string; desc: string } | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const t = entry as { shortDesc?: unknown; desc?: unknown };
  const shortDesc = typeof t.shortDesc === "string" ? t.shortDesc : "";
  const desc =
    typeof t.desc === "string" && t.desc.length > 0 ? t.desc : shortDesc;
  if (!shortDesc && !desc) return null;
  return { shortDesc, desc };
}

/**
 * Typed Hidden Power clones (`hiddenpowerbug`, …) ship name-only text rows.
 * Inherit the base `hiddenpower` prose.
 */
function parentTextId(id: string): string | null {
  if (/^hiddenpower[a-z]+$/.test(id)) return "hiddenpower";
  return null;
}

/**
 * Showdown `data/text` has no row for a few Champions-indexed moves. Keep this
 * map tiny and mechanics-derived — do not invent franchise lore.
 */
const TEXT_FALLBACKS: Readonly<Record<string, { shortDesc: string; desc: string }>> =
  {
    nihillight: {
      shortDesc:
        "Hits both foes. Ignores evasiveness and defensive stat stages; hits Dragon types even if they would be immune.",
      desc: "Hits both adjacent foes. Ignores the target's evasiveness and Defense/Sp. Def stat stages, and can hit Dragon types even if they would otherwise be immune.",
    },
  };

/**
 * Copy current-gen `shortDesc` / `desc` from a Showdown text table onto a
 * mechanics table. Nested `genN` blocks are historical and ignored. Missing
 * text ids stay empty unless a parent id or {@link TEXT_FALLBACKS} fills them
 * (ingest then fails loud on anything still empty).
 */
export function applyText(mechanics: Table, text: Table): Table {
  const out: Table = { ...mechanics };
  for (const [id, raw] of Object.entries(out)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const fromSelf = proseFrom(text[id]);
    const fromParent = parentTextId(id)
      ? proseFrom(text[parentTextId(id)!])
      : null;
    const prose = fromSelf ?? fromParent ?? TEXT_FALLBACKS[id] ?? null;
    if (!prose) continue;
    out[id] = { ...(raw as Table), ...prose };
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

  const [
    pokedex,
    abilities,
    items,
    moves,
    abilitiesText,
    movesText,
    itemsText,
    champAbilities,
    champConditions,
    champFormats,
    champItems,
    champLearnsets,
    champMoves,
  ] = await Promise.all([
    importVendorTable("data/pokedex.ts"),
    importVendorTable("data/abilities.ts"),
    importVendorTable("data/items.ts"),
    importVendorTable("data/moves.ts"),
    importVendorTable("data/text/abilities.ts"),
    importVendorTable("data/text/moves.ts"),
    importVendorTable("data/text/items.ts"),
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
  if (
    !abilitiesText.AbilitiesText ||
    !movesText.MovesText ||
    !itemsText.ItemsText
  ) {
    throw new Error(
      "Showdown vendor text tables missing AbilitiesText/MovesText/ItemsText",
    );
  }

  const modData = {
    Species: species,
    Abilities: applyText(
      applyInherit(abilities.Abilities, champAbilities.Abilities),
      abilitiesText.AbilitiesText,
    ),
    Items: applyText(
      applyInherit(items.Items, champItems.Items),
      itemsText.ItemsText,
    ),
    Moves: applyText(
      applyInherit(moves.Moves, champMoves.Moves),
      movesText.MovesText,
    ),
    Learnsets: learnsets,
    FormatsData: formatsData,
    Conditions: champConditions.Conditions ?? {},
  } as unknown as ModData;

  return { pinSha, modData };
}
