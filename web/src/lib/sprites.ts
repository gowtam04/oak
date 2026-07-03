/**
 * sprites — pure, client-safe sprite-URL helpers (no Node / `server-only` /
 * `@pkmn` / React imports). Shared by the ingest builder
 * (`@/ingest/build-pokedex`) and the client `<SpriteImg>` fallback, so the URL
 * patterns live in exactly one place. One of the portable modules in CLAUDE.md.
 *
 * Two sprite sources:
 *   - BASE forms      → PokeAPI sprite CDN, keyed by NATIONAL DEX NUMBER. A base
 *     species' dex number uniquely identifies its art.
 *   - ALTERNATE forms → Pokémon Showdown's animated CDN, keyed by the
 *     form-distinguishing "spriteid". Every alternate form (Mega, regional,
 *     Rotom, …) shares its base species' national dex number, so the dex-number
 *     CDN can't tell a form from its base; the spriteid can. `@pkmn` does NOT
 *     expose `spriteid`, so we recompute it with Showdown's own formula.
 */

const POKEAPI_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

/** PokeAPI front sprite for a national dex number, e.g. 445 → ".../445.png". */
export function pokeApiSprite(num: number): string {
  return `${POKEAPI_BASE}/${num}.png`;
}

/** PokeAPI official artwork for a national dex number. */
export function pokeApiArtwork(num: number): string {
  return `${POKEAPI_BASE}/other/official-artwork/${num}.png`;
}

/**
 * Pokémon Showdown's `toID`: lowercase and strip every non-alphanumeric
 * character. Showdown's data is ASCII, so we fold diacritics first (a no-op for
 * ASCII) — that way names like "Flabébé" / "Farfetch'd" map to the ASCII id the
 * CDN actually uses.
 */
export function toID(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Showdown sprite id for a species/form: `toID(baseSpecies)`, plus `-` +
 * `toID(forme)` for a non-base form.
 *
 * NB this is NOT Oak's `slugify`: `toID` strips a forme's INTERNAL hyphens, so
 * "Charizard" + "Mega-X" → "charizard-megax" (slugify would give
 * "charizard-mega-x", which the CDN 404s). Single-token formes coincide
 * ("Venusaur" + "Mega" → "venusaur-mega"); multi-token ones diverge.
 */
export function showdownSpriteId(
  baseSpecies: string,
  forme: string | null,
): string {
  const base = toID(baseSpecies);
  return forme ? `${base}-${toID(forme)}` : base;
}

/**
 * Animated Showdown sprite URL for a spriteid. The `ani/` directory is the one
 * source that covers every form including the Pokémon Champions Megas (the
 * static `dex/` directory lacks them).
 */
export function showdownAniSprite(spriteId: string): string {
  return `https://play.pokemonshowdown.com/sprites/ani/${spriteId}.gif`;
}

// ---------------------------------------------------------------------------
// guessShowdownAniSpriteUrl (F2) — client-side "PREFER animated" guess
// ---------------------------------------------------------------------------

/**
 * Every forme suffix a species slug in Oak's pokedex can carry (a species'
 * `id` is `<base>-<forme>`, or just `<base>` for the base form). Derived by
 * enumerating `s.forme` off every real (non-CAP) species across every @pkmn
 * source Oak indexes — mainline Gen 5 through Gen 9 plus the Champions mod —
 * then running the SAME `slugify` ingest uses on each raw forme string (see
 * `sprites.test.ts` for the generation script; re-run it if a future ingest
 * adds species with a forme not covered here). Sorted LONGEST-FIRST at match
 * time so a multi-token suffix wins over one it contains — e.g. "galar-zen"
 * must be tried before "zen", and "mega-x" before "mega".
 */
const FORME_SUFFIXES: readonly string[] = [
  "alola-totem", "busted-totem", "cornerstone-tera", "hearthflame-tera",
  "wellspring-tera", "low-key-gmax", "rapid-strike-gmax", "original-mega",
  "curly-mega", "droopy-mega", "stretchy-mega", "f-mega", "m-mega",
  "blue-striped", "white-striped", "high-plains", "icy-snow",
  "three-segment", "spiky-eared", "rock-star", "pop-star", "rainbow-swirl",
  "ruby-swirl", "caramel-swirl", "matcha-cream", "mint-cream",
  "lemon-cream", "ruby-cream", "galar-zen", "alola-totem", "alola",
  "antique", "archipelago", "artisan", "ash", "attack", "autumn", "belle",
  "black", "blade", "bloodmoon", "blue", "bond", "bug", "burn", "busted",
  "chill", "complete", "continental", "cosplay", "crowned", "dada", "dark",
  "dawn-wings", "defense", "douse", "dragon", "droopy", "dusk-mane",
  "dusk", "east", "electric", "elegant", "eternal", "eternamax", "f",
  "fairy", "fan", "fancy", "fighting", "fire", "flying", "four", "frost",
  "galar", "garden", "ghost", "gmax", "gorging", "grass", "green",
  "ground", "gulping", "hangry", "hearthflame", "heat", "hero", "hisui",
  "hoenn", "ice", "indigo", "jungle", "kalos", "large", "libre",
  "low-key", "marine", "masterpiece", "mega-x", "mega-y", "mega-z",
  "mega", "meteor", "midnight", "modern", "monsoon", "mow", "neutral",
  "noice", "ocean", "orange", "origin", "original", "paldea-aqua",
  "paldea-blaze", "paldea-combat", "paldea", "partner", "pau", "phd",
  "pirouette", "poison", "pokeball", "polar", "pom-pom", "primal",
  "psychic", "rainy", "rapid-strike", "resolute", "river", "roaming",
  "rock", "sandstorm", "sandy", "savanna", "school", "sensu", "shadow",
  "shock", "sinnoh", "sky", "small", "snowy", "speed", "starter", "steel",
  "stellar", "stretchy", "summer", "sun", "sunny", "sunshine", "super",
  "teal-tera", "terastal", "therian", "totem", "trash", "tundra", "ultra",
  "unbound", "unova", "violet", "wash", "water", "wellspring", "white",
  "winter", "world", "yellow", "zen", "10",
]
  .filter((v, i, arr) => arr.indexOf(v) === i) // dedupe (a few appear twice above)
  .sort((a, b) => b.length - a.length);

/**
 * Best-effort ANIMATED Showdown sprite URL for a species slug, computed
 * CLIENT-SIDE without a server round-trip — ingest only bakes an animated
 * `sprite_url` for alternate-forme rows (`build-pokedex.ts`); base forms get a
 * static PokeAPI PNG. Splits `slug` on the longest matching entry of
 * {@link FORME_SUFFIXES} into base + forme, then defers to
 * {@link showdownSpriteId} for the actual URL (which folds a hyphenated forme
 * into Showdown's collapsed spriteid, e.g. "charizard-mega-x" →
 * "charizard-megax" — see that function's doc comment for why that diverges
 * from `slugify`). No suffix matches ⇒ treat the whole slug as a base species,
 * which is correct: Showdown base ids contain no internal hyphens
 * ("tapu-koko" → "tapukoko").
 *
 * This is a GUESS, not a lookup against the index — a slug this heuristic
 * mis-splits, or one with no Showdown-ani art, 404s. Callers MUST treat the
 * result as the PREFERRED src in an onError fallback chain (fall back to the
 * DB's static `sprite_url` when available, else hide the image) — never as
 * the sole source.
 */
export function guessShowdownAniSpriteUrl(slug: string): string {
  const lower = slug.toLowerCase();
  for (const suffix of FORME_SUFFIXES) {
    if (lower.length <= suffix.length) continue; // no room for a base species
    if (lower.endsWith(`-${suffix}`)) {
      const base = lower.slice(0, lower.length - suffix.length - 1);
      return showdownAniSprite(showdownSpriteId(base, suffix));
    }
  }
  return showdownAniSprite(showdownSpriteId(lower, null));
}
