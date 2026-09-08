import SwiftUI

/// Public live Champions usage tab (ADR-6 fifth tab). Doubles default;
/// Singles is the other view. Fail-soft when usage is down.
struct UsageView: View {
  @Environment(AppState.self) private var appState
  @Environment(\.services) private var services
  @State private var model: UsageViewModel
  @State private var path = NavigationPath()

  init(model: UsageViewModel) {
    _model = State(initialValue: model)
  }

  var body: some View {
    NavigationStack(path: $path) {
      listBody
        .navigationTitle("Usage")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .principal) {
            RegulationChip()
          }
          .oakLidItem()
        }
        .navigationDestination(for: String.self) { slug in
          UsageSpeciesView(model: model, slug: slug) { route in
            path.append(route)
          }
        }
        .navigationDestination(for: DexEntityRoute.self) { route in
          DexEntityDetailContainer(
            kind: route.kind,
            query: route.query,
            format: .champions,
            artifactService: services.artifact,
            onOpen: { kind, query in
              path.append(DexEntityRoute(kind: kind, query: query))
            }
          )
        }
    }
    .oakEnamelNav()
    .task { await model.start() }
    .onAppear { consumePendingDestination() }
    .onChange(of: appState.pendingDestination) { _, _ in
      consumePendingDestination()
    }
  }

  private func consumePendingDestination() {
    guard case let .usage(slug) = appState.pendingDestination else { return }
    if let slug {
      let trimmed = slug.trimmingCharacters(in: .whitespacesAndNewlines)
      if !trimmed.isEmpty { path.append(trimmed) }
    }
    appState.pendingDestination = nil
  }

  @ViewBuilder
  private var listBody: some View {
    VStack(spacing: 0) {
      Picker("Ladder", selection: ladderBinding) {
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
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.canvas)
      } else {
        List {
          if model.season != nil || model.fetchedAt != nil {
            UsageSnapshotHeader(season: model.season, fetchedAt: model.fetchedAt)
              .listRowSeparator(.hidden)
              .listRowBackground(Theme.canvas)
          }
          ForEach(model.rows) { row in
            Button {
              path.append(row.slug)
            } label: {
              UsageRow(row: row)
            }
            .buttonStyle(.plain)
            .listRowBackground(Theme.surface)
          }
          if let attribution = model.attribution, !attribution.isEmpty {
            UsageSourceFooter(attribution: attribution)
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
  }

  private var ladderBinding: Binding<UsageLadder> {
    Binding(
      get: { model.ladder },
      set: { next in
        Task { await model.selectLadder(next) }
      }
    )
  }
}

private struct UsageRow: View {
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

/// Species drill-in (CF-USAGE-AC-1.4).
private struct UsageSpeciesView: View {
  let model: UsageViewModel
  let slug: String
  var onOpenDex: (DexEntityRoute) -> Void

  var body: some View {
    Group {
      if let detail = model.speciesDetail {
        speciesBody(detail)
      } else {
        ProgressView()
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .background(Theme.canvas)
    .navigationTitle(model.speciesDetail?.savedName ?? slug)
    .navigationBarTitleDisplayMode(.inline)
    .task { await model.openSpecies(slug) }
  }

  @ViewBuilder
  private func speciesBody(_ detail: UsageSpeciesResponse) -> some View {
    if detail.available == false {
      ContentUnavailableView {
        Label("Usage unavailable", systemImage: "chart.bar.xaxis")
      } description: {
        Text(UsageViewModel.unavailableCopy)
      }
    } else if detail.found != true {
      ContentUnavailableView {
        Label("No usage set", systemImage: "questionmark.circle")
      } description: {
        Text("No Champions usage set is listed for this species. It may not be on the Champions roster.")
      }
    } else {
      List {
        Section {
          if let season = detail.season {
            LabeledContent("Season", value: season)
          }
          if let fetchedAt = detail.fetchedAt {
            LabeledContent("Updated", value: formatUsageFetchedAt(fetchedAt))
          }
          if let attribution = detail.attribution, !attribution.isEmpty {
            let parts = parseUsageAttribution(attribution)
            LabeledContent("Source", value: parts.source)
            if let legal = parts.legal {
              Text(legal)
                .font(Theme.body(.caption))
                .foregroundStyle(Theme.textMuted)
            }
          }
          if let route = UsageDexLink.speciesRoute(nameOrSlug: detail.savedName ?? slug) {
            Button {
              onOpenDex(route)
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
        }
        usageSection("Moves", kind: .moves, entries: detail.moves)
        usageSection("Items", kind: .items, entries: detail.items)
        usageSection("Abilities", kind: .abilities, entries: detail.abilities)
        usageSection("Natures", kind: .natures, entries: detail.natures)
        usageSection("Spreads", kind: .spreads, entries: detail.spreads)
        usageSection("Teammates", kind: .teammates, entries: detail.teammates)
        Section {
          ApplyChampionsSetButton(species: detail.slug ?? slug)
        }
      }
      .listStyle(.insetGrouped)
      .scrollContentBackground(.hidden)
    }
  }

  @ViewBuilder
  private func usageSection(_ title: String, kind: UsageListKind, entries: [UsageEntry]?) -> some View {
    if let entries, !entries.isEmpty {
      Section(title) {
        ForEach(Array(entries.enumerated()), id: \.offset) { _, entry in
          if let route = UsageDexLink.route(kind: kind, name: entry.name) {
            Button {
              onOpenDex(route)
            } label: {
              UsageShareRow(name: entry.name, pct: entry.pct, showsChevron: true)
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens \(entry.name) in Dex")
          } else {
            UsageShareRow(name: entry.name, pct: entry.pct, showsChevron: false)
          }
        }
      }
    }
  }

}

/// Compact LIVE · season + local fetched time. Lives inside the `List` so it
/// scrolls away (not a `Section` header — those pin on iOS).
private struct UsageSnapshotHeader: View {
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

/// Source domain + legal caption at the end of the ranked list.
private struct UsageSourceFooter: View {
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
