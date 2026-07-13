import SwiftUI

/// The team editor's **Analysis** section (#9) — a passive, advisory read of the current draft's
/// type coverage, sitting below the per-slot sets and the legality warnings. It renders the
/// ``TeamEditorViewModel``'s debounced ``TeamEditorViewModel/analysis`` result: a defensive type
/// matrix (weak / resists / immune, with per-type counts), offensive coverage (covered vs. not
/// covered), a speed-tier ordering, and the v1 type-only caveat.
///
/// It NEVER blocks editing and owns no state — it reads the view model and shows the right state:
/// an empty hint (nothing filled in), a loading spinner (first fetch), an error + Retry (with the
/// last good coverage retained beneath), the full readout (`ok`), or an honest "not available"
/// line (`unavailable`). Chips reuse the shared ``TypeBadge`` so color is never the sole carrier
/// of meaning (M-AC-UI9.3).
struct TeamAnalysisSection: View {
  let model: TeamEditorViewModel

  var body: some View {
    Section("Analysis") {
      content
    }
  }

  @ViewBuilder
  private var content: some View {
    if model.analysis == nil, model.analysisError == nil, !model.isAnalyzing {
      Text("Add a Pokémon to see team coverage.")
        .font(Theme.body(.footnote))
        .foregroundStyle(Theme.textSecondary)
    } else {
      VStack(alignment: .leading, spacing: 16) {
        if let error = model.analysisError {
          errorRow(error)
        } else if model.isAnalyzing, model.analysis == nil {
          loadingRow
        }
        switch model.analysis {
        case .ok(let ok):
          okBody(ok)
        case .unavailable:
          Text("Coverage analysis isn't available for this format yet.")
            .font(Theme.body(.footnote))
            .foregroundStyle(Theme.textSecondary)
        case nil:
          EmptyView()
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  // MARK: States

  private var loadingRow: some View {
    HStack(spacing: 8) {
      ProgressView()
      Text("Analyzing coverage…")
        .font(Theme.body(.footnote))
        .foregroundStyle(Theme.textSecondary)
    }
  }

  private func errorRow(_ message: String) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      Label(message, systemImage: "exclamationmark.triangle.fill")
        .font(Theme.body(.footnote))
        .foregroundStyle(Theme.textPrimary)
        .fixedSize(horizontal: false, vertical: true)
      Spacer(minLength: 8)
      Button("Retry") { model.retryAnalysis() }
        .font(Theme.body(.footnote, weight: .semibold))
    }
  }

  // MARK: ok body (defense / offense / speed / notes)

  @ViewBuilder
  private func okBody(_ ok: TeamAnalysisOk) -> some View {
    let names = memberNames(ok)

    // Roles & tools
    if !ok.rolesPresent.isEmpty || !ok.rolesMissing.isEmpty {
      VStack(alignment: .leading, spacing: 6) {
        sectionLabel("Roles & tools")
        if !ok.rolesPresent.isEmpty {
          Text("Present: " + ok.rolesPresent.map { $0.replacingOccurrences(of: "_", with: " ") }.joined(separator: ", "))
            .font(Theme.body(.caption))
            .foregroundStyle(Theme.textPrimary)
        }
        if !ok.rolesMissing.isEmpty {
          Text("Gaps: " + ok.rolesMissing.map { $0.replacingOccurrences(of: "_", with: " ") }.joined(separator: ", "))
            .font(Theme.body(.caption))
            .foregroundStyle(Theme.danger)
        }
        Text("Moves: \(ok.physicalSpecial.physicalMoves) phys · \(ok.physicalSpecial.specialMoves) spec · \(ok.physicalSpecial.statusMoves) status")
          .font(Theme.body(.caption2))
          .foregroundStyle(Theme.textSecondary)
      }
    }

    // Defense — weak / resists / immune flows, each type with its member count (desc).
    defenseFlow("Weak", rows: ok.defense.map { ($0.type, $0.weak.count) }, tint: Theme.danger)
    defenseFlow("Resists", rows: ok.defense.map { ($0.type, $0.resists.count) }, tint: Theme.success)
    defenseFlow("Immune", rows: ok.defense.map { ($0.type, $0.immune.count) }, tint: Theme.azure)

    // Offense — covered vs. not covered.
    if !ok.offense.covered.isEmpty {
      labeledFlow("Covered") {
        ForEach(Array(ok.offense.covered.enumerated()), id: \.offset) { _, coverage in
          TypeBadge(type: coverage.type)
        }
      }
    }
    if !ok.offense.uncovered.isEmpty {
      labeledFlow("Not covered") {
        ForEach(Array(ok.offense.uncovered.enumerated()), id: \.offset) { _, type in
          uncoveredChip(type)
        }
      }
    }

    // Speed order — resolved members by computed Speed (desc).
    if !ok.speedTiers.isEmpty {
      VStack(alignment: .leading, spacing: 4) {
        sectionLabel("Speed order")
        ForEach(Array(ok.speedTiers.sorted { $0.speed > $1.speed }.enumerated()), id: \.offset) { _, tier in
          HStack {
            Text(names[tier.member] ?? TeamBlocksView.titleizeNonNil(tier.member))
              .font(Theme.body(.footnote))
              .foregroundStyle(Theme.textPrimary)
            Spacer(minLength: 8)
            Text("\(tier.speed) Spe")
              .font(Theme.mono(.footnote))
              .monospacedDigit()
              .foregroundStyle(Theme.textSecondary)
          }
        }
      }
    }

    // Meta threats
    if !ok.threats.isEmpty {
      VStack(alignment: .leading, spacing: 6) {
        sectionLabel("Meta threats")
        if let attr = ok.metaAttribution {
          Text(attr)
            .font(Theme.body(.caption2))
            .foregroundStyle(Theme.textSecondary)
        }
        ForEach(Array(ok.threats.prefix(12).enumerated()), id: \.offset) { _, threat in
          VStack(alignment: .leading, spacing: 2) {
            HStack {
              Text(threat.displayName)
                .font(Theme.body(.footnote, weight: .semibold))
              Spacer()
              Text(threat.status.uppercased())
                .font(Theme.body(.caption2, weight: .bold))
                .foregroundStyle(threatStatusColor(threat.status))
            }
            Text(threat.reasons.joined(separator: "; "))
              .font(Theme.body(.caption2))
              .foregroundStyle(Theme.textSecondary)
          }
        }
      }
    }

    // Residual caveats.
    ForEach(Array(ok.notes.enumerated()), id: \.offset) { _, note in
      Text(note)
        .font(Theme.body(.caption))
        .foregroundStyle(Theme.textMuted)
        .fixedSize(horizontal: false, vertical: true)
    }
  }

  /// One defensive row (Weak / Resists / Immune): a labeled flow of type chips carrying each
  /// type's member count, sorted by count descending; omitted entirely when no type qualifies.
  @ViewBuilder
  private func defenseFlow(_ label: String, rows: [(type: String, count: Int)], tint: Color) -> some View {
    let hits = rows.filter { $0.count > 0 }.sorted { $0.count > $1.count }
    if !hits.isEmpty {
      labeledFlow(label) {
        ForEach(Array(hits.enumerated()), id: \.offset) { _, row in
          HStack(spacing: 4) {
            TypeBadge(type: row.type)
            Text("×\(row.count)")
              .font(Theme.body(.caption2, weight: .bold))
              .foregroundStyle(tint)
          }
        }
      }
    }
  }

  private func uncoveredChip(_ type: String) -> some View {
    HStack(spacing: 4) {
      TypeBadge(type: type)
    }
    .padding(.horizontal, 2)
    .overlay(
      RoundedRectangle(cornerRadius: Theme.Radius.pill, style: .continuous)
        .strokeBorder(Theme.warning.opacity(0.55), lineWidth: 1)
    )
  }

  // MARK: Building blocks

  private func sectionLabel(_ title: String) -> some View {
    Text(title)
      .font(Theme.body(.caption, weight: .semibold))
      .foregroundStyle(Theme.textSecondary)
  }

  private func threatStatusColor(_ status: String) -> Color {
    switch status {
    case "answered": return Theme.success
    case "unanswered": return Theme.danger
    default: return Theme.warning
    }
  }

  private func labeledFlow<Content: View>(_ label: String, @ViewBuilder _ content: () -> Content) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      sectionLabel(label)
      flow { content() }
    }
  }

  /// A wrapping chip container (adaptive grid — no third-party flow layout, ADR-5), matching the
  /// matchup/movepool chip flows elsewhere.
  private func flow<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
    LazyVGrid(
      columns: [GridItem(.adaptive(minimum: 72), spacing: 6, alignment: .leading)],
      alignment: .leading,
      spacing: 6
    ) {
      content()
    }
  }

  /// Slug → display name for the resolved members, so speed tiers read as names not slugs.
  private func memberNames(_ ok: TeamAnalysisOk) -> [String: String] {
    var map: [String: String] = [:]
    for member in ok.members {
      if case let .found(detail) = member {
        map[detail.slug] = detail.displayName
      }
    }
    return map
  }
}
