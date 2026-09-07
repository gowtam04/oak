/**
 * Retired Smogon MetaFormat axis (ADR-5). Public usage is live Champions T15
 * (`/usage`). The `gen9ou` literal remains only so leftover type imports
 * still decode historical strings — it is not a product default, not a
 * picker, and not a live ladder.
 *
 * Pure, dependency-free (no @pkmn/DB/server imports).
 */

import type { Format } from "./formats";

/** Historical Smogon ladder id — not a live product default. */
export type MetaFormat = "gen9ou";

export interface MetaFormatConfig {
  id: MetaFormat;
  label: string;
  shortLabel: string;
  battleStyle: "singles" | "doubles";
  dataFormat: Format;
  smogonFormatId: string;
  defaultCutoff: number;
}

/** Empty — Smogon OU is not a supported product ladder after Champions-first. */
export const META_FORMATS: readonly MetaFormatConfig[] = [];

export const META_FORMAT_IDS = [] as const satisfies readonly MetaFormat[];

/** Type guard: always false (no live MetaFormat). */
export function isMetaFormat(_value: string): _value is MetaFormat {
  return false;
}

export function metaFormatConfig(_id: MetaFormat): never {
  throw new Error("MetaFormat is retired; use live Champions usage.");
}
