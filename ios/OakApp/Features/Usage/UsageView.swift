import SwiftUI

/// Public live Champions usage tab (ADR-6 fifth tab). Doubles default;
/// Singles is the other view. Fail-soft when usage is down.
struct UsageView: View {
  @Environment(AppState.self) private var appState
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
          UsageSpeciesView(model: model, slug: slug)
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

      if let asOf = asOfLabel {
        Text(asOf)
          .font(Theme.body(.caption))
          .foregroundStyle(Theme.textSecondary)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, Theme.Spacing.md)
          .padding(.bottom, Theme.Spacing.sm)
      }

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
          ForEach(model.rows) { row in
            Button {
              path.append(row.slug)
            } label: {
              UsageRow(row: row)
            }
            .buttonStyle(.plain)
            .listRowBackground(Theme.surface)
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

  private var asOfLabel: String? {
    guard model.available else { return nil }
    var parts: [String] = ["Live \(model.ladder.title)"]
    if let season = model.season { parts.append(season) }
    if let fetchedAt = model.fetchedAt {
      parts.append("fetched \(formatUsageFetchedAt(fetchedAt))")
    }
    if let attribution = model.attribution { parts.append(attribution) }
    return parts.joined(separator: " · ")
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
            LabeledContent("Fetched", value: formatUsageFetchedAt(fetchedAt))
          }
          if let attribution = detail.attribution {
            Text(attribution)
              .font(Theme.body(.caption))
              .foregroundStyle(Theme.textSecondary)
          }
        }
        usageSection("Moves", entries: detail.moves)
        usageSection("Items", entries: detail.items)
        usageSection("Abilities", entries: detail.abilities)
        usageSection("Natures", entries: detail.natures)
        usageSection("Spreads", entries: detail.spreads)
        usageSection("Teammates", entries: detail.teammates)
        Section {
          ApplyChampionsSetButton(species: detail.slug ?? slug)
        }
      }
      .listStyle(.insetGrouped)
      .scrollContentBackground(.hidden)
    }
  }

  @ViewBuilder
  private func usageSection(_ title: String, entries: [UsageEntry]?) -> some View {
    if let entries, !entries.isEmpty {
      Section(title) {
        ForEach(Array(entries.enumerated()), id: \.offset) { _, entry in
          HStack {
            Text(entry.name)
            Spacer()
            if let pct = entry.pct {
              Text(String(format: "%.1f%%", pct))
                .font(Theme.mono(.footnote))
                .foregroundStyle(Theme.textSecondary)
            }
          }
        }
      }
    }
  }

}

func formatUsageFetchedAt(_ ms: Int64) -> String {
  let date = Date(timeIntervalSince1970: TimeInterval(ms) / 1000)
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime]
  return formatter.string(from: date).replacingOccurrences(of: "T", with: " ")
}
