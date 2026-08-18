/**
 * Format-aware default level for the standalone calculator (CALC-BR-7, ADR-13).
 *
 * Champions is the only VGC/doubles-style member of `FORMATS` and defaults to
 * 50. Every other Oak scope defaults to 100. A hop-supplied level wins over
 * this helper (the engine only calls it when `side.level` is omitted).
 */

import type { Format } from "@/data/formats";

export function defaultCalcLevel(format: Format): number {
  return format === "champions" ? 50 : 100;
}
