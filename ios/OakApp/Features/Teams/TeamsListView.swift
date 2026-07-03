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
      .navigationTitle("Teams")
      .toolbar {
        if isSignedIn {
          ToolbarItem(placement: .topBarLeading) {
            formatFilterMenu
          }
          ToolbarItem(placement: .topBarTrailing) {
            addMenu
          }
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
    .task(id: isSignedIn) {
      if isSignedIn { await model.reload() }
    }
    // A completed sign-in flips `isSignedIn`, which switches the body out of
    // `guestState` on its own — this just drops the now-redundant sheet.
    .onChange(of: appState.authState) { _, newValue in
      if case .signedIn = newValue {
        showSignIn = false
      }
    }
  }

  // MARK: List

  @ViewBuilder
  private var listContent: some View {
    if model.teams.isEmpty {
      if model.isLoading {
        skeletonList
      } else {
        emptyState
      }
    } else {
      List {
        ForEach(model.teams) { team in
          Button {
            editorTarget = .existing(team)
          } label: {
            TeamRow(team: team)
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
            rowMenu(for: team)
          }
        }
      }
      .listStyle(.plain)
      .animation(reduceMotion ? nil : Theme.Motion.smooth, value: model.teams)
      .refreshable { await model.reload() }
      .overlay(alignment: .bottom) {
        if let message = model.errorMessage {
          errorBanner(message)
        }
      }
    }
  }

  /// Six skeleton rows shown while the first page is loading, replacing the
  /// centered spinner.
  private var skeletonList: some View {
    List {
      ForEach(0..<6, id: \.self) { _ in
        SkeletonListRow()
      }
    }
    .listStyle(.plain)
  }

  @ViewBuilder
  private func rowMenu(for team: TeamSummary) -> some View {
    Button {
      editorTarget = .existing(team)
    } label: {
      Label("Edit", systemImage: "pencil")
    }
    Button {
      Task {
        if let created = await model.duplicate(team) {
          editorTarget = .created(created)
        }
      }
    } label: {
      Label("Duplicate", systemImage: "plus.square.on.square")
    }
    Button(role: .destructive) {
      Task { await model.delete(team) }
    } label: {
      Label("Delete", systemImage: "trash")
    }
  }

  // MARK: Toolbar menus

  /// All six formats (mirrors the web `/teams` page's format selector, which
  /// spans `FORMATS` in full) — unlike the history list's 3-way filter, teams
  /// exist in any of the six scopes so the library filter must too.
  private var formatFilterMenu: some View {
    Menu {
      filterButton(title: "All formats", format: nil)
      ForEach(Format.knownCases, id: \.self) { format in
        filterButton(title: format.shortLabel, format: format)
      }
    } label: {
      Label("Filter", systemImage: "line.3.horizontal.decrease.circle")
    }
  }

  @ViewBuilder
  private func filterButton(title: String, format: Format?) -> some View {
    Button {
      Task { await model.setFormatFilter(format) }
    } label: {
      if model.formatFilter == format {
        Label(title, systemImage: "checkmark")
      } else {
        Text(title)
      }
    }
  }

  private var addMenu: some View {
    Menu {
      ForEach(Format.knownCases, id: \.self) { format in
        Button {
          editorTarget = .new(format)
        } label: {
          Label("New \(format.shortLabel) team", systemImage: "plus")
        }
      }
      Divider()
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
        .buttonStyle(.borderedProminent)
        .tint(Theme.accent)
        .padding(.top, 4)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private var emptyState: some View {
    VStack(spacing: 12) {
      OakBrandMark(size: 64)
      Text(model.formatFilter == nil ? "No teams yet" : "No teams in this format")
        .font(Theme.display(.title3))
      Text("Create a team with the + button, or import one from Showdown.")
        .font(Theme.body(.subheadline))
        .foregroundStyle(Theme.textSecondary)
        .multilineTextAlignment(.center)
        .padding(.horizontal, 32)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private func errorBanner(_ message: String) -> some View {
    HStack(spacing: 8) {
      Image(systemName: "exclamationmark.triangle.fill")
        .foregroundStyle(.orange)
      Text(message)
        .font(.footnote)
      Spacer(minLength: 0)
      Button("Dismiss") { model.dismissError() }
        .font(.footnote)
    }
    .padding(12)
    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
    .padding()
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

  var body: some View {
    HStack(spacing: 12) {
      slotIndicator
      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 6) {
          Text(team.name)
            .font(.body)
            .lineLimit(1)
        }
        HStack(spacing: 6) {
          Text(formatLabel)
          Text("·")
          Text(compositionLabel)
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(1)
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, 4)
    .contentShape(Rectangle())
    .accessibilityElement(children: .combine)
    .accessibilityLabel(accessibilityLabel)
  }

  /// Six mini roster slots — filled = a solid accent-tinted dot, empty = a dashed
  /// outline. `TeamSummary` (Services/TeamService.swift) carries no per-member
  /// sprite data, so this is the degraded treatment (filled-count only, not
  /// per-species artwork) rather than the ideal 28pt `SpriteImage` slots.
  /// Decorative — `accessibilityLabel` above already states the composition.
  private var slotIndicator: some View {
    HStack(spacing: 3) {
      ForEach(0..<6, id: \.self) { slot in
        if slot < team.memberCount {
          Circle()
            .fill(Theme.accent.opacity(0.3))
            .frame(width: 8, height: 8)
        } else {
          Circle()
            .strokeBorder(Theme.textMuted, style: StrokeStyle(lineWidth: 1, dash: [3]))
            .frame(width: 8, height: 8)
        }
      }
    }
    .accessibilityHidden(true)
  }

  private var formatLabel: String {
    team.format.shortLabel
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
