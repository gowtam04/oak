import Foundation

/// Visible candidate rows → tab-separated values (TBL-US-4).
///
/// Clones `web/src/lib/candidates-tsv.ts`. The caller passes the already-visible
/// set (after sort / filter / in-table pin). Hidden remainder is never included
/// (TBL-BR-1). Empty input → empty string (TBL-AC-4.4).
///
/// Portable column contract (spreadsheet paste, TBL-AC-4.1):
/// `Name\tTypes\tHP\tAtk\tDef\tSpA\tSpD\tSpe[\tAbility]`
/// Types join with `/`. Ability column is present only when any visible row
/// names an ability. `\n` line endings. Header first, then one line per row
/// in the given order. `key_stats` columns are used only when no row has
/// `base_stats`.

private let baseStatHeaders = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"]

/// Spreadsheet paste of the currently visible candidate table.
func candidatesToTsv(_ visibleRows: [CandidateRow]) -> String {
  if visibleRows.isEmpty { return "" }

  let hasBase = visibleRows.contains { $0.baseStats != nil }
  let keyStatKeys = collectKeyStatKeys(visibleRows)
  let hasKeyStats = !hasBase && !keyStatKeys.isEmpty
  let hasAbility = visibleRows.contains { row in
    guard let named = row.ability else { return false }
    return !named.isEmpty
  }

  var headers = ["Name", "Types"]
  if hasBase {
    headers.append(contentsOf: baseStatHeaders)
  } else if hasKeyStats {
    headers.append(contentsOf: keyStatKeys.map(statHeader))
  }
  if hasAbility { headers.append("Ability") }

  let body = visibleRows.map { row -> String in
    var cells = [row.name, row.types.joined(separator: "/")]
    if hasBase {
      if let stats = row.baseStats {
        cells.append(contentsOf: [
          String(stats.hp),
          String(stats.atk),
          String(stats.def),
          String(stats.spa),
          String(stats.spd),
          String(stats.spe),
        ])
      } else {
        cells.append(contentsOf: Array(repeating: "", count: baseStatHeaders.count))
      }
    } else if hasKeyStats {
      for key in keyStatKeys {
        if let value = row.keyStats?[key] {
          cells.append(scalarString(value))
        } else {
          cells.append("")
        }
      }
    }
    if hasAbility { cells.append(row.ability ?? "") }
    return cells.joined(separator: "\t")
  }

  return ([headers.joined(separator: "\t")] + body).joined(separator: "\n")
}

private func collectKeyStatKeys(_ rows: [CandidateRow]) -> [String] {
  var keys: [String] = []
  var seen = Set<String>()
  for row in rows {
    guard let keyStats = row.keyStats else { continue }
    for key in keyStats.keys {
      if seen.contains(key) { continue }
      seen.insert(key)
      keys.append(key)
    }
  }
  return keys
}

private func statHeader(_ key: String) -> String {
  if key == "hp" { return "HP" }
  return humanize(key)
}

private func humanize(_ slug: String) -> String {
  slug
    .split(separator: "-", omittingEmptySubsequences: false)
    .map { word in
      guard let first = word.first else { return String(word) }
      return first.uppercased() + word.dropFirst()
    }
    .joined(separator: " ")
}

private func scalarString(_ value: JSONScalar) -> String {
  switch value {
  case .string(let string):
    return string
  case .int(let int):
    return String(int)
  case .double(let double):
    return String(double)
  case .bool(let bool):
    return bool ? "true" : "false"
  case .null:
    return ""
  }
}
