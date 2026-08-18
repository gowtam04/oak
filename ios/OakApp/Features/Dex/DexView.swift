import SwiftUI

/// The Dex tab root: browse Pokémon / Moves / Abilities / Items via
/// ``DexLookupService``, open full profiles via ``ArtifactService`` +
/// ``EntityDetailView``. Guests and signed-in users share the same public index.
struct DexView: View {
  @Environment(\.services) private var services
  @Environment(AppState.self) private var appState

  @State private var model: DexViewModel?
  @State private var path = NavigationPath()

  var body: some View {
    NavigationStack(path: $path) {
      Group {
        if let model {
          listBody(model: model)
        } else {
          ProgressView()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.canvas)
        }
      }
      .navigationTitle("Dex")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text("Dex")
            .font(Theme.display(.headline))
            .foregroundStyle(Theme.textStrong)
            .accessibilityAddTraits(.isHeader)
        }
        if let model {
          ToolbarItem(placement: .topBarTrailing) {
            scopeMenu(model: model)
          }
        }
      }
      .navigationDestination(for: DexEntityRoute.self) { route in
        DexEntityDetailContainer(
          kind: route.kind,
          query: route.query,
          format: model?.format ?? .nationalDex,
          artifactService: services.artifact,
          onOpen: { kind, query in
            path.append(DexEntityRoute(kind: kind, query: query))
          }
        )
      }
    }
    .task {
      ensureModel()
      consumePendingDestination()
    }
    .onAppear {
      ensureModel()
      consumePendingDestination()
    }
    .onChange(of: appState.pendingDestination) { _, _ in
      consumePendingDestination()
    }
  }

  /// TabView lazily creates this tab after RootView has already written
  /// `pendingDestination`, so `onChange` alone never fires on first hop.
  private func consumePendingDestination() {
    if case let .dexHop(artifactHop) = appState.pendingDestination {
      model?.applyArtifactHop(artifactHop)
      if let route = model?.pendingRoute {
        var next = NavigationPath()
        next.append(route)
        path = next
        _ = model?.consumePendingRoute()
      }
      appState.pendingDestination = nil
      return
    }
    guard let hop = PendingDexHop.consume(appState.pendingDestination) else { return }
    model?.query = hop.query
    if let route = hop.route {
      var next = NavigationPath()
      next.append(route)
      path = next
    }
    appState.pendingDestination = nil
  }

  private func ensureModel() {
    guard model == nil else { return }
    let initial = appState.lastUsedScope ?? .nationalDex
    let vm = DexViewModel(dexLookup: services.dexLookup, format: initial)
    model = vm
    vm.start()
  }

  @ViewBuilder
  private func listBody(model: DexViewModel) -> some View {
    VStack(spacing: 0) {
      sectionChips(model: model)
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, Theme.Spacing.sm)

      searchField(model: model)
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.bottom, Theme.Spacing.sm)

      List {
        if model.matches.isEmpty && !model.isLoading {
          ContentUnavailableView {
            Label(
              model.query.isEmpty ? "No entries" : "No matches",
              systemImage: "magnifyingglass"
            )
          } description: {
            Text(
              model.query.isEmpty
                ? "No entries in this scope."
                : "Try a different name or scope."
            )
          }
          .listRowBackground(Color.clear)
          .listRowSeparator(.hidden)
        } else {
          ForEach(model.matches) { match in
            Button {
              path.append(DexEntityRoute(kind: match.kind, query: match.slug))
            } label: {
              HStack {
                Text(match.displayName)
                  .font(Theme.body(.body))
                  .foregroundStyle(Theme.textPrimary)
                Spacer()
                Image(systemName: "chevron.right")
                  .font(.caption.weight(.semibold))
                  .foregroundStyle(Theme.textMuted)
              }
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .listRowBackground(Theme.surface)
            .accessibilityHint("Opens \(match.displayName)")
          }
        }
      }
      .listStyle(.plain)
      .scrollContentBackground(.hidden)
      .overlay {
        if model.isLoading && model.matches.isEmpty {
          ProgressView()
            .accessibilityLabel("Loading")
        }
      }
    }
    .background(Theme.canvas)
  }

  private func sectionChips(model: DexViewModel) -> some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: Theme.Spacing.xs) {
        ForEach(DexSection.allCases) { section in
          let selected = model.section == section
          Button {
            path = NavigationPath()
            model.selectSection(section)
          } label: {
            Text(section.title)
              .font(Theme.body(.subheadline, weight: .semibold))
              .padding(.horizontal, 12)
              .padding(.vertical, 8)
              .background(selected ? Theme.accentSoft : Theme.surfaceRaised, in: Capsule())
              .foregroundStyle(selected ? Theme.accent : Theme.textSecondary)
              .overlay(
                Capsule()
                  .strokeBorder(selected ? Theme.accent.opacity(0.35) : Theme.border, lineWidth: 1)
              )
          }
          .buttonStyle(OakPressableButtonStyle())
          .accessibilityAddTraits(selected ? .isSelected : [])
        }
      }
    }
  }

  private func searchField(model: DexViewModel) -> some View {
    HStack(spacing: Theme.Spacing.sm) {
      Image(systemName: "magnifyingglass")
        .foregroundStyle(Theme.textMuted)
      TextField("Search \(model.section.title.lowercased())…", text: Binding(
        get: { model.query },
        set: { model.query = $0 }
      ))
      .textInputAutocapitalization(.never)
      .autocorrectionDisabled()
      .font(Theme.body(.body))
      if !model.query.isEmpty {
        Button {
          model.query = ""
        } label: {
          Image(systemName: "xmark.circle.fill")
            .foregroundStyle(Theme.textMuted)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Clear search")
      }
    }
    .padding(.horizontal, Theme.Spacing.md)
    .padding(.vertical, Theme.Spacing.sm)
    .background(Theme.surfaceRaised, in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
        .strokeBorder(Theme.border, lineWidth: 1)
    )
  }

  private func scopeMenu(model: DexViewModel) -> some View {
    Menu {
      ForEach(Format.knownCases, id: \.self) { format in
        Button {
          path = NavigationPath()
          model.selectFormat(format)
        } label: {
          if format == model.format {
            Label(format.displayLabel, systemImage: "checkmark")
          } else {
            Text(format.displayLabel)
          }
        }
      }
    } label: {
      HStack(spacing: 4) {
        Text(model.format.shortLabel)
          .font(Theme.body(.caption, weight: .semibold))
        Image(systemName: "chevron.down")
          .font(.caption2.weight(.semibold))
      }
      .foregroundStyle(Theme.accent)
      .padding(.horizontal, 10)
      .padding(.vertical, 6)
      .background(Theme.accentSoft, in: Capsule())
    }
    .accessibilityLabel("Scope")
    .accessibilityValue(model.format.displayLabel)
  }
}

#if DEBUG
#Preview {
  DexView()
    .environment(AppState())
    .oakServices(.preview())
}
#endif
