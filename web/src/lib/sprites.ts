/**
 * sprites — pure, client-safe sprite-URL helpers (no Node / `server-only` /
 * `@pkmn` / React imports). Shared by the ingest builder
 * (`@/ingest/build-pokedex`), the first-party media proxy, and client
 * `<SpriteImg>` fallbacks, so the URL patterns live in exactly one place. One
 * of the portable modules in CLAUDE.md.
 *
 * Oak serves sprites/artwork through first-party media routes so clients never
 * hit rate-limited third-party CDNs (GitHub raw) directly:
 *   - sprite_url   → `/api/media/sprite/{showdownId}`  (Showdown ani upstream)
 *   - artwork_url  → `/api/media/artwork/{dex}`        (PokeAPI official art)
 *   - legacy front → `/api/media/dex-sprite/{dex}`     (PokeAPI front sprite)
 *
 * Upstream builders (`showdownAniSprite`, `pokeApiSprite`, `pokeApiArtwork`)
 * are for the media proxy (and tests) only — not client `<img src>` fallbacks.
 */

import { SITE_ORIGIN } from "@/lib/site";

const POKEAPI_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

const SHOWDOWN_ANI_HOST = "play.pokemonshowdown.com";
const GITHUB_RAW_HOST = "raw.githubusercontent.com";
const POKEAPI_SPRITES_PREFIX = "/PokeAPI/sprites/master/sprites/pokemon";

/** Showdown spriteid path segment: `gyarados`, `charizard-megax`, … */
export const SPRITE_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** National dex numbers Oak will proxy (covers NatDex + a little headroom). */
export const DEX_NUMBER_MIN = 1;
export const DEX_NUMBER_MAX = 9999;

/** PokeAPI front sprite for a national dex number (upstream only). */
export function pokeApiSprite(num: number): string {
  return `${POKEAPI_BASE}/${num}.png`;
}

/**
 * PokeAPI official artwork for a PokeAPI sprites id (upstream only).
 * National dex for `/api/media/artwork/{dex}`; form/variety ids only as the
 * sprite-proxy 404 fallback (see `pokeApiFormIdForSpriteId`). Not a public
 * artwork-by-form route — form ids are a different namespace from NatDex.
 */
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
    .replace(/[\u0300-\u036f]/g, "")
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
 * Animated Showdown sprite URL for a spriteid (upstream only). Most forms
 * live here; a handful of Regulation M-C megas 404 and the sprite media
 * proxy falls back to PokeAPI official artwork via `pokeApiFormIdForSpriteId`.
 */
export function showdownAniSprite(spriteId: string): string {
  return `https://play.pokemonshowdown.com/sprites/ani/${spriteId}.gif`;
}

// ---------------------------------------------------------------------------
// First-party Oak media URLs (what ingest bakes into the index)
// ---------------------------------------------------------------------------

/** Absolute Oak media URL for a Showdown animated sprite. */
export function oakMediaSpriteUrl(
  spriteId: string,
  origin: string = SITE_ORIGIN,
): string {
  return `${origin.replace(/\/$/, "")}/api/media/sprite/${encodeURIComponent(spriteId)}`;
}

/** Absolute Oak media URL for official artwork by national dex number. */
export function oakMediaArtworkUrl(
  dex: number,
  origin: string = SITE_ORIGIN,
): string {
  return `${origin.replace(/\/$/, "")}/api/media/artwork/${dex}`;
}

/**
 * Absolute Oak media URL for the classic PokeAPI front sprite by dex number.
 * Used as a client fallback / legacy rewrite target (not baked for new rows).
 */
export function oakMediaDexSpriteUrl(
  dex: number,
  origin: string = SITE_ORIGIN,
): string {
  return `${origin.replace(/\/$/, "")}/api/media/dex-sprite/${dex}`;
}

/**
 * Best-effort rewrite of a third-party sprite/artwork URL onto Oak's first-party
 * media routes. Used by `<SpriteImg>` so historical answers that still embed
 * GitHub raw or direct Showdown URLs load through the proxy (and avoid 429s).
 * Already-Oak and unrecognized URLs are returned unchanged.
 */
export function rewriteLegacyMediaUrl(
  url: string,
  origin: string = SITE_ORIGIN,
): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;

  // Direct Showdown ani GIF → Oak sprite proxy.
  if (host === SHOWDOWN_ANI_HOST) {
    const m = path.match(/^\/sprites\/ani\/([a-z0-9-]+)\.gif$/i);
    if (m && SPRITE_ID_RE.test(m[1]!)) {
      return oakMediaSpriteUrl(m[1]!, origin);
    }
    return url;
  }

  // PokeAPI via GitHub raw → Oak artwork or dex-sprite proxy.
  if (host === GITHUB_RAW_HOST) {
    const art = path.match(
      new RegExp(
        `^${POKEAPI_SPRITES_PREFIX.replace(/\//g, "\\/")}/other/official-artwork/(\\d+)\\.png$`,
        "i",
      ),
    );
    if (art) {
      const dex = Number(art[1]);
      if (dex >= DEX_NUMBER_MIN && dex <= DEX_NUMBER_MAX) {
        return oakMediaArtworkUrl(dex, origin);
      }
    }
    const front = path.match(
      new RegExp(
        `^${POKEAPI_SPRITES_PREFIX.replace(/\//g, "\\/")}/(\\d+)\\.png$`,
        "i",
      ),
    );
    if (front) {
      const dex = Number(front[1]);
      if (dex >= DEX_NUMBER_MIN && dex <= DEX_NUMBER_MAX) {
        return oakMediaDexSpriteUrl(dex, origin);
      }
    }
    return url;
  }

  return url;
}

// ---------------------------------------------------------------------------
// guessShowdownAniSpriteUrl / guessOakMediaSpriteUrl — client-side slug guess
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
 * Showdown spriteid guessed from an Oak species slug (same split rules as
 * {@link guessShowdownAniSpriteUrl}). Returns null only for empty input.
 */
export function guessShowdownSpriteId(slug: string): string {
  const lower = slug.toLowerCase();
  for (const suffix of FORME_SUFFIXES) {
    if (lower.length <= suffix.length) continue;
    if (lower.endsWith(`-${suffix}`)) {
      const base = lower.slice(0, lower.length - suffix.length - 1);
      return showdownSpriteId(base, suffix);
    }
  }
  return showdownSpriteId(lower, null);
}

/**
 * Best-effort ANIMATED Showdown sprite URL for a species slug (direct CDN —
 * prefer {@link guessOakMediaSpriteUrl} for client `<img>` tags so traffic
 * goes through Oak's proxy).
 */
export function guessShowdownAniSpriteUrl(slug: string): string {
  return showdownAniSprite(guessShowdownSpriteId(slug));
}

/**
 * Best-effort first-party Oak media sprite URL for a species slug. Prefer this
 * over {@link guessShowdownAniSpriteUrl} for client render paths.
 */
export function guessOakMediaSpriteUrl(
  slug: string,
  origin: string = SITE_ORIGIN,
): string {
  return oakMediaSpriteUrl(guessShowdownSpriteId(slug), origin);
}
