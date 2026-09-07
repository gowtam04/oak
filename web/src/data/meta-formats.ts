/**
 * Retired public MetaFormat axis (Smogon gen9ou). Champions-first (ADR-5):
 * public usage is live T15 `/usage`, not stored monthly Smogon snapshots.
 * This module remains so leftover type imports still decode; it is not used
 * by pages, sitemap, set-template, or the threat board.
 *
 * v1 supports EXACT Smogon format ids only (`smogonFormatId` is used verbatim
 * in the chaos-stats URL). Per-regulation prefix resolution (e.g. resolving a
 * VGC regulation letter to the current Smogon format id) is deferred until a
 * format that needs it is added.
 *
 * Pure, dependency-free (no @pkmn/DB/server imports) so it is safe to import
 * from repos, tools, ingest/sync CLIs, prompts, and tests. May import ONLY the
 * `Format` type from `./formats` (never the reverse — this module is a leaf
 * off the data-scope axis, not a peer it depends on).
 */

import type { Format } from "./formats";

/** The set of supported competitive ladders. v1: Gen 9 OU only. */
export type MetaFormat = "gen9ou";

/** Static configuration for one competitive ladder. */
export interface MetaFormatConfig {
  /** The ladder id (this format's {@link MetaFormat} member). */
  id: MetaFormat;
  /** Full display label, e.g. for the /meta page header. */
  label: string;
  /** Short label for compact UI (tabs, chips), e.g. "OU". */
  shortLabel: string;
  /** Battle style the ladder is played in. */
  battleStyle: "singles" | "doubles";
  /** The data-scope {@link Format} this ladder's Pokémon data resolves against. */
  dataFormat: Format;
  /** Exact Smogon format id used verbatim in the chaos-stats URL, e.g. "gen9ou". */
  smogonFormatId: string;
  /** Default usage-stats cutoff (minimum battles a player needed to count). */
  defaultCutoff: number;
}

/** All supported competitive ladders, in display order. */
export const META_FORMATS: readonly MetaFormatConfig[] = [
  {
    id: "gen9ou",
    label: "Smogon OU (Gen 9 singles)",
    shortLabel: "OU",
    battleStyle: "singles",
    dataFormat: "scarlet-violet",
    smogonFormatId: "gen9ou",
    defaultCutoff: 1695,
  },
];

/**
 * The {@link MetaFormat} literal set as a non-empty readonly tuple, shaped so
 * `z.enum(META_FORMAT_IDS)` works directly (T21's input schema).
 */
export const META_FORMAT_IDS = ["gen9ou"] as const satisfies readonly MetaFormat[];

/** Default ladder when a caller doesn't specify one. */
export const DEFAULT_META_FORMAT: MetaFormat = "gen9ou";

/** Type guard for a known competitive-ladder id string. */
export function isMetaFormat(value: string): value is MetaFormat {
  return (META_FORMAT_IDS as readonly string[]).includes(value);
}

/** Look up a ladder's static config. Throws on an unknown id (a programmer error). */
export function metaFormatConfig(id: MetaFormat): MetaFormatConfig {
  const config = META_FORMATS.find((f) => f.id === id);
  if (!config) throw new Error(`Unknown MetaFormat: ${id}`);
  return config;
}
