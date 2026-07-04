import SwiftUI

/// The live in-progress indicator shown while a turn streams (chat-experience.md
/// M-CHAT-US-4): a tool-activity ticker plus a "thinking"/"answering" state, so the
/// wait feels responsive and the reasoning is visible.
///
/// Purely presentational — it takes the reducer's coarse ``ChatViewModel/StreamingPhase``
/// and the tool-activity list and renders them. Meaning is carried by text + an SF
/// Symbol + the spinner, never color alone (M-AC-UI9.3); Dynamic-Type styles and
/// semantic colors adapt to text size and light/dark.
struct StreamingStatusView: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let phase: ChatViewModel.StreamingPhase
  let activities: [ChatViewModel.ToolActivity]
  /// When true, an auto-reconnect is pending/in flight after a backgrounding drop — the
  /// status line shows "Reconnecting…" instead of the phase, matching web's UI.
  var reconnecting: Bool = false

  var body: some View {
    if phase != .idle {
      VStack(alignment: .leading, spacing: 8) {
        statusLine

        // The recent tool-activity ticker (newest last). Kept across answer_start so
        // the user can see what Oak looked up before it started writing.
        if !activities.isEmpty {
          VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(activities.enumerated()), id: \.element.id) { index, activity in
              activityRow(activity, completed: isCompleted(index))
                .transition(activityTransition)
            }
          }
          .animation(reduceMotion ? nil : Theme.Motion.snappy, value: activities.count)
          .accessibilityElement(children: .combine)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(12)
      .oakCard(radius: Theme.Radius.md)
    }
  }

  /// The headline status: the brand spinner, a phase icon, and a phase label that
  /// crossfades on change and shimmers while streaming.
  @ViewBuilder
  private var statusLine: some View {
    HStack(spacing: 8) {
      OakSpinner(size: 18)
      Image(systemName: phaseIcon)
        .foregroundStyle(Theme.accent)
        .imageScale(.small)
      Text(phaseLabel)
        .font(Theme.display(.subheadline))
        .foregroundStyle(Theme.textPrimary)
        .contentTransition(.opacity)
        .shimmer(active: !reduceMotion)
    }
    .animation(reduceMotion ? nil : Theme.Motion.smooth, value: phase)
    .accessibilityElement(children: .combine)
    .accessibilityLabel(phaseLabel)
  }

  /// One tool-activity line: a per-tool SF Symbol + the label. A completed line dims
  /// to `textMuted` and gains a trailing checkmark; the active (last, pre-answer) line
  /// stays azure. Text is the primary meaning carrier — the icon is enhancement.
  private func activityRow(_ activity: ChatViewModel.ToolActivity, completed: Bool) -> some View {
    HStack(spacing: 8) {
      Image(systemName: iconName(for: activity.tool))
        .foregroundStyle(completed ? Theme.textMuted : Theme.azure)
        .imageScale(.small)
        .frame(width: 18)
        // Bounce the icon as new activity arrives; frozen under Reduce Motion.
        .symbolEffect(.bounce, value: reduceMotion ? 0 : activities.count)
      Text(activity.label)
        .font(Theme.body(.footnote))
        .foregroundStyle(completed ? Theme.textMuted : Theme.textSecondary)
      if completed {
        Image(systemName: "checkmark")
          .font(.caption2.weight(.semibold))
          .foregroundStyle(Theme.success)
          .accessibilityHidden(true)
      }
    }
  }

  /// A tool line is "completed" once it isn't the newest in-flight lookup: every line
  /// but the last while tools run, and all lines once the answer is being written.
  private func isCompleted(_ index: Int) -> Bool {
    if phase == .answering { return true }
    return index < activities.count - 1
  }

  private var activityTransition: AnyTransition {
    reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity)
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

  /// Maps a tool name to a representative SF Symbol for the activity ticker. Unknown
  /// tools fall back to the generic wrench; the label text always carries the meaning.
  private func iconName(for tool: String) -> String {
    switch tool {
    case "resolve_entity": return "magnifyingglass"
    case "get_pokemon": return "book"
    case "get_move": return "bolt"
    case "get_ability": return "sparkles"
    case "get_item": return "bag"
    case "type_matchup", "get_type_chart": return "shield.lefthalf.filled"
    case "compute_stat", "get_usage_stats": return "chart.bar"
    case "estimate_damage": return "function"
    case "get_learnset": return "list.bullet"
    case "get_team", "save_team": return "person.3"
    case "get_encounters": return "map"
    case "run_sql": return "cylinder.split.1x2"
    case "search_wiki": return "text.magnifyingglass"
    case let name where name.hasPrefix("list_"): return "list.bullet"
    default: return "wrench.and.screwdriver"
    }
  }
}

#if DEBUG
#Preview("Using tools") {
  StreamingStatusView(
    phase: .usingTools,
    activities: [
      .init(tool: "resolve_entity", label: "Resolving \"Garchomp\""),
      .init(tool: "get_pokemon", label: "Looking up Garchomp"),
    ]
  )
  .padding()
}

#Preview("Thinking") {
  StreamingStatusView(phase: .thinking, activities: [])
    .padding()
}
#endif
