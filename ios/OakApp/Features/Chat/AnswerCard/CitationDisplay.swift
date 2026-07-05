import Foundation

/// Maps a `Citation.source` wire string to friendly, non-technical display text
/// (copy-tables.md §2 — mirrors web's `displayCitationSource` exactly). Tap/parse
/// behavior is untouched: this only changes the *visible* text and accessibility
/// label; ``parseCitationSource`` still drives what's tappable and where it opens.
///
/// Internal machinery (`run_sql`, `get_meta_usage`) never surfaces its wire form to
/// the user; entity sources (`pokemon/…`, `move/…`, `learnset/…`, …) render as a
/// kind label + titleized slug, still backed by the same tappable link. Anything
/// unrecognized passes through unchanged.
func displayCitationSource(_ source: String) -> String {
  guard let slashIndex = source.firstIndex(of: "/"), slashIndex != source.startIndex else {
    return source
  }
  let prefix = String(source[source.startIndex..<slashIndex])
    .trimmingCharacters(in: .whitespacesAndNewlines)
  let afterSlash = source.index(after: slashIndex)
  let rest = String(source[afterSlash...])

  switch prefix {
  case "run_sql":
    return "Oak's game database"
  case "wiki":
    return "Community wiki — \(rest)"
  case "get_meta_usage":
    let variant = rest.trimmingCharacters(in: .whitespacesAndNewlines)
    return variant == "gen9ou" ? "Competitive usage stats (Gen 9 OU)" : "Competitive usage stats"
  default:
    break
  }

  guard let parsed = parseCitationSource(source) else { return source }
  return "\(entityLabel(for: prefix)) — \(titleizeSlug(parsed.query))"
}

/// The kind label shown before the slug — keyed on the *raw* wire prefix (not the
/// mapped `EntityKind`) so `learnset/…` reads "Movepool" while `move/…` reads
/// "Move", even though both parse to the same tappable entity kind.
private func entityLabel(for prefix: String) -> String {
  switch prefix {
  case "pokemon": return "Pokémon"
  case "move": return "Move"
  case "ability": return "Ability"
  case "item": return "Item"
  case "type": return "Type"
  case "learnset": return "Movepool"
  default: return prefix
  }
}

/// Splits a hyphenated slug into capitalized words, e.g. `fake-out` → "Fake Out",
/// `will-o-wisp` → "Will O Wisp" (mirrors web's titleize exactly).
private func titleizeSlug(_ slug: String) -> String {
  slug.split(separator: "-")
    .map { word -> String in
      guard let first = word.first else { return String(word) }
      return first.uppercased() + word.dropFirst()
    }
    .joined(separator: " ")
}
