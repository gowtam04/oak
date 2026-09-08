import Foundation

/// Medium date + short time in the given zone (device zone by default).
/// Never ISO-8601 / trailing `Z` — CF-USAGE-AC-1.3 as-of stamp, human-readable.
func formatUsageFetchedAt(
  _ ms: Int64,
  timeZone: TimeZone = .current,
  locale: Locale = .current
) -> String {
  let date = Date(timeIntervalSince1970: TimeInterval(ms) / 1000)
  let formatter = DateFormatter()
  formatter.dateStyle = .medium
  formatter.timeStyle = .short
  formatter.timeZone = timeZone
  formatter.locale = locale
  formatter.doesRelativeDateFormatting = false
  return formatter.string(from: date)
}

struct UsageAttributionParts: Equatable, Sendable {
  var source: String
  var legal: String?
}

/// Split the T15 attribution blob into a short source name and optional legal line.
/// `"championsbattledata.com — a community-maintained …"` → name + remainder.
func parseUsageAttribution(_ raw: String) -> UsageAttributionParts {
  let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
  guard !trimmed.isEmpty else { return UsageAttributionParts(source: trimmed, legal: nil) }
  for sep in [" — ", " – ", " - "] {
    if let range = trimmed.range(of: sep) {
      let source = String(trimmed[..<range.lowerBound])
        .trimmingCharacters(in: .whitespacesAndNewlines)
      let legal = String(trimmed[range.upperBound...])
        .trimmingCharacters(in: .whitespacesAndNewlines)
      if !source.isEmpty {
        return UsageAttributionParts(source: source, legal: legal.isEmpty ? nil : legal)
      }
    }
  }
  return UsageAttributionParts(source: trimmed, legal: nil)
}
