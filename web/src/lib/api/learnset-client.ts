/**
 * learnset-client — the typed `fetch` helper over `GET /api/learnset`.
 *
 * The team builder calls this once per focused species to get that species'
 * LEGAL movepool (slug + display name) for the active format, then feeds it to
 * the member's Move pickers as a static option list — so the dropdowns only ever
 * offer learnable moves. Mirrors sprites-client.ts / search-client.ts: it NEVER
 * throws — a transport fault, a non-2xx, or a malformed body all fold to `[]`,
 * so the pickers simply show no suggestions rather than erroring.
 */

import type { Format } from "@/data/formats";

/** The three move damage classes (mirrors `MoveDetail.damage_class`). */
export type MoveDamageClass = "physical" | "special" | "status";

/**
 * One legal move as the picker consumes it (structurally a PickerOption, plus
 * the F1 metadata columns — type/damage class/power — the moves table renders
 * alongside each picker). The metadata fields are OPTIONAL/nullable: a move
 * with no cached reference detail rides without them.
 */
export interface LearnsetOption {
  slug: string;
  display_name: string;
  type?: string;
  damage_class?: MoveDamageClass | null;
  power?: number | null;
}

const DAMAGE_CLASSES: ReadonlySet<string> = new Set([
  "physical",
  "special",
  "status",
]);

/** Best-effort narrowing of one move from the JSON body; null if malformed. */
function toOption(value: unknown): LearnsetOption | null {
  if (value === null || typeof value !== "object") return null;
  const m = value as Record<string, unknown>;
  if (typeof m.slug !== "string" || typeof m.display_name !== "string") {
    return null;
  }
  const option: LearnsetOption = { slug: m.slug, display_name: m.display_name };
  if (typeof m.type === "string") option.type = m.type;
  if (m.damage_class === null || DAMAGE_CLASSES.has(m.damage_class as string)) {
    option.damage_class = (m.damage_class as MoveDamageClass | null) ?? null;
  }
  if (m.power === null || typeof m.power === "number") {
    option.power = m.power as number | null;
  }
  return option;
}

/**
 * Resolve the legal movepool for `speciesSlug` in `format` as picker options
 * (slug + display name), sorted by display name. A blank slug or any failure
 * yields `[]`.
 */
export async function fetchLearnset(
  format: Format,
  speciesSlug: string,
): Promise<LearnsetOption[]> {
  const slug = speciesSlug.trim();
  if (slug.length === 0) return [];
  try {
    const params = new URLSearchParams({ format, pokemon: slug });
    const res = await fetch(`/api/learnset?${params.toString()}`, {
      method: "GET",
      credentials: "same-origin",
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    const moves =
      data !== null && typeof data === "object"
        ? (data as Record<string, unknown>).moves
        : null;
    if (!Array.isArray(moves)) return [];
    return moves
      .map(toOption)
      .filter((m): m is LearnsetOption => m !== null);
  } catch {
    return [];
  }
}
