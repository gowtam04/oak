/**
 * Human-readable scope labels (generation-scope GS-C / §4.3).
 *
 * A tiny PURE helper the scope chip (web) and a future iOS client both reuse to
 * render the active format as a short pill — "Champions · Reg M-C",
 * "Gen 9 · Scarlet/Violet", "Gen 7 · USUM". It only reads pure constants from
 * `@/data/formats` (no `server-only`, no `@/env`, no DB), so it stays on the
 * portable-modules list alongside `detect-scope.ts`.
 */

import { regulationChipLabel, type Format } from "@/data/formats";

/** A short display label for a resolved scope, e.g. for the header scope chip. */
export function scopeLabel(format: Format): string {
  switch (format) {
    case "national-dex":
      return "National Dex · All Gens";
    case "champions":
      return regulationChipLabel();
    case "scarlet-violet":
      return "Gen 9 · Scarlet/Violet";
    case "gen-8":
      return "Gen 8 · Sword/Shield";
    case "gen-7":
      return "Gen 7 · USUM";
    case "gen-6":
      return "Gen 6 · XY/ORAS";
    case "gen-5":
      return "Gen 5 · Black/White";
    case "gen-4":
      return "Gen 4 · Diamond/Pearl";
    case "gen-3":
      return "Gen 3 · Ruby/Sapphire";
    case "gen-2":
      return "Gen 2 · Gold/Silver";
    case "gen-1":
      return "Gen 1 · Red/Blue";
    default:
      // Unreachable given the closed `Format` union; echo the raw value
      // defensively so a newly-added format never renders as `undefined`.
      return String(format);
  }
}

/**
 * A compact badge label for a resolved scope — shorter than {@link scopeLabel}
 * (no regulation/game-pair suffix), for tight spaces like the history sidebar's
 * per-row format badge.
 */
export function scopeLabelShort(format: Format): string {
  switch (format) {
    case "national-dex":
      return "National Dex";
    case "champions":
      return "Champions";
    case "scarlet-violet":
      return "Gen 9";
    case "gen-8":
      return "Gen 8";
    case "gen-7":
      return "Gen 7";
    case "gen-6":
      return "Gen 6";
    case "gen-5":
      return "Gen 5";
    case "gen-4":
      return "Gen 4";
    case "gen-3":
      return "Gen 3";
    case "gen-2":
      return "Gen 2";
    case "gen-1":
      return "Gen 1";
    default:
      // Unreachable given the closed `Format` union; echo the raw value
      // defensively so a newly-added format never renders as `undefined`.
      return String(format);
  }
}
