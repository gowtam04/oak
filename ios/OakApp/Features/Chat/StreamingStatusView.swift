import SwiftUI

/// The live in-progress status line: a red verb, mute rest, and three soft
/// stepping dots. No plate, no pip, no record tick, no fake progress bar.
/// Friendly nouns come from ``ToolTrail`` — raw tool ids never render.
///
/// Purely presentational — it takes the reducer's coarse ``ChatViewModel/StreamingPhase``
/// and the tool-activity list and renders them. Dynamic-Type styles and semantic
/// colors adapt to text size and light/dark.
struct StreamingStatusView: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let phase: ChatViewModel.StreamingPhase
  let activities: [ChatViewModel.ToolActivity]
  /// When true, an auto-reconnect is pending/in flight after a backgrounding drop —
  /// the status line shows "Reconnecting" instead of the phase, matching web's UI.
  var reconnecting: Bool = false
  /// Kept so existing call sites compile. The incoming plate no longer shows a timer.
  var elapsedSeconds: Int? = nil

  var body: some View {
    if phase != .idle {
      HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.xs) {
        statusText
          .fixedSize(horizontal: false, vertical: true)
          .contentTransition(.opacity)
        SteppingDots(frozen: reduceMotion)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .animation(reduceMotion ? nil : Theme.Motion.smooth, value: phase)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(accessibilitySentence)
    }
  }

  private var copy: (verb: String, rest: String) {
    StreamingStatusCopy.parts(
      phase: phase,
      activities: activities.map { (tool: $0.tool, label: $0.label) },
      reconnecting: reconnecting
    )
  }

  private var accessibilitySentence: String {
    StreamingStatusCopy.accessibilityLabel(
      phase: phase,
      activities: activities.map { (tool: $0.tool, label: $0.label) },
      reconnecting: reconnecting
    )
  }

  private var statusText: Text {
    let verb = Text(copy.verb)
      .font(Theme.body(.subheadline, weight: .semibold))
      .foregroundStyle(Theme.accent)
    if copy.rest.isEmpty { return verb }
    return verb + Text(" \(copy.rest)")
      .font(Theme.body(.subheadline))
      .foregroundStyle(Theme.textSecondary)
  }
}

// MARK: - Copy (pure, testable)

/// Splits the live status sentence into a red verb and mute rest so the incoming
/// plate can style them independently.
enum StreamingStatusCopy {
  static func parts(
    phase: ChatViewModel.StreamingPhase,
    activities: [(tool: String, label: String)],
    reconnecting: Bool
  ) -> (verb: String, rest: String) {
    if reconnecting { return ("Reconnecting", "") }
    switch phase {
    case .idle:
      return ("", "")
    case .thinking:
      return ("Thinking", "through your question")
    case .usingTools:
      let nouns = ToolTrail.streamingNouns(activities: activities)
      return ("Looking up", nouns.joined(separator: ", "))
    case .answering:
      return ("Writing", "the answer")
    }
  }

  static func accessibilityLabel(
    phase: ChatViewModel.StreamingPhase,
    activities: [(tool: String, label: String)],
    reconnecting: Bool
  ) -> String {
    let copy = parts(phase: phase, activities: activities, reconnecting: reconnecting)
    if copy.verb.isEmpty { return "" }
    if copy.rest.isEmpty { return copy.verb }
    return "\(copy.verb) \(copy.rest)"
  }
}

// MARK: - Stepping dots

/// Three red-tinted dots that step opacity in a 2s wave, peaking at 62%.
/// Reduce Motion freezes them at mid-opacity — no blink, no ping-pong.
private struct SteppingDots: View {
  let frozen: Bool

  var body: some View {
    HStack(spacing: 4) {
      if frozen {
        ForEach(0..<3, id: \.self) { _ in
          Circle()
            .fill(Theme.accent)
            .frame(width: 3, height: 3)
            .opacity(0.45)
        }
      } else {
        TimelineView(.periodic(from: .now, by: 1.0 / 30.0)) { context in
          let t = context.date.timeIntervalSinceReferenceDate
          HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { index in
              Circle()
                .fill(Theme.accent)
                .frame(width: 3, height: 3)
                .opacity(Self.opacity(at: t, index: index))
            }
          }
        }
      }
    }
    .accessibilityHidden(true)
  }

  /// Matches the web `chat-incoming-dots` keyframes (2s, delays 0 / 0.22 / 0.44).
  private static func opacity(at time: TimeInterval, index: Int) -> Double {
    let cycle = 2.0
    let delay = Double(index) * 0.22
    let phase = ((time - delay).truncatingRemainder(dividingBy: cycle) + cycle)
      .truncatingRemainder(dividingBy: cycle) / cycle
    let low = 0.16
    let high = 0.62
    if phase < 0.18 { return low }
    if phase < 0.40 { return low + (high - low) * ((phase - 0.18) / 0.22) }
    if phase < 0.52 { return high }
    if phase < 0.74 { return high + (low - high) * ((phase - 0.52) / 0.22) }
    return low
  }
}

// MARK: - Tool-trail label + symbol mapping (pure, testable)

/// The client-side mapping that turns the server's web-oriented tool-activity labels
/// (which may carry leading emoji, e.g. `📇 Looking up Garchomp…`) into the iOS
/// instrument voice: a single SF Symbol per tool identity and emoji-free mono caps
/// text (specimen desk field notes). Pure and namespaced so it can be unit-tested
/// without constructing a view.
enum ToolTrail {
  /// Maps a tool name to its representative SF Symbol — the per-tool distinctions
  /// (move→bolt, item→bag, encounters→map, teams→person.3, …) merged with the
  /// instrument-trail additions (reasoning→brain, run_sql→tablecells,
  /// search_wiki→text.book.closed). Unmatched lookups (`list_*` then
  /// `get_*`/`resolve_*`/`query_*`) fall through to generic glyphs; unknown tools get
  /// the wrench. The label text always carries the meaning (M-AC-UI9.3).
  static func symbol(for tool: String) -> String {
    switch tool {
    case "reasoning": return "brain"
    case "resolve_entity": return "magnifyingglass"
    case "get_pokemon": return "book"
    case "get_move": return "bolt"
    case "get_ability": return "sparkles"
    case "get_item": return "bag"
    case "type_matchup", "get_type_chart": return "shield.lefthalf.filled"
    case "compute_stat", "get_usage_stats": return "chart.bar"
    case "estimate_damage": return "function"
    case "get_learnset": return "list.bullet"
    case "get_team", "save_team", "list_teams": return "person.3"
    case "get_encounters": return "map"
    case "run_sql": return "tablecells"
    case "search_wiki": return "text.book.closed"
    default:
      if tool.hasPrefix("list_") { return "list.bullet" }
      if tool.hasPrefix("get_") || tool.hasPrefix("resolve_") || tool.hasPrefix("query_") {
        return "magnifyingglass"
      }
      return "wrench.and.screwdriver"
    }
  }

  /// Maps a raw tool id to the friendly, non-technical noun users see (the same
  /// vocabulary as web's `instrumentToken` — copy-tables.md §1). A raw tool id must
  /// never reach the screen: every caller in this file routes through here,
  /// including both bare fallback paths in ``rowLabel(tool:label:)``.
  static func friendlyNoun(_ tool: String) -> String {
    switch tool {
    case "resolve_entity": return "Dex lookup"
    case "query_pokedex": return "Pokédex search"
    case "get_pokemon": return "Pokémon"
    case "get_move": return "Move"
    case "get_ability": return "Ability"
    case "get_item": return "Item"
    case "get_type_matchups": return "Type matchups"
    case "get_evolution_chain": return "Evolution"
    case "compute_stat": return "Stats"
    case "estimate_damage": return "Damage calc"
    case "get_usage_stats", "get_meta_usage": return "Usage"
    case "get_encounters": return "Locations"
    case "get_learnset": return "Movepool"
    case "get_team", "list_teams", "save_team": return "Teams"
    case "run_sql": return "Game data"
    case "search_wiki": return "Wiki"
    case "submit_answer": return "Answer"
    case "submit_builder_answer": return "Teams"
    default: return "Lookup"
    }
  }

  /// The instrument-voice row text. When the label parses into a tool + subject —
  /// e.g. `get_pokemon` + a resolvable "Garchomp" — it renders `Pokémon ·
  /// Garchomp`; otherwise it falls back to the cleaned (emoji-stripped) label, or
  /// the friendly noun when there's no usable label at all. The `.instrumentLabel()`
  /// modifier applies the uppercasing + tracking, so this returns natural-case text.
  static func rowLabel(tool: String, label: String) -> String {
    let cleaned = strippingLeadingEmoji(label)
    if let subject = subject(from: cleaned) {
      return "\(friendlyNoun(tool)) · \(subject)"
    }
    return cleaned.isEmpty ? friendlyNoun(tool) : cleaned
  }

  /// Mute streaming sentence: `Looking up {Farigiraf, Fake Out, Armor Tail}`.
  /// Uses extracted subjects when the label names one; otherwise the friendly
  /// noun. Never emits a raw tool id. Empty / reasoning-only → "Looking things
  /// up…".
  static func streamingSentence(activities: [(tool: String, label: String)]) -> String {
    let nouns = streamingNouns(activities: activities)
    if nouns.isEmpty { return "Looking things up…" }
    return "Looking up \(nouns.joined(separator: ", "))"
  }

  /// Unique friendly nouns / subjects for the live status line, first-seen order.
  static func streamingNouns(activities: [(tool: String, label: String)]) -> [String] {
    var seen = Set<String>()
    var out: [String] = []
    for activity in activities {
      if activity.tool == "reasoning" || activity.tool == "submit_answer" {
        continue
      }
      let cleaned = strippingLeadingEmoji(activity.label)
      let noun = subject(from: cleaned) ?? friendlyNoun(activity.tool)
      if seen.insert(noun).inserted {
        out.append(noun)
      }
    }
    return out
  }

  /// The collapse-to-chip summary text: `N LOOKUPS · Xs` (`.instrumentLabel()` caps
  /// it). The seconds clause is dropped when no timer is available.
  static func summaryLabel(count: Int, seconds: Int?) -> String {
    let noun = count == 1 ? "lookup" : "lookups"
    if let seconds {
      return "\(count) \(noun) · \(seconds)s"
    }
    return "\(count) \(noun)"
  }

  /// A spoken-language accessibility label for the summary chip (natural case, no
  /// abbreviation) — "3 lookups in 6 seconds".
  static func summaryAccessibilityLabel(count: Int, seconds: Int?) -> String {
    let noun = count == 1 ? "lookup" : "lookups"
    if let seconds {
      return "\(count) \(noun) in \(seconds) seconds"
    }
    return "\(count) \(noun)"
  }

  /// Strips leading emoji / pictographs / variation selectors (and the whitespace
  /// that follows them) from a server label, so `📇 Looking up Garchomp…` becomes
  /// `Looking up Garchomp…`. Only *leading* symbols are removed — interior text is
  /// untouched.
  static func strippingLeadingEmoji(_ label: String) -> String {
    var scalars = Array(label.unicodeScalars)
    var start = 0
    while start < scalars.count {
      let scalar = scalars[start]
      if scalar.properties.isEmojiPresentation
        || scalar.properties.isEmoji && scalar.value > 0x2500
        || isEmojiModifierOrSelector(scalar)
        || scalar == " " || scalar == "\u{FE0F}" || scalar == "\u{200D}" {
        start += 1
      } else {
        break
      }
    }
    scalars.removeFirst(start)
    return String(String.UnicodeScalarView(scalars))
      .trimmingCharacters(in: .whitespaces)
  }

  /// Extracts the subject entity from a cleaned label when one is clearly present:
  /// a “curly-quoted” or "straight-quoted" phrase (resolve/search/sql labels), else
  /// the last capitalised word-run in a "Looking up X" / "Looking up Fake Out"
  /// phrase. Returns `nil` when nothing reads as a distinct subject, so the caller
  /// falls back to the cleaned label / friendly noun.
  static func subject(from cleaned: String) -> String? {
    // Quoted subject: “…”, "…", or ‟…”.
    if let quoted = firstQuoted(in: cleaned) {
      let trimmed = quoted.trimmingCharacters(in: .whitespaces)
      return trimmed.isEmpty ? nil : trimmed
    }
    // Last contiguous capitalised run, e.g. "Looking up Garchomp", "Looking up
    // Fake Out", "Looking up the move Will-O-Wisp".
    let words = cleaned
      .trimmingCharacters(in: CharacterSet(charactersIn: "….'s "))
      .split(whereSeparator: { $0 == " " })
      .map(String.init)
    var lastRun: [String] = []
    var lastRunStart = -1
    var currentRun: [String] = []
    var currentStart = -1
    for (index, word) in words.enumerated() {
      if let first = word.first, first.isUppercase {
        if currentRun.isEmpty { currentStart = index }
        currentRun.append(word)
        lastRun = currentRun
        lastRunStart = currentStart
      } else {
        currentRun = []
      }
    }
    // A real subject is a later capitalised run — never the sentence-initial
    // "Looking" / "Reading" on its own.
    guard !lastRun.isEmpty else { return nil }
    if lastRun.count == 1, lastRunStart == 0 { return nil }
    return lastRun.joined(separator: " ")
  }

  /// The first substring wrapped in a matched quote pair (curly or straight).
  private static func firstQuoted(in text: String) -> String? {
    let openers: [Character: Character] = ["“": "”", "\"": "\"", "‟": "”", "‘": "’"]
    var opener: Character?
    var buffer = ""
    for char in text {
      if let expectedClose = opener {
        if char == expectedClose { return buffer }
        buffer.append(char)
      } else if let close = openers[char] {
        opener = close
        buffer = ""
      }
    }
    return nil
  }

  private static func isEmojiModifierOrSelector(_ scalar: Unicode.Scalar) -> Bool {
    // Skin-tone modifiers and regional indicators.
    (0x1F3FB...0x1F3FF).contains(scalar.value)
      || (0x1F1E6...0x1F1FF).contains(scalar.value)
  }
}

#if DEBUG
#Preview("Using tools") {
  StreamingStatusView(
    phase: .usingTools,
    activities: [
      .init(tool: "resolve_entity", label: "🔍 Resolving “Farigiraf”…"),
      .init(tool: "get_move", label: "Looking up Fake Out…"),
      .init(tool: "get_ability", label: "Looking up Armor Tail…"),
    ]
  )
  .padding()
}

#Preview("Thinking") {
  StreamingStatusView(phase: .thinking, activities: [])
    .padding()
}

#Preview("Writing") {
  StreamingStatusView(
    phase: .answering,
    activities: [
      .init(tool: "resolve_entity", label: "🔍 Resolving “Farigiraf”…"),
      .init(tool: "get_move", label: "Looking up Fake Out…"),
    ]
  )
  .padding()
}

#Preview("Reconnecting") {
  StreamingStatusView(phase: .thinking, activities: [], reconnecting: true)
    .padding()
}
#endif
