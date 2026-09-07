/**
 * Usage ladder helpers — no env / network / db. Safe for API routes and
 * server pages to import statically (parse query strings, slugify names).
 */

export type UsageLadder = "doubles" | "singles";

/** Missing / blank `ladder=` → doubles (CF-USAGE-AC-1.2). Unknown → null. */
export function parseUsageLadder(
  value: string | null | undefined,
): UsageLadder | null {
  if (value == null || value.trim() === "") return "doubles";
  const v = value.trim().toLowerCase();
  if (v === "doubles" || v === "singles") return v;
  return null;
}

/**
 * Display name / usage label → PokeAPI-style slug (mirrors gen-provider
 * slugify, kept local so request-path code never imports @pkmn).
 */
export function toEntitySlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
