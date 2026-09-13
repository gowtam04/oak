import SwiftUI

/// Chat-destination trailing inspector (P-ART-US-1, P-CHAT-BR-3, ADR-P5).
/// Hosts the existing ``ArtifactViewModel`` back stack as a column, not a sheet.
/// Dismiss restores thread width (P-ART-AC-1.2).
struct PadInspectorColumn: View {
  var model: ArtifactViewModel

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(AppState.self) private var appState
  @State private var compareSpecies = ""
  @State private var showingCompare = false
  @State private var previousDepth = 0

  var body: some View {
    VStack(spacing: 0) {
      header
      if showingCompare {
        compareForm
      }
      Group {
        if let artifact = model.current {
          content(for: artifact)
        } else {
          loadingView
        }
      }
      .id(model.current?.id)
      .transition(drillTransition)
      .animation(Theme.Motion.smooth, value: model.current?.id)
      .onChange(of: model.stack.count) { _, newValue in
        previousDepth = newValue
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.canvas)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("pad-inspector-column")
  }

  // MARK: Header

  private var header: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
      HStack(spacing: Theme.Spacing.sm) {
        if model.canGoBack {
          Button {
            model.back()
          } label: {
            Label("Back", systemImage: "chevron.left")
              .labelStyle(.iconOnly)
              .font(.system(size: 17, weight: .semibold))
              .foregroundStyle(Theme.accent)
              .frame(width: 44, height: 44)
              .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Back to previous artifact")
        }
        Text(model.current?.title ?? "")
          .font(Theme.display(.headline))
          .foregroundStyle(Theme.textPrimary)
          .lineLimit(1)
          .frame(maxWidth: .infinity, alignment: .leading)
        Button("Done") {
          model.dismiss()
        }
        .font(Theme.display(.footnote, weight: .semibold))
        .buttonStyle(.borderless)
        .tint(Theme.accent)
        .accessibilityLabel("Done")
      }
      if showsVerbRow {
        verbRow
      }
    }
    .padding(.leading, Theme.Spacing.sm)
    .padding(.trailing, Theme.Spacing.md)
    .padding(.top, Theme.Spacing.sm)
    .padding(.bottom, Theme.Spacing.xs)
  }

  private var showsVerbRow: Bool {
    model.canOpenInDex || isPokemonEntity || model.canPin
  }

  private var isPokemonEntity: Bool {
    if case .entity(let ok)? = model.current?.content, ok.kind == .pokemon {
      return true
    }
    return false
  }

  private var verbRow: some View {
    HStack(spacing: Theme.Spacing.md) {
      if model.canOpenInDex {
        Button {
          if let hop = model.openInDex() {
            appState.pendingDestination = .dexHop(hop)
          }
        } label: {
          Label("Open in Dex", systemImage: "books.vertical")
            .font(Theme.body(.caption, weight: .medium))
        }
        .buttonStyle(.borderless)
        .tint(Theme.accent)
        .accessibilityLabel("Open in Dex")
      }
      if isPokemonEntity {
        Button {
          showingCompare = true
        } label: {
          Label("Compare with…", systemImage: "rectangle.split.2x1")
            .font(Theme.body(.caption, weight: .medium))
        }
        .buttonStyle(.borderless)
        .tint(Theme.accent)
      }
      if model.canPin {
        Button {
          Task { _ = await model.pin() }
        } label: {
          Label("Pin", systemImage: "pin")
            .font(Theme.body(.caption, weight: .medium))
        }
        .buttonStyle(.borderless)
        .tint(Theme.accent)
      }
      Spacer(minLength: 0)
    }
    .padding(.leading, model.canGoBack ? 44 : 0)
  }

  /// Compare picker stays in the inspector (not a sheet / not ArtifactSheetView).
  /// Centered-panel chrome for this picker is Phase 6.
  private var compareForm: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
      TextField("Species", text: $compareSpecies)
        .textInputAutocapitalization(.never)
        .font(Theme.body(.body))
      if let message = model.compareErrorMessage {
        Text(message)
          .font(Theme.body(.footnote))
          .foregroundStyle(Theme.warning)
      }
      HStack {
        Button("Cancel") {
          showingCompare = false
          compareSpecies = ""
        }
        Spacer(minLength: 0)
        Button("Compare") {
          let species = compareSpecies
          Task {
            await model.compareWith(species: species, format: .champions)
            if model.compareErrorMessage == nil {
              compareSpecies = ""
              showingCompare = false
            }
          }
        }
        .disabled(compareSpecies.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        .font(Theme.display(.footnote, weight: .semibold))
      }
      .buttonStyle(.borderless)
      .tint(Theme.accent)
    }
    .padding(Theme.Spacing.md)
    .background(Theme.surface)
  }

  private var drillTransition: AnyTransition {
    if reduceMotion { return .opacity }
    let isPush = model.stack.count >= previousDepth
    return .asymmetric(
      insertion: .move(edge: isPush ? .trailing : .leading).combined(with: .opacity),
      removal: .move(edge: isPush ? .leading : .trailing).combined(with: .opacity)
    )
  }

  // MARK: Content dispatch

  @ViewBuilder
  private func content(for artifact: Artifact) -> some View {
    switch artifact.content {
    case .loading:
      loadingView
    case .entity(let ok):
      EntityDetailView(artifact: ok, requestFormat: model.requestFormat) { kind, query in
        Task { await model.openEntity(kind: kind, query: query) }
      }
    case .team(let team):
      TeamArtifactDetail(team: team) { species in
        Task { await model.openEntity(kind: .pokemon, query: species) }
      }
    case .comparison(let subjects):
      ComparisonArtifactView(subjects: subjects, diff: model.lastCompareDiff) { species in
        Task { await model.openEntity(kind: .pokemon, query: species) }
      }
    case .damageCalc(let damageCalc):
      ScrollView {
        DamageCalcView(damageCalc: damageCalc)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(Theme.Spacing.lg)
          .oakCard()
          .padding(Theme.Spacing.sm)
      }
      .background(Theme.canvas)
    case .unavailable(let kind, let query, let suggestions):
      missView(
        title: "Couldn't open \(query)",
        message: "Oak doesn't have a \(kind.rawValue) profile for \u{201C}\(query)\u{201D} in this format.",
        suggestions: suggestions,
        onOpenSuggestion: { suggestion in
          Task { await model.openEntity(kind: kind, query: suggestion) }
        }
      )
    case .teamUnavailable:
      missView(
        title: "Couldn't load this team",
        message: "The team couldn't be loaded. It may have been deleted, or you may need to sign in."
      )
    }
  }

  private var loadingView: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
      HStack(alignment: .top, spacing: Theme.Spacing.md + 2) {
        SkeletonBlock(width: 96, height: 96)
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
          SkeletonBlock(width: 150, height: 22)
          SkeletonBlock(width: 80, height: 13)
          HStack(spacing: Theme.Spacing.xs + 2) {
            SkeletonBlock(width: 54, height: 20)
            SkeletonBlock(width: 54, height: 20)
          }
        }
        Spacer(minLength: 0)
      }
      VStack(alignment: .leading, spacing: Theme.Spacing.md) {
        ForEach(0..<6, id: \.self) { _ in
          HStack(spacing: Theme.Spacing.sm) {
            SkeletonBlock(width: 40, height: 12)
            SkeletonBlock(width: 32, height: 12)
            SkeletonBlock(height: 8)
          }
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding(Theme.Spacing.lg)
    .oakCard()
    .padding(Theme.Spacing.sm)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Loading")
  }

  private func missView(
    title: String,
    message: String,
    suggestions: [String] = [],
    onOpenSuggestion: @escaping (String) -> Void = { _ in }
  ) -> some View {
    ContentUnavailableView {
      Label(title, systemImage: "questionmark.circle")
    } description: {
      Text(message)
    } actions: {
      if !suggestions.isEmpty {
        VStack(spacing: 8) {
          Text("Did you mean…")
            .font(Theme.body(.caption, weight: .semibold))
            .foregroundStyle(Theme.textSecondary)
          suggestionFlow(suggestions, onOpen: onOpenSuggestion)
        }
      }
    }
  }

  private func suggestionFlow(_ suggestions: [String], onOpen: @escaping (String) -> Void) -> some View {
    LazyVGrid(
      columns: [GridItem(.adaptive(minimum: 96), spacing: 8, alignment: .center)],
      spacing: 8
    ) {
      ForEach(Array(suggestions.enumerated()), id: \.offset) { _, suggestion in
        Button {
          onOpen(suggestion)
        } label: {
          Text(suggestion)
            .font(Theme.body(.caption, weight: .semibold))
            .foregroundStyle(Theme.accent)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Theme.surfaceRaised, in: Capsule())
        }
        .buttonStyle(OakPressableButtonStyle())
        .accessibilityHint("Opens \(suggestion)")
      }
    }
  }
}
