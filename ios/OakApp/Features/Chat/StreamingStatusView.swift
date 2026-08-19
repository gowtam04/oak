import SwiftUI

/// Expandable thinking trace: dotted orb + shimmering "Thinking", then one row
/// per live tool call (spinner on the in-flight row, check on done). Collapses
/// to "Thought for N seconds" once tokens start. Friendly nouns come from
/// ``ToolTrail`` — raw tool ids never render.
struct StreamingStatusView: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let phase: ChatViewModel.StreamingPhase
  let activities: [ChatViewModel.ToolActivity]
  /// When true, an auto-reconnect is pending/in flight after a backgrounding drop —
  /// the header shows "Reconnecting" instead of the phase, matching web's UI.
  var reconnecting: Bool = false
  /// Stream start, used to freeze "Thought for N seconds" when tokens arrive.
  var startedAt: Date? = nil
  /// True once `answer_markdown` tokens have started — header settles, list
  /// auto-collapses.
  var settled: Bool = false
  /// Kept so existing call sites compile. Prefer ``startedAt``.
  var elapsedSeconds: Int? = nil

  @State private var userOpen: Bool?
  @State private var frozenElapsed: Int?
  @State private var spinAngle: Double = 0
  @State private var shownOrb: OrbState = .breathing
  @State private var holdWork: DispatchWorkItem?

  var body: some View {
    if phase != .idle {
      VStack(alignment: .leading, spacing: 2) {
        header
        if open, !rows.isEmpty {
          rowList
            .transition(.opacity.combined(with: .move(edge: .top)))
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .animation(reduceMotion ? nil : Theme.Motion.enter, value: open)
      .animation(reduceMotion ? nil : Theme.Motion.smooth, value: headerText)
      .onAppear {
        captureFreeze()
        shownOrb = desiredOrb
      }
      .onChange(of: settled) { _, _ in captureFreeze() }
      .onChange(of: sceneKey) { _, _ in userOpen = nil }
      .onChange(of: desiredOrb) { _, next in
        holdOrbChange(next)
      }
      .accessibilityElement(children: .contain)
    }
  }

  private var pairs: [(tool: String, label: String)] {
    activities.map { (tool: $0.tool, label: $0.label) }
  }

  private var rows: [ThinkingTraceCopy.Row] {
    reconnecting ? [] : ThinkingTraceCopy.rows(activities: pairs, settled: settled)
  }

  private var autoOpen: Bool {
    !rows.isEmpty && !settled && !reconnecting
  }

  private var open: Bool { userOpen ?? autoOpen }

  private var sceneKey: String {
    "\(reconnecting ? 1 : 0):\(settled ? 1 : 0):\(rows.isEmpty ? 0 : 1)"
  }

  private var live: Bool { ThinkingTraceCopy.header(reconnecting: reconnecting, settled: settled).live }

  private var desiredOrb: OrbState {
    ThinkingTraceCopy.orbState(
      reconnecting: reconnecting,
      latestTool: rows.last?.tool,
      writing: settled
    )
  }

  private func holdOrbChange(_ next: OrbState) {
    if next == shownOrb { return }
    holdWork?.cancel()
    let work = DispatchWorkItem { shownOrb = next }
    holdWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4, execute: work)
  }

  private var headerText: String {
    ThinkingTraceCopy.header(
      reconnecting: reconnecting,
      settled: settled,
      elapsedSeconds: displayedElapsed
    ).text
  }

  private var displayedElapsed: Int {
    if let frozenElapsed { return frozenElapsed }
    if let elapsedSeconds { return elapsedSeconds }
    guard let startedAt else { return 0 }
    return max(0, Int(Date().timeIntervalSince(startedAt)))
  }

  private func captureFreeze() {
    guard settled, frozenElapsed == nil else {
      if !settled { frozenElapsed = nil }
      return
    }
    if let elapsedSeconds {
      frozenElapsed = elapsedSeconds
    } else if let startedAt {
      frozenElapsed = max(0, Int(Date().timeIntervalSince(startedAt)))
    } else {
      frozenElapsed = 0
    }
  }

  @ViewBuilder
  private var header: some View {
    let label = HStack(spacing: Theme.Spacing.sm) {
      ThinkingOrbView(
        state: shownOrb,
        live: live || shownOrb == .composing
      )
      headerLabel
      if !rows.isEmpty {
        Image(systemName: "chevron.down")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(Theme.textMuted)
          .rotationEffect(.degrees(open ? 180 : 0))
      }
    }

    if rows.isEmpty {
      label
        .padding(.vertical, 4)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(headerText)
        .accessibilityAddTraits(.updatesFrequently)
    } else {
      Button {
        userOpen = !open
      } label: {
        label
      }
      .buttonStyle(.plain)
      .padding(.vertical, 4)
      .accessibilityLabel(headerText)
      .accessibilityHint(open ? "Collapse steps" : "Expand steps")
      .accessibilityAddTraits(.isButton)
    }
  }

  @ViewBuilder
  private var headerLabel: some View {
    if live && !reduceMotion {
      TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: false)) { context in
        let t = context.date.timeIntervalSinceReferenceDate
          .truncatingRemainder(dividingBy: 1.4) / 1.4
        Text(headerText)
          .font(Theme.body(.subheadline, weight: .medium))
          .foregroundStyle(shimmerGradient(phase: t))
      }
    } else {
      Text(headerText)
        .font(Theme.body(.subheadline, weight: .medium))
        .foregroundStyle(Theme.textSecondary)
    }
  }

  private func shimmerGradient(phase: Double) -> LinearGradient {
    LinearGradient(
      stops: [
        .init(color: Theme.textMuted, location: 0),
        .init(color: Theme.textStrong, location: 0.5),
        .init(color: Theme.textMuted, location: 1),
      ],
      startPoint: UnitPoint(x: -1 + phase * 2, y: 0.5),
      endPoint: UnitPoint(x: phase * 2, y: 0.5)
    )
  }

  private var rowList: some View {
    VStack(alignment: .leading, spacing: 4) {
      ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
        HStack(spacing: Theme.Spacing.sm) {
          if row.active {
            spinningRing
          } else {
            Image(systemName: "checkmark")
              .font(.system(size: 11, weight: .semibold))
              .foregroundStyle(Theme.textMuted)
              .frame(width: 14, height: 14)
          }
          Text(row.primary)
            .font(Theme.body(.footnote, weight: .medium))
            .foregroundStyle(Theme.textStrong)
            .lineLimit(1)
          if let secondary = row.secondary {
            Spacer(minLength: Theme.Spacing.sm)
            Text(secondary)
              .font(Theme.body(.caption))
              .foregroundStyle(Theme.textMuted)
              .lineLimit(1)
          }
        }
        .frame(minHeight: 28)
        .padding(.horizontal, 6)
        .opacity(reduceMotion ? 1 : 1)
        .transition(.opacity.combined(with: .offset(y: 4)))
        .animation(
          reduceMotion ? nil : Theme.Motion.staggered(index, base: Theme.Motion.enter, step: 0.12),
          value: rows.count
        )
      }
    }
    .padding(.leading, 20)
    .padding(.vertical, 4)
    .overlay(alignment: .leading) {
      Rectangle()
        .fill(Theme.separator)
        .frame(width: 1)
        .padding(.leading, 10)
        .padding(.vertical, 2)
    }
    .accessibilityElement(children: .combine)
  }

  private var spinningRing: some View {
    Circle()
      .trim(from: 0, to: 0.72)
      .stroke(Theme.textSecondary, style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
      .frame(width: 12, height: 12)
      .rotationEffect(.degrees(reduceMotion ? 0 : spinAngle))
      .onAppear {
        guard !reduceMotion else { return }
        withAnimation(.linear(duration: 0.7).repeatForever(autoreverses: false)) {
          spinAngle = 360
        }
      }
      .accessibilityHidden(true)
  }
}

// MARK: - Copy (pure, testable)

/// Header + row mapping for the thinking trace. Lock-step with web
/// `thinking-trace.ts` and Android `thinkingHeader` / `traceRows`.
enum ThinkingTraceCopy {
  struct Row: Equatable {
    var tool: String
    var primary: String
    var secondary: String?
    var active: Bool
  }

  struct Header: Equatable {
    var live: Bool
    var text: String
  }

  static func header(
    reconnecting: Bool,
    settled: Bool,
    elapsedSeconds: Int? = nil
  ) -> Header {
    if reconnecting { return Header(live: true, text: "Reconnecting") }
    if !settled { return Header(live: true, text: "Thinking") }
    return Header(live: false, text: thoughtFor(elapsedSeconds))
  }

  static func thoughtFor(_ elapsedSeconds: Int?) -> String {
    let n = elapsedSeconds ?? 0
    if n <= 0 { return "Thought for a moment" }
    if n == 1 { return "Thought for 1 second" }
    return "Thought for \(n) seconds"
  }

  static func rows(
    activities: [(tool: String, label: String)],
    settled: Bool
  ) -> [Row] {
    let visible = activities.filter { $0.tool != "reasoning" && $0.tool != "submit_answer" && $0.tool != "submit_builder_answer" }
    return visible.enumerated().map { index, activity in
      let cleaned = ToolTrail.strippingLeadingEmoji(activity.label)
      return Row(
        tool: activity.tool,
        primary: ToolTrail.friendlyNoun(activity.tool),
        secondary: ToolTrail.subject(from: cleaned),
        active: !settled && index == visible.count - 1
      )
    }
  }

  /// Lock-step with web `orbStateForActivity` / Android `orbStateForActivity`.
  static func orbState(
    reconnecting: Bool,
    latestTool: String?,
    writing: Bool = false
  ) -> OrbState {
    if reconnecting { return .connecting }
    if writing { return .composing }
    guard let tool = latestTool, !tool.isEmpty else { return .breathing }
    if Self.hiddenTools.contains(tool) { return .breathing }
    if Self.solvingTools.contains(tool) { return .solving }
    if Self.searchingTools.contains(tool) { return .searching }
    return .breathing
  }

  private static let hiddenTools: Set<String> = [
    "reasoning", "submit_answer", "submit_builder_answer",
  ]
  private static let solvingTools: Set<String> = [
    "compute_stat", "estimate_damage", "run_sql", "get_usage_stats", "get_meta_usage",
  ]
  private static let searchingTools: Set<String> = [
    "resolve_entity", "query_pokedex", "get_pokemon", "get_move", "get_ability",
    "get_item", "get_type_matchups", "get_evolution_chain", "get_encounters",
    "get_learnset", "get_team", "list_teams", "save_team", "search_wiki",
  ]
}

/// Legacy verb/rest split — kept so older tests and call sites still compile.
/// New chrome uses ``ThinkingTraceCopy``.
enum StreamingStatusCopy {
  static func parts(
    phase: ChatViewModel.StreamingPhase,
    activities: [(tool: String, label: String)],
    reconnecting: Bool
  ) -> (verb: String, rest: String) {
    let settled = phase == .answering
    let header = ThinkingTraceCopy.header(
      reconnecting: reconnecting,
      settled: settled,
      elapsedSeconds: nil
    )
    return (header.text, "")
  }

  static func accessibilityLabel(
    phase: ChatViewModel.StreamingPhase,
    activities: [(tool: String, label: String)],
    reconnecting: Bool
  ) -> String {
    parts(phase: phase, activities: activities, reconnecting: reconnecting).verb
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
    ],
    startedAt: Date().addingTimeInterval(-4),
    settled: true
  )
  .padding()
}

#Preview("Reconnecting") {
  StreamingStatusView(phase: .thinking, activities: [], reconnecting: true)
    .padding()
}
#endif
