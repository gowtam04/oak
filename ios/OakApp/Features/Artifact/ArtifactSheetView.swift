import SwiftUI

/// The artifact viewer's **draggable bottom sheet** over the chat (artifact-viewer.md
/// M-ART-US-2/3, M-AC-A1.2/A2.2/A3.2/A3.3, M-BR-ART-1/5).
///
/// Presented via the ``SwiftUICore/View/artifactViewer(_:)`` modifier as a `.sheet` with
/// `presentationDetents([.medium, .large])` — the user keeps chat context above the
/// partially-raised sheet, drags it toward full screen for dense content, and dismisses it with
/// the standard swipe-down gesture (M-AC-A3.3) or the Done control. It shows the **top** of the
/// view model's back stack (one artifact at a time, M-BR-ART-1); a Back control appears once the
/// user has drilled in (M-AC-A3.2). Tapping an entity inside the current artifact pushes a new
/// one (M-AC-A3.1).
///
/// Reads ``ArtifactViewModel`` directly (`@Observable`); the model owns all navigation, so this
/// view is a thin renderer + toolbar.
struct ArtifactSheetView: View {
  let model: ArtifactViewModel

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(AppState.self) private var appState
  @State private var compareSpecies = ""
  @State private var showingCompare = false
  /// Mirrors the back-stack depth of the *previous* render so the drill transition can tell a
  /// push (depth grew → new content slides in from the trailing edge) from a back (depth shrank →
  /// from the leading edge). Updated in `.onChange` after each swap, so during the render that
  /// swaps `current` it still holds the pre-change depth. Read-only reflection of the model's
  /// stack — it adds no navigation API (the model still owns all navigation).
  @State private var previousDepth = 0

  var body: some View {
    NavigationStack {
      Group {
        if let artifact = model.current {
          content(for: artifact)
        } else {
          loadingView
        }
      }
      // Keying on the artifact id makes SwiftUI treat each drill as a remove+insert so the
      // directional transition fires; the count drives the push/back direction.
      .id(model.current?.id)
      .transition(drillTransition)
      .animation(Theme.Motion.smooth, value: model.current?.id)
      .onChange(of: model.stack.count) { _, newValue in
        previousDepth = newValue
      }
      .navigationTitle(model.current?.title ?? "")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        if model.canGoBack {
          ToolbarItem(placement: .topBarLeading) {
            Button {
              model.back()
            } label: {
              Label("Back", systemImage: "chevron.left")
            }
            .accessibilityLabel("Back to previous artifact")
          }
          .oakLidItem()
        }
        ToolbarItem(placement: .topBarTrailing) {
          HStack(spacing: 12) {
            if model.canOpenInDex {
              Button {
                if let hop = model.openInDex() {
                  appState.pendingDestination = .dexHop(hop)
                }
              } label: {
                Label("Open in Dex", systemImage: "books.vertical")
              }
              .accessibilityLabel("Open in Dex")
            }
            if case .entity(let ok)? = model.current?.content, ok.kind == .pokemon {
              Button {
                showingCompare = true
              } label: {
                Label("Compare with…", systemImage: "rectangle.split.2x1")
              }
            }
            if model.canPin {
              Button {
                Task { _ = await model.pin() }
              } label: {
                Label("Pin", systemImage: "pin")
              }
            }
            Button("Done") {
              model.dismiss()
            }
          }
        }
        .oakLidItem()
      }
    }
    .oakEnamelNav()
    .sheet(isPresented: $showingCompare) {
      NavigationStack {
        Form {
          TextField("Species", text: $compareSpecies)
            .textInputAutocapitalization(.never)
          if let message = model.compareErrorMessage {
            Text(message).foregroundStyle(Theme.warning)
          }
        }
        .navigationTitle("Compare with…")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("Cancel") { showingCompare = false }
          }
          .oakLidItem()
          ToolbarItem(placement: .confirmationAction) {
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
          }
          .oakLidItem()
        }
      }
      .oakEnamelNav()
      .presentationDetents([.medium])
      .oakPaperSheet()
    }
    .presentationDetents([.medium, .large])
    .oakPaperSheet()
  }

  /// Push (deeper) slides content in from the trailing edge and out to the leading edge; back
  /// reverses it. Under Reduce Motion (constraint 2) both directions collapse to a plain opacity
  /// crossfade — no lateral movement. `previousDepth` still holds the pre-swap depth here, so the
  /// comparison against the just-updated `model.stack.count` yields the correct direction.
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

  /// A skeleton profile stands in while an entity/team fetch settles — a header row (sprite tile +
  /// name/dex bars + a type-chip row) over a column of stat-bar rows, mirroring the shape an
  /// entity profile resolves into. Built from the Phase-1 `SkeletonBlock` (which shimmers, or sits
  /// at a steady 60% under Reduce Motion). The blocks are decorative and VoiceOver-hidden, so the
  /// whole placeholder announces itself as one "Loading" element (M-AC-UI9.3).
  private var loadingView: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
      // Hero band: sprite tile + name bar + dex bar + two type-chip bars.
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
      // Six meter-shaped rows mirroring the stat-bar layout.
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
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(Theme.Spacing.lg)
    .oakCard()
    .padding(Theme.Spacing.sm)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Loading")
  }

  /// An honest miss — the sheet stays open and the user can always get back to chat
  /// (M-BR-ART-5). Icon + text, never color alone (M-AC-UI9.3). On a `not_found` the server's
  /// close-name `suggestions` (#2) render as tappable capsule buttons that reopen the same entity
  /// kind with the picked name; an empty list shows just the icon + message.
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

  /// A wrapping row of tappable suggestion capsules (the resolution-miss "did you mean" retries).
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

// MARK: - Host modifier

extension View {
  /// Hosts the artifact bottom sheet over `self`, driven by the view model's back stack. Apply it
  /// once on the chat screen; pushing an artifact opens the sheet, an empty stack closes it, and a
  /// swipe-down (or Done) dismisses it (M-AC-A3.3, M-BR-ART-5).
  func artifactViewer(_ model: ArtifactViewModel) -> some View {
    modifier(ArtifactViewerModifier(model: model))
  }
}

/// Binds the sheet's presentation to the model's `isPresented` (stack non-empty) and routes a
/// swipe-down dismissal back to ``ArtifactViewModel/dismiss()`` so the back stack is cleared.
private struct ArtifactViewerModifier: ViewModifier {
  let model: ArtifactViewModel

  func body(content: Content) -> some View {
    content.sheet(
      isPresented: Binding(
        get: { model.isPresented },
        set: { presented in
          if !presented { model.dismiss() }
        }
      )
    ) {
      ArtifactSheetView(model: model)
    }
  }
}

// MARK: - Team artifact

/// Renders a team sheet in the viewer — the agent's **proposed** team (inline, no fetch) or a
/// fetched **saved** team. Mirrors the proposed/saved team cards' fidelity (full member sets +
/// warn-but-allow warnings) but as a focused, scrollable artifact. Each filled member's species
/// is tappable to drill into that Pokémon (M-AC-A3.1).
private struct TeamArtifactDetail: View {
  let team: TeamArtifact
  var onOpenSpecies: (String) -> Void = { _ in }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 14) {
        header
        if !team.warnings.isEmpty {
          warningsSection
        }
        VStack(alignment: .leading, spacing: 10) {
          ForEach(Array(team.members.enumerated()), id: \.offset) { index, member in
            memberRow(index: index, member: member)
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(Theme.Spacing.lg)
      .oakCard()
      .padding(.horizontal, Theme.Spacing.sm)
      .padding(.vertical, Theme.Spacing.sm)
    }
    .background(Theme.canvas)
  }

  private var header: some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      VStack(alignment: .leading, spacing: 2) {
        Text(team.savedId == nil ? "Proposed team" : "Saved team")
          .font(Theme.body(.caption, weight: .semibold))
          .foregroundStyle(Theme.accent)
        Text(team.name)
          .font(Theme.display(.title3))
          .foregroundStyle(Theme.textPrimary)
          .fixedSize(horizontal: false, vertical: true)
      }
      Spacer(minLength: 8)
      Text(team.format.shortLabel)
        .font(Theme.body(.caption2, weight: .semibold))
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .foregroundStyle(Theme.textSecondary)
        .background(Theme.surfaceRaised, in: Capsule())
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var warningsSection: some View {
    VStack(alignment: .leading, spacing: 6) {
      Label("Legality", systemImage: "checklist")
        .font(Theme.body(.caption, weight: .semibold))
        .foregroundStyle(Theme.textSecondary)
      ForEach(Array(team.warnings.enumerated()), id: \.offset) { _, warning in
        Label {
          Text(warning.message)
            .font(Theme.body(.footnote))
            .foregroundStyle(Theme.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
        } icon: {
          Image(systemName: warning.code == .incomplete ? "info.circle" : "exclamationmark.triangle.fill")
            .imageScale(.small)
            .foregroundStyle(warning.code == .incomplete ? Theme.info : Theme.warning)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(10)
    .background(Theme.warning.opacity(0.10), in: RoundedRectangle(cornerRadius: Theme.Radius.md))
  }

  @ViewBuilder
  private func memberRow(index: Int, member: TeamMember) -> some View {
    let species = (member.species ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    let isEmpty = species.isEmpty
    HStack(alignment: .top, spacing: 8) {
      Text("\(index + 1)")
        .font(Theme.mono(.caption2))
        .foregroundStyle(Theme.textSecondary)
        .frame(minWidth: 16, alignment: .trailing)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 3) {
        if isEmpty {
          Text("Empty slot")
            .font(Theme.body(.subheadline, weight: .semibold))
            .foregroundStyle(Theme.textMuted)
        } else {
          Button {
            onOpenSpecies(species)
          } label: {
            HStack(spacing: 6) {
              Text(titleize(species) + itemSuffix(member.item))
                .font(Theme.body(.subheadline, weight: .semibold))
                .foregroundStyle(Theme.textPrimary)
                .multilineTextAlignment(.leading)
              Image(systemName: "chevron.right")
                .imageScale(.small)
                .foregroundStyle(Theme.textMuted)
            }
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityHint("Opens \(titleize(species))")
          AddToTeamButton(incoming: member, compact: true)
        }
        if let detail = abilityTeraLine(member) {
          Text(detail)
            .font(Theme.body(.footnote))
            .foregroundStyle(Theme.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
        }
        if !member.moves.isEmpty {
          Text(member.moves.map(titleize).joined(separator: ", "))
            .font(Theme.body(.footnote))
            .foregroundStyle(Theme.textMuted)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func itemSuffix(_ item: String?) -> String {
    guard let item, !item.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      return ""
    }
    return " @ \(titleize(item))"
  }

  private func abilityTeraLine(_ member: TeamMember) -> String? {
    var parts: [String] = []
    if let ability = member.ability, !ability.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      parts.append(titleize(ability))
    }
    if let tera = member.teraType, !tera.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      parts.append("Tera \(titleize(tera))")
    }
    return parts.isEmpty ? nil : parts.joined(separator: " \u{00B7} ")
  }
}

// MARK: - File-scoped helpers

/// Title-cases a slug (`great-tusk` → `Great Tusk`). Private to this file to avoid cross-phase
/// collisions (the same recipe is file-scoped in other AnswerCard files).
private func titleize(_ slug: String) -> String {
  slug
    .split(whereSeparator: { $0 == "-" || $0 == " " || $0 == "_" })
    .map { $0.prefix(1).uppercased() + $0.dropFirst() }
    .joined(separator: " ")
}

#if DEBUG
#Preview("Team artifact") {
  TeamArtifactDetail(
    team: TeamArtifact(
      name: "Sun Offense",
      format: .scarletViolet,
      members: [
        TeamMember(
          species: "great-tusk", ability: "protosynthesis", item: "booster-energy",
          moves: ["headlong-rush", "close-combat", "ice-spinner", "rapid-spin"],
          nature: "jolly", evs: StatSpread(hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252),
          ivs: StatSpread(hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31),
          teraType: "ground", level: 50, nickname: nil, gender: nil, shiny: nil
        )
      ],
      warnings: [
        TeamWarning(code: .incomplete, message: "This team has 1 of 6 Pokémon.", slot: nil, field: nil)
      ],
      savedId: nil
    )
  )
}
#endif
