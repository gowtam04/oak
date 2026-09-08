import SwiftUI

/// Full species usage drill-in for a Pokémon artifact (Summary's sibling tab).
/// Same lists as the Usage tab: ladder, snapshot, six share rows, Apply.
struct PokemonUsagePane: View {
  let slug: String
  var onOpen: (EntityKind, String) -> Void

  @Environment(\.services) private var services
  @State private var model: PokemonUsageModel?

  var body: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
      Picker("Ladder", selection: ladderBinding) {
        ForEach(UsageLadder.allCases, id: \.self) { ladder in
          Text(ladder.title).tag(ladder)
        }
      }
      .pickerStyle(.segmented)
      .accessibilityLabel("Usage ladder")

      if let model {
        if model.isLoading && model.detail == nil {
          ProgressView()
            .frame(maxWidth: .infinity)
            .accessibilityLabel("Loading")
        } else {
          UsageSpeciesStack(
            detail: model.detail ?? .unavailable,
            slug: slug,
            onOpen: onOpen
          )
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .task(id: slug) {
      let next = PokemonUsageModel(slug: slug, usage: services.usage)
      model = next
      await next.load()
    }
  }

  private var ladderBinding: Binding<UsageLadder> {
    Binding(
      get: { model?.ladder ?? .doubles },
      set: { next in
        Task { await model?.selectLadder(next) }
      }
    )
  }
}

/// Snapshot + share lists + Apply, laid out for a parent `ScrollView`
/// (the artifact sheet already scrolls — do not nest a `List`).
struct UsageSpeciesStack: View {
  let detail: UsageSpeciesResponse
  let slug: String
  var onOpen: (EntityKind, String) -> Void

  var body: some View {
    if detail.available == false {
      VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
        Text("Usage unavailable")
          .font(Theme.display(.title3))
          .foregroundStyle(Theme.textPrimary)
        Text(UsageViewModel.unavailableCopy)
          .font(Theme.body(.footnote))
          .foregroundStyle(Theme.textSecondary)
      }
    } else if detail.found != true {
      VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
        Text("No usage set")
          .font(Theme.display(.title3))
          .foregroundStyle(Theme.textPrimary)
        Text("No Champions usage set is listed for this species. It may not be on the Champions roster.")
          .font(Theme.body(.footnote))
          .foregroundStyle(Theme.textSecondary)
      }
    } else {
      foundBody
    }
  }

  @ViewBuilder
  private var foundBody: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
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
    }

    usageGroup("Moves", kind: .moves, entries: detail.moves)
    usageGroup("Items", kind: .items, entries: detail.items)
    usageGroup("Abilities", kind: .abilities, entries: detail.abilities)
    usageGroup("Natures", kind: .natures, entries: detail.natures)
    usageGroup("Spreads", kind: .spreads, entries: detail.spreads)
    usageGroup("Teammates", kind: .teammates, entries: detail.teammates)

    ApplyChampionsSetButton(species: detail.slug ?? slug)
  }

  @ViewBuilder
  private func usageGroup(_ title: String, kind: UsageListKind, entries: [UsageEntry]?) -> some View {
    if let entries, !entries.isEmpty {
      VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
        Text(title)
          .instrumentLabel()
          .foregroundStyle(Theme.textMuted)
        ForEach(Array(entries.enumerated()), id: \.offset) { _, entry in
          if let route = UsageDexLink.route(kind: kind, name: entry.name) {
            Button {
              onOpen(route.kind, route.query)
            } label: {
              UsageShareRow(name: entry.name, pct: entry.pct, showsChevron: true)
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens \(entry.name)")
          } else {
            UsageShareRow(name: entry.name, pct: entry.pct, showsChevron: false)
          }
        }
      }
    }
  }
}

struct UsageShareRow: View {
  let name: String
  let pct: Double?
  var showsChevron: Bool

  var body: some View {
    HStack {
      Text(name)
        .foregroundStyle(Theme.textPrimary)
      Spacer()
      if let pct {
        Text(String(format: "%.1f%%", pct))
          .font(Theme.mono(.footnote))
          .foregroundStyle(Theme.textSecondary)
      }
      if showsChevron {
        Image(systemName: "chevron.right")
          .font(.caption.weight(.semibold))
          .foregroundStyle(Theme.textMuted)
      }
    }
    .contentShape(Rectangle())
  }
}
