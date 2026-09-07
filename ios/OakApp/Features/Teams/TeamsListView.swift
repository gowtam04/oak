import SwiftUI

/// The team-library screen (history-and-teams.md M-TEAM-US-6; M-UI-US-5): a
/// format-filterable list of saved teams with native list patterns — swipe to delete,
/// a context menu (edit / duplicate / delete), and pull-to-refresh. New teams are
/// created via the "+" menu (per format) and Showdown pastes via the import sheet
/// (M-TEAM-US-2).
///
/// Teams are signed-in only (M-BR-T1): a guest sees a sign-in prompt, not an empty list.
/// The view owns its ``TeamsListViewModel`` (`@State`) and drives it; all logic lives in
/// the view model. Tapping a row opens the full-set editor; a freshly created team opens
/// the editor in new mode and the list reloads on return.
struct TeamsListView: View {
  @Environment(AppState.self) private var appState
  @Environment(\.services) private var services
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var model: TeamsListViewModel

  /// The team being edited / created (drives the editor navigation).
  @State private var editorTarget: EditorTarget?
  /// `true` while the Showdown import sheet is presented.
  @State private var isImporting: Bool = false
  /// `true` while the guest sign-in sheet is presented (mirrors `ChatTabView`'s
  /// guest-nudge pattern — web's `/teams` gate offers the same sign-in action).
  @State private var showSignIn = false

  init(model: TeamsListViewModel) {
    _model = State(initialValue: model)
  }

  private var isSignedIn: Bool {
    if case .signedIn = appState.authState { return true }
    return false
  }

  var body: some View {
    NavigationStack {
      Group {
        if !isSignedIn {
          guestState
        } else {
          listContent
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Theme.canvas)
      .navigationTitle("Teams")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        if isSignedIn {
          ToolbarItem(placement: .principal) {
            RegulationChip()
          }
          .oakLidItem()
          ToolbarItem(placement: .topBarTrailing) {
            addMenu
          }
          .oakLidItem()
        }
      }
      .navigationDestination(item: $editorTarget) { target in
        editorView(for: target)
      }
      .sheet(isPresented: $isImporting, onDismiss: { Task { await model.reload() } }) {
        ShowdownImportView(model: model)
      }
      .sheet(isPresented: $showSignIn) {
        AuthView(model: AuthViewModel(auth: services.auth, appState: appState))
      }
    }
    .oakEnamelNav()
    .task(id: isSignedIn) {
      if isSignedIn {
        await model.reload()
        await model.reloadArchived()
      }
    }
    // A completed sign-in flips `isSignedIn`, which switches the body out of
    // `guestState` on its own — this just drops the now-redundant sheet.
    .onChange(of: appState.authState) { _, newValue in
      if case .signedIn = newValue {
        showSignIn = false
      }
    }
    .onAppear { consumePendingDestination() }
    .onChange(of: appState.pendingDestination) { _, _ in
      consumePendingDestination()
    }
  }

  /// TabView lazily creates this tab after RootView has already written
  /// `pendingDestination`, so `onChange` alone never fires on first hop.
  private func consumePendingDestination() {
    switch appState.pendingDestination {
    case let .team(id):
      editorTarget = .existing(
        TeamSummary(
          id: id,
          name: "Team",
          format: .champions,
          memberCount: 0,
          incomplete: false,
          species: [],
          updatedAt: 0
        )
      )
      appState.pendingDestination = nil
    case let .teams(query):
      if let query, let match = model.teams.first(where: {
        $0.name.localizedCaseInsensitiveContains(query)
      }) {
        editorTarget = .existing(match)
      }
      appState.pendingDestination = nil
    default:
      break
    }
  }

  // MARK: List

  @ViewBuilder
  private var listContent: some View {
    if model.teams.isEmpty && model.archivedTeams.isEmpty {
      if model.isLoading {
        skeletonList
      } else {
        emptyState
      }
    } else {
      List {
        if !model.teams.isEmpty {
          Section {
            ForEach(model.teams) { team in
              livingRow(team)
            }
          }
        } else if !model.isLoading {
          Section {
            Text("No Champions teams yet")
              .font(Theme.body(.subheadline))
              .foregroundStyle(Theme.textSecondary)
              .listRowBackground(Theme.surface)
          }
        }
        if !model.archivedTeams.isEmpty {
          Section("Archived") {
            ForEach(model.archivedTeams) { team in
              archivedRow(team)
            }
          }
        }
      }
      .listStyle(.plain)
      .scrollContentBackground(.hidden)
      .background(Theme.canvas)
      .animation(reduceMotion ? nil : Theme.Motion.smooth, value: model.teams)
      .refreshable {
        await model.reload()
        await model.reloadArchived()
      }
      .overlay(alignment: .bottom) {
        if let message = model.errorMessage {
          ErrorBanner(message: message, onDismiss: { model.dismissError() })
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.bottom, Theme.Spacing.sm)
        }
      }
    }
  }

  private func livingRow(_ team: TeamSummary) -> some View {
    Button {
      editorTarget = .existing(team)
    } label: {
      TeamRow(team: team, model: model)
    }
    .buttonStyle(.plain)
    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
      if model.canDelete(team) {
        Button(role: .destructive) {
          Task { await model.delete(team) }
        } label: {
          Label("Delete", systemImage: "trash")
        }
      }
    }
    .contextMenu {
      rowMenu(for: team)
    }
    .listRowBackground(Theme.surface)
    .listRowSeparatorTint(Theme.separator)
  }

  private func archivedRow(_ team: TeamSummary) -> some View {
    Button {
      editorTarget = .existing(team)
    } label: {
      TeamRow(team: team, model: model, archived: true)
    }
    .buttonStyle(.plain)
    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
      Button(role: .destructive) {
        Task { await model.delete(team) }
      } label: {
        Label("Delete", systemImage: "trash")
      }
    }
    .contextMenu {
      Button(role: .destructive) {
        Task { await model.delete(team) }
      } label: {
        Label("Delete", systemImage: "trash")
      }
    }
    .listRowBackground(Theme.surface)
    .listRowSeparatorTint(Theme.separator)
  }

  /// Six skeleton rows shown while the first page is loading, replacing the
  /// centered spinner.
  private var skeletonList: some View {
    List {
      ForEach(0..<6, id: \.self) { _ in
        SkeletonListRow()
          .listRowBackground(Theme.surface)
      }
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .background(Theme.canvas)
  }

  @ViewBuilder
  private func rowMenu(for team: TeamSummary) -> some View {
    if model.canEdit(team) {
      Button {
        editorTarget = .existing(team)
      } label: {
        Label("Edit", systemImage: "pencil")
      }
    } else {
      Button {
        editorTarget = .existing(team)
      } label: {
        Label("View", systemImage: "eye")
      }
    }
    if model.canDuplicate(team) {
      Button {
        Task {
          if let created = await model.duplicate(team) {
            editorTarget = .created(created)
          }
        }
      } label: {
        Label("Duplicate", systemImage: "plus.square.on.square")
      }
    }
    if model.canDelete(team) {
      Button(role: .destructive) {
        Task { await model.delete(team) }
      } label: {
        Label("Delete", systemImage: "trash")
      }
    }
  }

  // MARK: Toolbar menus

  private var addMenu: some View {
    Menu {
      Button {
        editorTarget = .new(.champions)
      } label: {
        Label("New Champions team", systemImage: "plus")
      }
      Button {
        isImporting = true
      } label: {
        Label("Import from Showdown", systemImage: "square.and.arrow.down")
      }
    } label: {
      Label("Add team", systemImage: "plus")
    }
  }

  // MARK: Editor routing

  @ViewBuilder
  private func editorView(for target: EditorTarget) -> some View {
    switch target {
    case let .new(format):
      TeamEditorView(model: model.makeEditor(forNewTeam: format))
    case let .existing(summary):
      TeamEditorView(model: model.makeEditor(for: summary), loadsOnAppear: true)
    case let .created(team):
      TeamEditorView(model: model.makeEditor(for: team))
    }
  }

  // MARK: Empty / guest / error states

  /// Mirrors the web `/teams` gate copy (`teams-page__guest`): saved teams, the
  /// builder, and Showdown import/export all unlock with a free account.
  private var guestState: some View {
    VStack(spacing: 12) {
      OakBrandMark(size: 64)
      Text("Sign in to build teams")
        .font(Theme.display(.title3))
      Text(
        "Saved teams, the team builder, and Showdown import/export unlock with a free account."
      )
      .font(Theme.body(.subheadline))
      .foregroundStyle(Theme.textSecondary)
      .multilineTextAlignment(.center)
      .padding(.horizontal, 32)
      Button("Sign in") { showSignIn = true }
        .buttonStyle(.oakPrimary)
        .padding(.top, 4)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private var emptyState: some View {
    VStack(spacing: 12) {
      OakBrandMark(size: 64)
      Text("No teams yet")
        .font(Theme.display(.title3))
      Text("Create a Champions team with the + button, or import one from Showdown.")
        .font(Theme.body(.subheadline))
        .foregroundStyle(Theme.textSecondary)
        .multilineTextAlignment(.center)
        .padding(.horizontal, 32)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

}

// MARK: - Editor routing target

/// What the editor navigation presents. `Hashable`/`Identifiable` keyed on the team id
/// (or a synthetic key for a new team) so it works with `navigationDestination(item:)`
/// without requiring `Team` itself to be `Hashable`.
private enum EditorTarget: Identifiable, Hashable {
  case new(Format)
  case existing(TeamSummary)
  case created(Team)

  var id: String {
    switch self {
    case let .new(format): return "new-\(format.rawValue)"
    case let .existing(summary): return summary.id
    case let .created(team): return team.id
    }
  }

  static func == (lhs: EditorTarget, rhs: EditorTarget) -> Bool { lhs.id == rhs.id }
  func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

// MARK: - Row

/// One team row: a six-slot roster indicator, name, a format tag, and a glanceable
/// composition summary. Color is never the sole signal — the format is shown as
/// text (M-AC-UI9.3).
private struct TeamRow: View {
  let team: TeamSummary
  /// The list view model, read for the batch-resolved sprite refs (keyed by species
  /// slug) so filled slots can show Pokémon artwork.
  let model: TeamsListViewModel
  var archived: Bool = false

  var body: some View {
    HStack(spacing: 12) {
      slotIndicator
      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 6) {
          Text(team.name)
            .font(Theme.body(.body))
            .lineLimit(1)
        }
        HStack(spacing: 6) {
          Text(formatLabel)
          Text("·")
          Text(compositionLabel)
        }
        .font(Theme.body(.caption))
        .foregroundStyle(Theme.textSecondary)
        .lineLimit(1)
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, 4)
    .contentShape(Rectangle())
    .accessibilityElement(children: .combine)
    .accessibilityLabel(accessibilityLabel)
  }

  /// Six mini roster slots. A filled slot whose species resolved to a sprite ref (via
  /// the VM's batch `GET /api/sprites` hydration) shows the Pokémon's 24pt artwork; a
  /// filled slot with no resolved ref (unknown species, or a failed/degraded sprite
  /// fetch — which folds silently to an empty map, never erroring the list) falls back
  /// to a solid accent-tinted dot; an empty slot is a solid outline. Decorative —
  /// `accessibilityLabel` above already states the composition.
  private var slotIndicator: some View {
    HStack(spacing: 3) {
      ForEach(0..<6, id: \.self) { slot in
        if slot < team.memberCount {
          if let species = species(at: slot), let ref = model.spriteRef(for: species) {
            SpriteImage(urlString: ref.spriteUrl, name: ref.displayName, size: 24)
          } else {
            Circle()
              .fill(Theme.accent.opacity(0.3))
              .frame(width: 8, height: 8)
          }
        } else {
          Circle()
            .strokeBorder(Theme.textMuted.opacity(0.5), lineWidth: 1)
            .frame(width: 8, height: 8)
        }
      }
    }
    .accessibilityHidden(true)
  }

  /// The species slug at a filled `slot`. `TeamSummary.species` lists only filled slots
  /// in slot order, so it indexes 1:1 with the leading filled slots.
  private func species(at slot: Int) -> String? {
    slot < team.species.count ? team.species[slot] : nil
  }

  private var formatLabel: String {
    archived ? "Archived · \(team.format.shortLabel)" : "Champions"
  }

  /// Either the filled-slot species (titleized) or a "n/6 Pokémon" count when empty.
  private var compositionLabel: String {
    if team.species.isEmpty {
      return "\(team.memberCount)/6 Pokémon"
    }
    return team.species.map(TeamBlocksView.titleizeNonNil).joined(separator: ", ")
  }

  private var accessibilityLabel: String {
    var parts = [team.name, formatLabel, compositionLabel]
    if team.incomplete { parts.append("incomplete") }
    return parts.joined(separator: ", ")
  }
}
