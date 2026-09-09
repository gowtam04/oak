import Foundation

/// Species-slug → first-party Oak media sprite URL.
///
/// Ports `web/src/lib/sprites.ts` (`toID`, `showdownSpriteId`,
/// `guessShowdownSpriteId`, `guessOakMediaSpriteUrl`) so Dex list thumbs can
/// render when `GET /api/search` omits `sprite_url` — the same fallback web's
/// `EntityPicker` already uses. Server `sprite_url` still wins when present.
///
/// Forme handling is NOT naive `toID(slug)`: Showdown keeps a hyphen between
/// base and forme but strips hyphens *inside* the forme (`charizard-mega-x` →
/// `charizard-megax`; `tapu-koko` has no forme suffix so the whole slug is one
/// token → `tapukoko`).
enum SpriteURL {
  /// Showdown spriteid guessed from an Oak species slug.
  static func guessShowdownSpriteId(_ slug: String) -> String {
    let lower = slug.lowercased()
    for suffix in formeSuffixes {
      guard lower.count > suffix.count else { continue }
      if lower.hasSuffix("-\(suffix)") {
        let base = String(lower.dropLast(suffix.count + 1))
        return showdownSpriteId(baseSpecies: base, forme: suffix)
      }
    }
    return showdownSpriteId(baseSpecies: lower, forme: nil)
  }

  /// Absolute Oak `/api/media/sprite/{id}` URL for `slug`.
  ///
  /// `origin` is the API host (no trailing slash required). Callers that talk
  /// to a non-production backend pass that host so thumbs hit the same
  /// `/api/media/*` proxy as the rest of the app.
  static func guessOakMedia(slug: String, origin: String) -> String {
    oakMediaSpriteUrl(spriteId: guessShowdownSpriteId(slug), origin: origin)
  }

  /// Pokémon Showdown's `toID`: fold diacritics, lowercase, strip every
  /// non-alphanumeric character.
  static func toID(_ s: String) -> String {
    let nfd = s.decomposedStringWithCanonicalMapping
    let stripped = nfd.unicodeScalars.filter { scalar in
      !((0x0300...0x036F).contains(scalar.value))
    }
    return String(String.UnicodeScalarView(stripped))
      .lowercased()
      .filter { $0.isASCII && ($0.isLetter || $0.isNumber) }
  }

  /// Showdown sprite id for a species/form: `toID(base)`, plus `-` + `toID(forme)`
  /// for a non-base form.
  static func showdownSpriteId(baseSpecies: String, forme: String?) -> String {
    let base = toID(baseSpecies)
    guard let forme else { return base }
    return "\(base)-\(toID(forme))"
  }

  static func oakMediaSpriteUrl(spriteId: String, origin: String) -> String {
    let trimmed = origin.hasSuffix("/") ? String(origin.dropLast()) : origin
    return "\(trimmed)/api/media/sprite/\(spriteId)"
  }

  /// Every forme suffix a species slug in Oak's pokedex can carry.
  ///
  /// Copied from `web/src/lib/sprites.ts` `FORME_SUFFIXES`. Refresh together
  /// with that table (the generator script lives in `sprites.test.ts`) if a
  /// future ingest adds a species with an uncovered forme. Sorted longest-first
  /// so a multi-token suffix wins over one it contains (`galar-zen` before
  /// `zen`, `mega-x` before `mega`).
  private static let formeSuffixes: [String] = {
    let raw: [String] = [
      "alola-totem", "busted-totem", "cornerstone-tera", "hearthflame-tera",
      "wellspring-tera", "low-key-gmax", "rapid-strike-gmax", "original-mega",
      "curly-mega", "droopy-mega", "stretchy-mega", "f-mega", "m-mega",
      "blue-striped", "white-striped", "high-plains", "icy-snow",
      "three-segment", "spiky-eared", "rock-star", "pop-star", "rainbow-swirl",
      "ruby-swirl", "caramel-swirl", "matcha-cream", "mint-cream",
      "lemon-cream", "ruby-cream", "galar-zen", "alola",
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
    return Array(Set(raw)).sorted { lhs, rhs in
      if lhs.count != rhs.count { return lhs.count > rhs.count }
      return lhs < rhs
    }
  }()
}

extension SearchMatch {
  /// Sprite URL the Dex list (and any other search-row consumer) should load.
  ///
  /// Pokémon-only. A non-empty server `sprite_url` wins; otherwise the Showdown
  /// id is guessed from `slug` against the API origin. Moves / abilities /
  /// items return `nil`.
  var resolvedSpriteURL: String? {
    resolvedSpriteURL(origin: BaseURL.current.absoluteString)
  }

  func resolvedSpriteURL(origin: String) -> String? {
    guard kind == .pokemon else { return nil }
    if let spriteUrl {
      let trimmed = spriteUrl.trimmingCharacters(in: .whitespacesAndNewlines)
      if !trimmed.isEmpty { return trimmed }
    }
    let slug = slug.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !slug.isEmpty else { return nil }
    return SpriteURL.guessOakMedia(slug: slug, origin: origin)
  }
}
