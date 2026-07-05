import Foundation

/// Parses a `Citation.source` string into an openable entity (mirrors
/// `web/src/components/artifact/parse-citation.ts` exactly).
///
/// `source` is `"<kind>/<slug>"`, e.g. "ability/armor-tail", "pokemon/garchomp",
/// "type/ground", "learnset/will-o-wisp (gen-9)". `learnset` maps to `move` and a
/// trailing parenthetical qualifier is stripped. Only the five concrete
/// `EntityKind` cases are ever returned — an unknown prefix, a missing slash, or
/// an empty slug returns `nil` (the citation renders as plain, non-clickable
/// text — no crash).
func parseCitationSource(_ source: String) -> (kind: EntityKind, query: String)? {
  guard let slashIndex = source.firstIndex(of: "/"), slashIndex != source.startIndex else {
    return nil
  }

  var prefix = String(source[source.startIndex..<slashIndex])
    .trimmingCharacters(in: .whitespacesAndNewlines)
  if prefix == "learnset" { prefix = "move" }

  let kind: EntityKind
  switch prefix {
  case "pokemon": kind = .pokemon
  case "move": kind = .move
  case "ability": kind = .ability
  case "item": kind = .item
  case "type": kind = .type
  default: return nil
  }

  // Strip a trailing qualifier like " (gen-9)".
  let afterSlash = source.index(after: slashIndex)
  let tail = source[afterSlash...]
  let rawSlug = tail.firstIndex(of: "(").map { tail[tail.startIndex..<$0] } ?? tail
  let slug = rawSlug.trimmingCharacters(in: .whitespacesAndNewlines)
  guard !slug.isEmpty else { return nil }

  return (kind, slug)
}
