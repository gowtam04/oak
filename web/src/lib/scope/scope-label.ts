/**
 * Human-readable scope labels (generation-scope GS-C / §4.3).
 *
 * A tiny PURE helper the scope chip (web) and a future iOS client both reuse to
 * render the active format as a short pill — "Champions · Reg M-B",
 * "Gen 9 · Scarlet/Violet", "Gen 7 · USUM". It only reads pure constants from
 * `@/data/formats` (no `server-only`, no `@/env`, no DB), so it stays on the
 * portable-modules list alongside `detect-scope.ts`.
 */

import { CHAMPIONS_REGULATION, type Format } from "@/data/formats";

/** The Champions regulation ("Regulation M-B") shortened for the chip ("Reg M-B"). */
const CHAMPIONS_REG_SHORT = CHAMPIONS_REGULATION.replace(/^Regulation\b/, "Reg");

/** A short display label for a resolved scope, e.g. for the header scope chip. */
export function scopeLabel(format: Format): string {
  switch (format) {
    case "champions":
      return `Champions · ${CHAMPIONS_REG_SHORT}`;
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
    default:
      // Unreachable given the closed `Format` union; echo the raw value
      // defensively so a newly-added format never renders as `undefined`.
      return String(format);
  }
}
