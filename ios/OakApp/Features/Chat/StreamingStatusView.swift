import SwiftUI

/// The live in-progress indicator shown while a turn streams (chat-experience.md
/// M-CHAT-US-4): a tool-activity ticker plus a "thinking"/"answering" state, so the
/// wait feels responsive and the reasoning is visible — Oak's **field-notes trail**,
/// the signature moment of the product (fable-ui-strategy-ios.md §4.03).
///
/// Two shapes, chosen by `phase`:
///   - while Oak works (`thinking`/`usingTools`): the full trail — a phase line with
///     an elapsed timer, then one mono "instrument" row per tool call, the active row
///     shimmering and completed rows muted with a tick;
///   - once prose starts (`answering`): the trail **collapses to one summary chip**
///     ("N LOOKUPS · Xs") docked above the answer — the work becomes the receipt,
///     nothing is deleted (§4.03, §3 Motion continuity).
///
/// Purely presentational — it takes the reducer's coarse ``ChatViewModel/StreamingPhase``
/// and the tool-activity list and renders them. The server sends web-oriented labels
/// that may carry leading emoji (`runtime.ts` emits `🤔 Reasoning…`); the client strips
/// them and maps tool identity → SF Symbol via ``ToolTrail`` so the row shows a single
/// vector glyph and emoji-free mono text. Meaning is carried by text + an SF Symbol +
/// the spinner, never color alone (M-AC-UI9.3); Dynamic-Type styles and semantic colors
/// adapt to text size and light/dark.
struct StreamingStatusView: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let phase: ChatViewModel.StreamingPhase
  let activities: [ChatViewModel.ToolActivity]
  /// When true, an auto-reconnect is pending/in flight after a backgrounding drop — the
  /// status line shows "Reconnecting…" instead of the phase, matching web's UI.
  var reconnecting: Bool = false
  /// Whole seconds elapsed since the turn began, rendered mono in the card header.
  /// Driven by the parent's per-turn timer (`nil` ⇒ the header timer is hidden).
  var elapsedSeconds: Int? = nil

  var body: some View {
    if phase == .answering {
      // Continuity: the trail has collapsed into its receipt chip above the answer.
      summaryChip
        .transition(collapseTransition)
    } else if phase != .idle {
      VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
        statusLine

        // The recent tool-activity ticker (newest last). Kept across answer_start so
        // the user can see what Oak looked up before it started writing.
        if !activities.isEmpty {
          VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            ForEach(Array(activities.enumerated()), id: \.element.id) { index, activity in
              activityRow(activity, completed: isCompleted(index), active: isActive(index))
                .transition(activityTransition)
            }
          }
          .animation(reduceMotion ? nil : Theme.Motion.snappy, value: activities.count)
          .accessibilityElement(children: .combine)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(Theme.Spacing.md)
      .oakCard(radius: Theme.Radius.md)
      .transition(collapseTransition)
    }
  }

  /// The headline status: the brand spinner, a phase icon, a phase label that
  /// crossfades on change and shimmers while streaming, and a right-aligned mono
  /// elapsed timer (§4.03).
  @ViewBuilder
  private var statusLine: some View {
    HStack(spacing: Theme.Spacing.sm) {
      OakSpinner(size: 18)
      Image(systemName: phaseIcon)
        .foregroundStyle(Theme.accent)
        .imageScale(.small)
      Text(phaseLabel)
        .font(Theme.display(.subheadline))
        .foregroundStyle(Theme.textPrimary)
        .contentTransition(.opacity)
        .shimmer(active: !reduceMotion)
      Spacer(minLength: Theme.Spacing.sm)
      if let elapsedSeconds {
        Text("\(elapsedSeconds)s")
          .font(Theme.mono(.caption2))
          .monospacedDigit()
          .foregroundStyle(Theme.textSecondary)
          .accessibilityLabel("\(elapsedSeconds) seconds elapsed")
      }
    }
    .animation(reduceMotion ? nil : Theme.Motion.smooth, value: phase)
    .accessibilityElement(children: .combine)
    .accessibilityLabel(phaseLabel)
  }

  /// One tool-activity line in the instrument voice: a per-tool SF Symbol + a mono
  /// caps label (`GET_POKEMON · GARCHOMP`). A completed line dims to `textMuted` and
  /// gains a trailing checkmark; the active (last, pre-answer) line stays azure and
  /// shimmers like the phase line. Text is the primary meaning carrier — the icon is
  /// enhancement (M-AC-UI9.3).
  private func activityRow(
    _ activity: ChatViewModel.ToolActivity,
    completed: Bool,
    active: Bool
  ) -> some View {
    HStack(spacing: Theme.Spacing.sm) {
      Image(systemName: ToolTrail.symbol(for: activity.tool))
        .foregroundStyle(completed ? Theme.textMuted : Theme.azure)
        .imageScale(.small)
        .frame(width: 18)
        // Bounce the icon as new activity arrives; frozen under Reduce Motion.
        .symbolEffect(.bounce, value: reduceMotion ? 0 : activities.count)
      Text(ToolTrail.rowLabel(tool: activity.tool, label: activity.label))
        .instrumentLabel()
        .foregroundStyle(completed ? Theme.textMuted : Theme.textSecondary)
        .lineLimit(1)
        .truncationMode(.tail)
        .shimmer(active: active && !reduceMotion)
      if completed {
        Image(systemName: "checkmark")
          .font(.caption2.weight(.semibold))
          .foregroundStyle(Theme.success)
          .accessibilityHidden(true)
      }
    }
  }

  /// The collapse-to-chip receipt (§4.03): a single quiet `surfaceSunken` capsule
  /// summarising the trail as `N LOOKUPS · Xs`, docked above the answer content.
  /// Static/non-interactive for now.
  @ViewBuilder
  private var summaryChip: some View {
    Text(ToolTrail.summaryLabel(count: activities.count, seconds: elapsedSeconds))
      .instrumentLabel()
      .foregroundStyle(Theme.textSecondary)
      .padding(.horizontal, Theme.Spacing.md)
      .padding(.vertical, Theme.Spacing.xs)
      .background(Theme.surfaceSunken, in: Capsule())
      .accessibilityElement()
      .accessibilityLabel(ToolTrail.summaryAccessibilityLabel(count: activities.count, seconds: elapsedSeconds))
  }

  /// A tool line is "completed" once it isn't the newest in-flight lookup: every line
  /// but the last while tools run, and all lines once the answer is being written.
  private func isCompleted(_ index: Int) -> Bool {
    if phase == .answering { return true }
    return index < activities.count - 1
  }

  /// The active line is the newest one while tools run (never during `answering`).
  private func isActive(_ index: Int) -> Bool {
    guard phase != .answering else { return false }
    return index == activities.count - 1
  }

  private var activityTransition: AnyTransition {
    reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity)
  }

  /// The trail↔chip continuity move: a `smooth` blend under normal motion, a plain
  /// crossfade under Reduce Motion (§3 Motion).
  private var collapseTransition: AnyTransition {
    reduceMotion ? .opacity : .opacity.combined(with: .scale(scale: 0.96))
  }

  private var phaseLabel: String {
    if reconnecting { return "Reconnecting…" }
    switch phase {
    case .idle: return ""
    case .thinking: return "Thinking…"
    case .usingTools: return "Looking things up…"
    case .answering: return "Writing the answer…"
    }
  }

  private var phaseIcon: String {
    if reconnecting { return "arrow.clockwise" }
    switch phase {
    case .idle, .thinking: return "brain"
    case .usingTools: return "magnifyingglass"
    case .answering: return "text.append"
    }
  }
}

// MARK: - Tool-trail label + symbol mapping (pure, testable)

/// The client-side mapping that turns the server's web-oriented tool-activity labels
/// (which may carry leading emoji, e.g. `📇 Looking up Garchomp…`) into the iOS
/// instrument voice: a single SF Symbol per tool identity and emoji-free mono caps
/// text (fable-ui-strategy-ios.md §4.03). Pure and namespaced so it can be unit-tested
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
  /// the last capitalised run in a "Looking up X" / "Reading the X ability" phrase.
  /// Returns `nil` when nothing reads as a distinct subject, so the caller falls back
  /// to the cleaned label.
  private static func subject(from cleaned: String) -> String? {
    // Quoted subject: “…”, "…", or ‟…”.
    if let quoted = firstQuoted(in: cleaned) {
      let trimmed = quoted.trimmingCharacters(in: .whitespaces)
      return trimmed.isEmpty ? nil : trimmed
    }
    // Trailing capitalised entity, e.g. "Looking up Garchomp" or "Looking up the
    // move Will-O-Wisp". Trim a trailing "…"/"'s …" possessive and grab the last
    // capitalised word-run.
    let words = cleaned
      .trimmingCharacters(in: CharacterSet(charactersIn: "….'s "))
      .split(whereSeparator: { $0 == " " })
      .map(String.init)
    let capitalised = words.filter { word in
      guard let first = word.first else { return false }
      return first.isUppercase
    }
    // The first word of a label is a sentence-initial capital ("Looking", "Reading")
    // — a real subject is a *later* capitalised run. Require at least two words so we
    // never mistake the sentence lead for a subject.
    guard words.count > 1, let last = capitalised.last, capitalised.count >= 1,
      last != words.first else { return nil }
    return last
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
      .init(tool: "resolve_entity", label: "🔍 Resolving “Garchomp”…"),
      .init(tool: "get_pokemon", label: "📇 Looking up Garchomp…"),
    ],
    elapsedSeconds: 4
  )
  .padding()
}

#Preview("Thinking") {
  StreamingStatusView(phase: .thinking, activities: [], elapsedSeconds: 1)
    .padding()
}

#Preview("Collapsed chip") {
  StreamingStatusView(
    phase: .answering,
    activities: [
      .init(tool: "resolve_entity", label: "🔍 Resolving “Garchomp”…"),
      .init(tool: "get_pokemon", label: "📇 Looking up Garchomp…"),
    ],
    elapsedSeconds: 6
  )
  .padding()
}
#endif
