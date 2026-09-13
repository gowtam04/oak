import CoreGraphics
import SwiftUI

/// Pure Usage-split policy (P-USE-US-1, P-DEX-AC-2.3, ADR-6).
enum PadUsageChrome {
  /// Usage stays a sidebar destination, not a Dex section (P-DEX-AC-2.3, P-USE-US-1).
  static func isFirstClassDestination() -> Bool { true }

  /// Wide landscape keeps the ladder; portrait/compact collapse it.
  static func showsLadderColumn(mode: PadLayoutMode, isPortrait: Bool) -> Bool {
    mode == .regular && !isPortrait
  }

  /// Portrait/compact: species is the primary pane when a slug is selected.
  static func speciesIsPrimary(
    hasSpecies: Bool,
    mode: PadLayoutMode,
    isPortrait: Bool
  ) -> Bool {
    hasSpecies && !showsLadderColumn(mode: mode, isPortrait: isPortrait)
  }

  /// PadRootView overlay controls are 44pt + `Theme.Spacing.sm`.
  static let overlayControlInset: CGFloat = 56

  static func titleize(_ slug: String) -> String {
    slug
      .split(whereSeparator: { $0 == "-" || $0 == " " || $0 == "_" })
      .map { $0.prefix(1).uppercased() + $0.dropFirst() }
      .joined(separator: " ")
  }
}

/// iPad Usage destination: ladder | species (P-USE-US-1).
/// Same ``UsageViewModel`` / ``UsageService`` payload as a Pokémon Dex profile.
struct PadUsageSplit: View {
  var shell: PadShellModel
  var layoutMode: PadLayoutMode

  @Environment(\.services) private var services
  @Environment(AppState.self) private var appState
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  @State private var model: UsageViewModel?
  @State private var isPortrait = false

  private var isSignedIn: Bool {
    if case .signedIn = appState.authState { return true }
    return false
  }

  var body: some View {
    let _ = shell.destination
    let _ = shell.companionOpen
    applyLifecycle(to: root)
  }

  @ViewBuilder
  private var root: some View {
    GeometryReader { geo in
      let portrait = geo.size.height > geo.size.width
      let showLadder = PadUsageChrome.showsLadderColumn(
        mode: layoutMode, isPortrait: portrait)
      let speciesPrimary = PadUsageChrome.speciesIsPrimary(
        hasSpecies: selectedSlug != nil,
        mode: layoutMode,
        isPortrait: portrait
      )
      Group {
        if showLadder {
          HStack(spacing: 0) {
            ladderColumn
              .frame(width: PadLayout.chatListMinWidth)
              .frame(maxHeight: .infinity)
            columnSeparator
            speciesPane(showsBackToLadder: false)
              .frame(maxWidth: .infinity, maxHeight: .infinity)
          }
        } else if speciesPrimary {
          speciesPane(showsBackToLadder: true)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
          ladderColumn
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      }
      .onAppear { isPortrait = portrait }
      .onChange(of: geo.size) { _, size in
        isPortrait = size.height > size.width
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.canvas)
    .animation(reduceMotion ? nil : Theme.Motion.snappy, value: selectedSlug)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("pad-usage-split")
  }

  private func applyLifecycle<Content: View>(to view: Content) -> some View {
    view
      .task {
        ensureModel()
        await consumePendingDestination()
        await openSelectedSpecies()
        await model?.start()
        syncUsageChip()
      }
      .onAppear {
        ensureModel()
        Task {
          await consumePendingDestination()
          await openSelectedSpecies()
          syncUsageChip()
        }
      }
      .onChange(of: appState.pendingDestination) { _, _ in
        Task { await consumePendingDestination() }
      }
      .onChange(of: selectedSlug) { _, _ in
        Task {
          await openSelectedSpecies()
          syncUsageChip()
        }
      }
      .onChange(of: shell.companionOpen) { _, open in
        if open { syncUsageChip() }
      }
  }

  // MARK: Destination

  private var selectedSlug: String? {
    if case .usage(let slug) = shell.destination {
      let trimmed = slug?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      return trimmed.isEmpty ? nil : trimmed
    }
    return nil
  }

  // MARK: Ladder

  @ViewBuilder
  private var ladderColumn: some View {
    if let model {
      ladderContent(model)
    } else {
      ProgressView()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.canvas)
    }
  }

  private func ladderContent(_ model: UsageViewModel) -> some View {
    VStack(spacing: 0) {
      HStack(spacing: Theme.Spacing.sm) {
        Text("Usage")
          .font(Theme.display(.headline))
          .foregroundStyle(Theme.textStrong)
          .accessibilityAddTraits(.isHeader)
        Spacer(minLength: 0)
        RegulationChip()
      }
      .padding(.leading, ladderHeaderLeadingInset)
      .padding(.trailing, PadUsageChrome.overlayControlInset)
      .padding(.top, Theme.Spacing.md)
      .padding(.bottom, Theme.Spacing.xs)

      Picker("Ladder", selection: ladderBinding(model)) {
        ForEach(UsageLadder.allCases, id: \.self) { ladder in
          Text(ladder.title).tag(ladder)
        }
      }
      .pickerStyle(.segmented)
      .padding(.horizontal, Theme.Spacing.md)
      .padding(.vertical, Theme.Spacing.sm)
      .accessibilityLabel("Ladder")

      if model.isUnavailable {
        ContentUnavailableView {
          Label("Usage unavailable", systemImage: "chart.bar.xaxis")
        } description: {
          Text(model.unavailableMessage ?? UsageViewModel.unavailableCopy)
        } actions: {
          Button("Try again") {
            Task { await retry(model) }
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.canvas)
      } else {
        List {
          if model.season != nil || model.fetchedAt != nil {
            PadUsageSnapshotHeader(season: model.season, fetchedAt: model.fetchedAt)
              .listRowSeparator(.hidden)
              .listRowBackground(Theme.canvas)
          }
          ForEach(model.rows) { row in
            Button {
              selectSpecies(row)
            } label: {
              PadUsageLadderRow(row: row)
            }
            .buttonStyle(.plain)
            .listRowBackground(isSelected(row) ? Theme.accentSoft : Theme.surface)
            .accessibilityAddTraits(isSelected(row) ? .isSelected : [])
          }
          if let attribution = model.attribution, !attribution.isEmpty {
            PadUsageSourceFooter(attribution: attribution)
              .listRowSeparator(.hidden)
              .listRowBackground(Theme.canvas)
          }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .overlay {
          if model.isLoading && model.rows.isEmpty {
            ProgressView()
              .accessibilityLabel("Loading")
          }
        }
      }
    }
    .background(Theme.canvas)
    .overlay(alignment: .bottom) {
      if let message = model.errorMessage {
        ErrorBanner(message: message, onDismiss: { model.dismissError() })
          .padding(.horizontal, Theme.Spacing.lg)
          .padding(.bottom, Theme.Spacing.sm)
      }
    }
    .accessibilityIdentifier("pad-usage-ladder")
  }

  private var ladderHeaderLeadingInset: CGFloat {
    layoutMode == .compact ? PadUsageChrome.overlayControlInset : Theme.Spacing.lg
  }

  private func ladderBinding(_ model: UsageViewModel) -> Binding<UsageLadder> {
    Binding(
      get: { model.ladder },
      set: { next in
        Task {
          await model.selectLadder(next)
          if let slug = selectedSlug {
            await model.openSpecies(slug)
          }
          syncUsageChip()
        }
      }
    )
  }

  // MARK: Species

  private func speciesPane(showsBackToLadder: Bool) -> some View {
    VStack(spacing: 0) {
      speciesHeader(showsBackToLadder: showsBackToLadder)
      if let slug = selectedSlug, let model {
        speciesBody(model: model, slug: slug)
      } else {
        ContentUnavailableView {
          Label("Usage", systemImage: "chart.bar.xaxis")
        } description: {
          Text("Select a species from the ladder.")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.canvas)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.canvas)
    .accessibilityIdentifier("pad-usage-species")
  }

  private func speciesHeader(showsBackToLadder: Bool) -> some View {
    HStack(spacing: Theme.Spacing.sm) {
      if showsBackToLadder {
        Button {
          shell.select(.usage())
        } label: {
          Image(systemName: "chevron.left")
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(Theme.accent)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Ladder")
      }
      Text(speciesTitle)
        .font(Theme.display(.headline))
        .foregroundStyle(Theme.textPrimary)
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityAddTraits(.isHeader)
      if showsBackToLadder || !PadUsageChrome.showsLadderColumn(
        mode: layoutMode, isPortrait: isPortrait)
      {
        RegulationChip()
      }
    }
    .padding(.leading, headerLeadingInset)
    .padding(.trailing, headerTrailingInset)
    .padding(.top, Theme.Spacing.sm)
    .padding(.bottom, Theme.Spacing.xs)
  }

  @ViewBuilder
  private func speciesBody(model: UsageViewModel, slug: String) -> some View {
    if let detail = model.speciesDetail {
      ScrollView {
        VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
          if detail.available != false, detail.found == true,
            let route = UsageDexLink.speciesRoute(nameOrSlug: detail.savedName ?? slug)
          {
            Button {
              hopToDex(route)
            } label: {
              HStack {
                Text("View in Dex")
                  .foregroundStyle(Theme.accent)
                Spacer()
                Image(systemName: "chevron.right")
                  .font(.caption.weight(.semibold))
                  .foregroundStyle(Theme.textMuted)
              }
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens \(route.query) in Dex")
          }
          UsageSpeciesStack(
            detail: detail,
            slug: slug,
            onOpen: { kind, query in
              hopToDex(DexEntityRoute(kind: kind, query: query))
            }
          )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.lg)
      }
      .background(Theme.canvas)
    } else {
      ProgressView()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityLabel("Loading")
    }
  }

  private var speciesTitle: String {
    if let name = model?.speciesDetail?.savedName, !name.isEmpty { return name }
    if let slug = selectedSlug { return PadUsageChrome.titleize(slug) }
    return "Usage"
  }

  private var headerLeadingInset: CGFloat {
    layoutMode == .compact ? PadUsageChrome.overlayControlInset : Theme.Spacing.md
  }

  private var headerTrailingInset: CGFloat {
    PadUsageChrome.overlayControlInset
  }

  private var columnSeparator: some View {
    Rectangle()
      .fill(Theme.separator)
      .frame(width: 1)
  }

  // MARK: Selection / hops / chip

  private func ensureModel() {
    guard model == nil else { return }
    model = UsageViewModel(usage: services.usage, isSignedIn: isSignedIn)
  }

  private func selectSpecies(_ row: UsageLeaderboardRow) {
    shell.select(.usage(slug: row.slug))
  }

  private func isSelected(_ row: UsageLeaderboardRow) -> Bool {
    guard let slug = selectedSlug else { return false }
    return row.slug.compare(slug, options: [.caseInsensitive, .diacriticInsensitive])
      == .orderedSame
  }

  private func hopToDex(_ route: DexEntityRoute) {
    shell.select(.dex(route))
  }

  private func consumePendingDestination() async {
    guard case let .usage(slug) = appState.pendingDestination else { return }
    let trimmed = slug?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if trimmed.isEmpty {
      shell.select(.usage())
    } else {
      shell.select(.usage(slug: trimmed))
      await model?.openSpecies(trimmed)
    }
    appState.pendingDestination = nil
  }

  private func openSelectedSpecies() async {
    guard let slug = selectedSlug else { return }
    if model?.speciesDetail?.slug == slug { return }
    await model?.openSpecies(slug)
  }

  private func retry(_ model: UsageViewModel) async {
    await model.start()
    if let slug = selectedSlug {
      await model.openSpecies(slug)
    }
  }

  private func syncUsageChip() {
    guard case .usage = shell.destination, shell.companionOpen else { return }
    guard let slug = selectedSlug else {
      shell.setContextChip(nil)
      return
    }
    shell.setContextChip(.usageSpecies(slug: slug, name: speciesChipName(slug)))
  }

  private func speciesChipName(_ slug: String) -> String {
    if let name = model?.speciesDetail?.savedName, !name.isEmpty { return name }
    if let row = model?.rows.first(where: {
      $0.slug.compare(slug, options: [.caseInsensitive, .diacriticInsensitive]) == .orderedSame
    }) {
      return row.name
    }
    return PadUsageChrome.titleize(slug)
  }
}

// MARK: - Ladder rows (iPhone UsageView copies; not shared to avoid iPhone edits)

private struct PadUsageLadderRow: View {
  let row: UsageLeaderboardRow

  var body: some View {
    HStack(spacing: Theme.Spacing.sm) {
      Text("\(row.rank)")
        .font(Theme.mono(.subheadline))
        .foregroundStyle(Theme.textMuted)
        .frame(width: 28, alignment: .trailing)
      SpriteImage(urlString: row.sprite, name: row.name, size: 32, animated: false, decorative: true)
      Text(row.name)
        .font(Theme.body(.body))
        .foregroundStyle(Theme.textPrimary)
      Spacer()
      if let pct = row.usagePct {
        Text(String(format: "%.1f%%", pct))
          .font(Theme.mono(.footnote))
          .foregroundStyle(Theme.textSecondary)
      }
    }
    .contentShape(Rectangle())
    .accessibilityElement(children: .combine)
    .accessibilityLabel(accessibilityLabel)
  }

  private var accessibilityLabel: String {
    if let pct = row.usagePct {
      return "Rank \(row.rank), \(row.name), \(String(format: "%.1f", pct)) percent"
    }
    return "Rank \(row.rank), \(row.name)"
  }
}

private struct PadUsageSnapshotHeader: View {
  let season: String?
  let fetchedAt: Int64?

  var body: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
      Text(liveLine)
        .instrumentLabel()
        .foregroundStyle(Theme.textMuted)
      if let fetchedAt {
        Text(formatUsageFetchedAt(fetchedAt))
          .font(Theme.body(.caption))
          .foregroundStyle(Theme.textSecondary)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.vertical, Theme.Spacing.xs)
    .accessibilityElement(children: .combine)
    .accessibilityLabel(accessibilityLabel)
  }

  private var liveLine: String {
    ["Live", season].compactMap { $0 }.joined(separator: " · ")
  }

  private var accessibilityLabel: String {
    var parts = ["Live Champions usage"]
    if let season { parts.append(season) }
    if let fetchedAt { parts.append("updated \(formatUsageFetchedAt(fetchedAt))") }
    return parts.joined(separator: ", ")
  }
}

private struct PadUsageSourceFooter: View {
  let attribution: String

  var body: some View {
    let parts = parseUsageAttribution(attribution)
    VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
      Text("Source")
        .instrumentLabel()
        .foregroundStyle(Theme.textMuted)
      Text(parts.source)
        .font(Theme.body(.footnote))
        .foregroundStyle(Theme.textSecondary)
      if let legal = parts.legal {
        Text(legal)
          .font(Theme.body(.caption))
          .foregroundStyle(Theme.textMuted)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.vertical, Theme.Spacing.sm)
    .accessibilityElement(children: .combine)
    .accessibilityLabel(spokenLabel(parts))
  }

  private func spokenLabel(_ parts: UsageAttributionParts) -> String {
    var chunks = ["Source", parts.source]
    if let legal = parts.legal { chunks.append(legal) }
    return chunks.joined(separator: ", ")
  }
}
