/**
 * Map a `OakAnswer` citation `source` to user-facing display text (TestFlight
 * feedback AH1b0N09K/AGGcchFC — internal machinery like `run_sql/natdex_species`
 * or `wiki/<page>` must never leak to non-technical users). The wire `source`
 * string itself is UNCHANGED — it still powers `parseCitationSource` / tappable
 * artifact links; this module only decides what text a user sees.
 *
 * Copy is pinned by the canonical cross-platform copy table (§2) — iOS/Android
 * mirror this behavior exactly. Do not improvise different wording here.
 */

const ENTITY_LABELS: Record<string, string> = {
  pokemon: "Pokémon",
  move: "Move",
  ability: "Ability",
  item: "Item",
  type: "Type",
};

export const MOVEPOOL_LABEL = "Movepool";
export const GAME_DATABASE_LABEL = "Oak's game database";
export const COMMUNITY_WIKI_PREFIX = "Community wiki — ";
export const META_USAGE_GEN9OU_LABEL = "Competitive usage stats (Gen 9 OU)";
export const META_USAGE_LABEL = "Competitive usage stats";

/** "fake-out" -> "Fake Out"; "will-o-wisp" -> "Will O Wisp" (acceptable). */
function titleize(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function displayCitationSource(source: string): string {
  const slash = source.indexOf("/");
  if (slash <= 0) return source;

  const prefix = source.slice(0, slash).trim();
  const rest = source.slice(slash + 1).trim();
  if (!rest) return source;

  if (prefix === "run_sql") return GAME_DATABASE_LABEL;
  if (prefix === "wiki") return `${COMMUNITY_WIKI_PREFIX}${rest}`;
  if (prefix === "get_meta_usage") {
    return rest === "gen9ou" ? META_USAGE_GEN9OU_LABEL : META_USAGE_LABEL;
  }

  if (prefix === "learnset") {
    // Strip a trailing qualifier like " (gen-9)", same rule as parseCitationSource.
    const paren = rest.indexOf("(");
    const slug = (paren >= 0 ? rest.slice(0, paren) : rest).trim();
    if (!slug) return source;
    return `${MOVEPOOL_LABEL} — ${titleize(slug)}`;
  }

  const entityLabel = ENTITY_LABELS[prefix];
  if (entityLabel) return `${entityLabel} — ${titleize(rest)}`;

  return source;
}
