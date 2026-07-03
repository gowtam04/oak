/**
 * stat-tier — the value-ramp classification shared by every stat meter in the
 * app (UI strategy §3 Color: "Stat bars get one value rule"). A raw stat value
 * maps to one of the four semantic tiers so magnitude reads the same whether
 * it's a species' base stat (PokemonArtifact) or a team member's computed
 * final stat (TeamArtifact) — one rule, not an azure-everywhere default with
 * an unexplained exception.
 *
 * Pure, no imports — safe in client components and isolation tests.
 */

export type StatTier = "danger" | "warning" | "success" | "azure";

/**
 * Classifies a stat value into its display tier:
 *   < 60        → danger   (weak)
 *   60–89       → warning  (below average)
 *   90–119      → success  (solid)
 *   >= 120      → azure    (exceptional)
 */
export function statValueTier(value: number): StatTier {
  if (value < 60) return "danger";
  if (value < 90) return "warning";
  if (value < 120) return "success";
  return "azure";
}
