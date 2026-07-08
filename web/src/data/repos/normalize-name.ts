/**
 * normalizeName — the single canonical "user-supplied name → slug-ish id" rule.
 *
 * Extracted so the callers that MUST agree on it can never drift: `getPokemon`
 * (keying the `pokemon` table on the normalized id) and `resolveEntity`'s
 * exact-match gate (`findExactMatch`, `resolve-index.ts`). Pure — no
 * `server-only`, no db — so it is importable from a unit/jsdom context too.
 */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}
