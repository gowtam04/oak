import CoreGraphics
import SwiftUI

/// Pure Dex-split policy (P-DEX-US-1–2, P-DEX-AC-2.1–2.2).
enum PadDexChrome {
  /// Pokémon profiles include a Usage section (P-DEX-AC-2.1, P-WF-AC-4.1).
  static func showsUsageSectionOnPokemonProfile() -> Bool { true }

  /// Usage-down fail-softs; Dex fields stay (P-DEX-AC-2.2).
  static func hidesDexFieldsWhenUsageUnavailable() -> Bool { false }

  /// Wide landscape keeps the index; portrait/compact collapse it to overlay.
  static func showsIndexColumn(mode: PadLayoutMode, isPortrait: Bool) -> Bool {
    mode == .regular && !isPortrait
  }

  /// PadRootView overlay controls are 44pt + `Theme.Spacing.sm`.
  static let overlayControlInset: CGFloat = 56
}

/// iPad Dex destination: sections + search | profile (P-DEX-US-1).
/// Pokémon profiles reuse ``EntityDetailView``'s Usage section (same live
/// payload as the Usage destination) and fail-soft without hiding Dex fields.
struct PadDexSplit: View {
  var shell: PadShellModel
  var layoutMode: PadLayoutMode

  @Environment(\.services) private var services
  @Environment(AppState.self) private var appState
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  @State private var model: DexViewModel?
  @State private var indexOverlayPresented = false
  @State private var isPortrait = false

  var body: some View {
    let _ = shell.destination
    let _ = shell.companionOpen
    let _ = shell.sidebarCollapsed
    applyLifecycle(to: root)
  }

  @ViewBuilder
  private var root: some View {
    GeometryReader { geo in
      let portrait = geo.size.height > geo.size.width
      let showIndex = PadDexChrome.showsIndexColumn(mode: layoutMode, isPortrait: portrait)
      ZStack(alignment: .leading) {
        HStack(spacing: 0) {
          if showIndex {
            indexColumn
              .frame(width: PadLayout.chatListMinWidth)
              .frame(maxHeight: .infinity)
            columnSeparator
          }
          profilePane(showsIndexButton: !showIndex)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }

        if !showIndex, indexOverlayPresented {
          indexOverlay
        }
      }
      .onAppear {
        isPortrait = portrait
        if showIndex { indexOverlayPresented = false }
      }
      .onChange(of: geo.size) { _, size in
        let nextPortrait = size.height > size.width
        isPortrait = nextPortrait
        if PadDexChrome.showsIndexColumn(mode: layoutMode, isPortrait: nextPortrait) {
          indexOverlayPresented = false
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.canvas)
    .animation(reduceMotion ? nil : Theme.Motion.snappy, value: indexOverlayPresented)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("pad-dex-split")
  }

  private func applyLifecycle<Content: View>(to view: Content) -> some View {
    view
      .task {
        ensureModel()
        consumePendingDestination()
        syncSectionToRoute()
        syncProfileChip()
      }
      .onAppear {
        ensureModel()
        consumePendingDestination()
        syncSectionToRoute()
        syncProfileChip()
      }
      .onChange(of: appState.pendingDestination) { _, _ in
        consumePendingDestination()
      }
      .onChange(of: selectedRoute) { _, _ in
        indexOverlayPresented = false
        syncSectionToRoute()
        syncProfileChip()
      }
      .onChange(of: shell.companionOpen) { _, open in
        if open { syncProfileChip() }
      }
      .onChange(of: layoutMode) { _, newMode in
        if PadDexChrome.showsIndexColumn(mode: newMode, isPortrait: isPortrait) {
          indexOverlayPresented = false
        }
      }
  }

  // MARK: Destination

  private var selectedRoute: DexEntityRoute? {
    if case .dex(let route) = shell.destination { return route }
    return nil
  }

  // MARK: Index

  @ViewBuilder
  private var indexColumn: some View {
    if let model {
      indexContent(model)
    } else {
      ProgressView()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.canvas)
    }
  }

  private func indexContent(_ model: DexViewModel) -> some View {
    VStack(spacing: 0) {
      HStack(spacing: Theme.Spacing.sm) {
        Text("Dex")
          .font(Theme.display(.headline))
          .foregroundStyle(Theme.textStrong)
          .accessibilityAddTraits(.isHeader)
        Spacer(minLength: 0)
        RegulationChip()
      }
      .padding(.leading, indexHeaderLeadingInset)
      .padding(.trailing, Theme.Spacing.sm)
      .padding(.top, Theme.Spacing.md)
      .padding(.bottom, Theme.Spacing.xs)

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
            Text("Nothing on the Champions roster matched.")
          }
          .listRowBackground(Color.clear)
          .listRowSeparator(.hidden)
        } else {
          ForEach(model.matches) { match in
            Button {
              selectMatch(match)
            } label: {
              HStack(spacing: Theme.Spacing.sm) {
                if match.kind == .pokemon {
                  SpriteImage(
                    urlString: match.resolvedSpriteURL,
                    name: match.displayName,
                    size: 36,
                    animated: false,
                    decorative: true
                  )
                }
                Text(match.displayName)
                  .font(Theme.body(.body))
                  .foregroundStyle(Theme.textPrimary)
                Spacer()
              }
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .listRowBackground(isSelected(match) ? Theme.accentSoft : Theme.surface)
            .accessibilityAddTraits(isSelected(match) ? .isSelected : [])
            .accessibilityHint("Shows \(match.displayName) in the profile")
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
    .accessibilityIdentifier("pad-dex-index")
  }

  private func sectionChips(model: DexViewModel) -> some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: Theme.Spacing.xs) {
        ForEach(DexSection.allCases) { section in
          let selected = model.section == section
          Button {
            model.selectSection(section)
          } label: {
            Text(section.title)
              .font(Theme.body(.subheadline, weight: .semibold))
              .padding(.horizontal, 12)
              .padding(.vertical, 8)
              .background(selected ? Theme.accentSoft : Theme.surface, in: Capsule())
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
      TextField(
        "Search \(model.section.title.lowercased())…",
        text: Binding(
          get: { model.query },
          set: { model.query = $0 }
        )
      )
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
    .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
        .strokeBorder(Theme.border, lineWidth: 1)
    )
  }

  private var indexOverlay: some View {
    ZStack(alignment: .leading) {
      Theme.scrim
        .ignoresSafeArea()
        .onTapGesture { indexOverlayPresented = false }
        .accessibilityLabel("Dismiss Dex index")
        .accessibilityAddTraits(.isButton)
      indexColumn
        .frame(width: PadLayout.chatListMinWidth)
        .frame(maxHeight: .infinity)
        .background(Theme.canvas)
        .transition(.move(edge: .leading))
    }
  }

  // MARK: Profile

  private func profilePane(showsIndexButton: Bool) -> some View {
    VStack(spacing: 0) {
      profileHeader(showsIndexButton: showsIndexButton)
      if let route = selectedRoute {
        DexEntityDetailContainer(
          kind: route.kind,
          query: route.query,
          format: .champions,
          artifactService: services.artifact,
          onOpen: { kind, query in
            shell.select(.dex(DexEntityRoute(kind: kind, query: query)))
          }
        )
        .id("\(route.kind.rawValue)|\(route.query)")
      } else {
        ContentUnavailableView {
          Label("Dex", systemImage: "books.vertical")
        } description: {
          Text("Select a Pokémon, move, ability, or item.")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.canvas)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.canvas)
    .accessibilityIdentifier("pad-dex-profile")
  }

  private func profileHeader(showsIndexButton: Bool) -> some View {
    HStack(spacing: Theme.Spacing.sm) {
      if showsIndexButton {
        Button {
          indexOverlayPresented = true
        } label: {
          Image(systemName: "sidebar.leading")
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(Theme.accent)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Dex index")
      }
      Text(profileTitle)
        .font(Theme.display(.headline))
        .foregroundStyle(Theme.textPrimary)
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityAddTraits(.isHeader)
      if showsIndexButton {
        RegulationChip()
      }
    }
    .padding(.leading, headerLeadingInset)
    .padding(.trailing, headerTrailingInset)
    .padding(.top, Theme.Spacing.sm)
    .padding(.bottom, Theme.Spacing.xs)
  }

  private var profileTitle: String {
    guard let route = selectedRoute else { return "Dex" }
    return displayName(for: route)
  }

  private var destinationsRevealShown: Bool {
    layoutMode == .compact || shell.sidebarCollapsed
  }

  private var indexHeaderLeadingInset: CGFloat {
    destinationsRevealShown ? PadDexChrome.overlayControlInset : Theme.Spacing.lg
  }

  private var headerLeadingInset: CGFloat {
    let indexVisible = PadDexChrome.showsIndexColumn(mode: layoutMode, isPortrait: isPortrait)
    return (destinationsRevealShown && !indexVisible)
      ? PadDexChrome.overlayControlInset
      : Theme.Spacing.md
  }

  private var headerTrailingInset: CGFloat {
    PadDexChrome.overlayControlInset
  }

  private var columnSeparator: some View {
    Rectangle()
      .fill(Theme.separator)
      .frame(width: 1)
  }

  // MARK: Selection / hops / chip

  private func ensureModel() {
    guard model == nil else { return }
    let vm = DexViewModel(dexLookup: services.dexLookup, format: .champions)
    model = vm
    vm.start()
  }

  private func selectMatch(_ match: SearchMatch) {
    shell.select(.dex(DexEntityRoute(kind: match.kind, query: match.slug)))
    indexOverlayPresented = false
  }

  private func isSelected(_ match: SearchMatch) -> Bool {
    guard let route = selectedRoute else { return false }
    return route.kind == match.kind
      && route.query.compare(match.slug, options: [.caseInsensitive, .diacriticInsensitive])
        == .orderedSame
  }

  private func consumePendingDestination() {
    switch appState.pendingDestination {
    case let .dexHop(hop):
      model?.applyArtifactHop(hop)
      if let route = model?.consumePendingRoute() {
        shell.select(.dex(route))
      }
      appState.pendingDestination = nil
    case let .dex(query):
      if let hop = PendingDexHop.consume(.dex(query: query)) {
        model?.query = hop.query
        if let route = hop.route {
          shell.select(.dex(route))
        }
      }
      appState.pendingDestination = nil
    default:
      break
    }
  }

  private func syncSectionToRoute() {
    guard let route = selectedRoute, let section = DexSection(entityKind: route.kind) else {
      return
    }
    model?.selectSection(section)
  }

  private func syncProfileChip() {
    guard case .dex = shell.destination, shell.companionOpen else { return }
    guard let route = selectedRoute else {
      shell.setContextChip(nil)
      return
    }
    let name = displayName(for: route)
    let slug = route.query
    switch route.kind {
    case .pokemon:
      shell.setContextChip(.pokemon(slug: slug, name: name))
    case .move:
      shell.setContextChip(.move(slug: slug, name: name))
    case .ability:
      shell.setContextChip(.ability(slug: slug, name: name))
    case .item:
      shell.setContextChip(.item(slug: slug, name: name))
    case .type, .unsupported:
      shell.setContextChip(nil)
    }
  }

  private func displayName(for route: DexEntityRoute) -> String {
    if let match = model?.matches.first(where: {
      $0.kind == route.kind
        && ($0.slug.compare(route.query, options: [.caseInsensitive, .diacriticInsensitive])
          == .orderedSame
          || $0.displayName.compare(route.query, options: [.caseInsensitive, .diacriticInsensitive])
            == .orderedSame)
    }) {
      return match.displayName
    }
    return PadDexChrome.titleize(route.query)
  }
}

extension PadDexChrome {
  static func titleize(_ slug: String) -> String {
    slug
      .split(whereSeparator: { $0 == "-" || $0 == " " || $0 == "_" })
      .map { $0.prefix(1).uppercased() + $0.dropFirst() }
      .joined(separator: " ")
  }
}
