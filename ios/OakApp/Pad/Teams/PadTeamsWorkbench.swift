import SwiftUI
import UIKit

/// iPad Teams destination: library | 6-slot canvas | slot inspector (P-TEAM-US-1–4).
/// Assistant reveals companion chat with a live-draft team chip (ADR-P4).
struct PadTeamsWorkbench: View {
  var shell: PadShellModel
  var layoutMode: PadLayoutMode

  @Environment(\.services) private var services
  @Environment(AppState.self) private var appState
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.scenePhase) private var scenePhase

  @State private var listModel: TeamsListViewModel?
  @State private var editor: TeamEditorViewModel?
  @State private var selectedSlot: Int = 0
  @State private var libraryOverlayPresented = false
  @State private var isPortrait = false
  @State private var panel: PadTeamsPanel?
  @State private var teamPendingDelete: TeamSummary?
  @State private var showAddActions = false

  private var isSignedIn: Bool {
    if case .signedIn = appState.authState { return true }
    return false
  }

  var body: some View {
    let _ = shell.destination
    let _ = shell.companionOpen
    let _ = editor?.members
    let _ = editor?.name
    let _ = editor?.teamId
    let _ = editor?.showSaveConfirmation
    applyChrome(to: applyLifecycle(to: root))
  }

  @ViewBuilder
  private var root: some View {
    Group {
      if PadTeamsChrome.showsUnlock(isSignedIn: isSignedIn) {
        guestUnlock
      } else {
        signedInWorkbench
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.canvas)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("pad-teams-workbench")
  }

  private func applyLifecycle<Content: View>(to view: Content) -> some View {
    view
      .task(id: isSignedIn) { await loadIfSignedIn() }
      .onChange(of: appState.authState) { _, newValue in handleAuthChange(newValue) }
      .onChange(of: appState.pendingDestination) { _, _ in consumePendingDestination() }
      .onChange(of: destinationTeamId) { _, _ in applyShellDestination() }
      .onChange(of: destinationSlotIndex) { _, slot in
        if let slot { selectedSlot = slot }
      }
      .onChange(of: editor?.members) { _, members in handleMembersChange(members) }
      .onChange(of: editor?.name) { _, _ in
        editor?.scheduleSave()
        syncTeamChip()
      }
      .onChange(of: editor?.teamId) { _, _ in handleTeamIdChange() }
      .onChange(of: editor?.showSaveConfirmation) { _, show in handleSaveConfirmation(show) }
      .onChange(of: shell.companionOpen) { _, open in
        if open { syncTeamChip() }
      }
      .onChange(of: scenePhase) { _, phase in
        if phase != .active { Task { await editor?.flushSave() } }
      }
      .onChange(of: layoutMode) { _, newMode in
        dismissLibraryOverlayIfColumnVisible(mode: newMode, isPortrait: isPortrait)
      }
      .onDisappear { Task { await editor?.flushSave() } }
  }

  private func applyChrome<Content: View>(to view: Content) -> some View {
    view
      .overlay { panelOverlay }
      .confirmationDialog("Add team", isPresented: $showAddActions, titleVisibility: .visible) {
        Button("New team") { startNewTeam() }
        Button("Import from Showdown") { panel = .importPaste }
        Button("Cancel", role: .cancel) {}
      }
      .alert(
        "Delete archived team?",
        isPresented: deleteAlertPresented
      ) {
        Button("Delete", role: .destructive) {
          if let team = teamPendingDelete {
            Task { await deleteTeam(team) }
          }
          teamPendingDelete = nil
        }
        Button("Cancel", role: .cancel) { teamPendingDelete = nil }
      } message: {
        Text("This permanently removes \(teamPendingDelete?.name ?? "this team").")
      }
  }

  private var deleteAlertPresented: Binding<Bool> {
    Binding(
      get: { teamPendingDelete != nil },
      set: { if !$0 { teamPendingDelete = nil } }
    )
  }

  @ViewBuilder
  private var panelOverlay: some View {
    if let panel {
      PadCenteredPanel(onDismiss: { self.panel = nil }) {
        panelContent(panel)
      }
    }
  }

  private func loadIfSignedIn() async {
    guard isSignedIn else {
      listModel = nil
      editor = nil
      return
    }
    if listModel == nil {
      listModel = TeamsListViewModel(
        teamService: services.teams,
        dexLookup: services.dexLookup
      )
    }
    await listModel?.reload()
    await listModel?.reloadArchived()
    consumePendingDestination()
    applyShellDestination()
  }

  private func handleAuthChange(_ newValue: AuthState) {
    if case .signedIn = newValue, panel == .signIn {
      panel = nil
    }
  }

  private func handleMembersChange(_ members: [EditableMember]?) {
    guard let editor, let members else { return }
    editor.scheduleAnalysis()
    editor.scheduleSave()
    if selectedSlot >= members.count {
      selectedSlot = max(0, members.count - 1)
      writeSlotToShell()
    }
    syncTeamChip()
  }

  private func handleTeamIdChange() {
    writeSlotToShell()
    syncTeamChip()
    Task {
      await listModel?.reload()
      await listModel?.reloadArchived()
    }
  }

  private func handleSaveConfirmation(_ show: Bool?) {
    guard let editor, show == true else { return }
    Task {
      try? await Task.sleep(nanoseconds: 1_000_000_000)
      editor.consumeSaveConfirmation()
    }
  }

  // MARK: Destination

  private var destinationTeamId: String? {
    if case .teams(let teamId, _) = shell.destination { return teamId }
    return nil
  }

  private var destinationSlotIndex: Int? {
    if case .teams(_, let slotIndex) = shell.destination { return slotIndex }
    return nil
  }

  // MARK: Guest (P-TEAM-AC-1.1)

  private var guestUnlock: some View {
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
      Button("Sign in") { panel = .signIn }
        .buttonStyle(.oakPrimary)
        .padding(.top, 4)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.canvas)
  }

  // MARK: Signed-in split

  private var signedInWorkbench: some View {
    GeometryReader { geo in
      let portrait = geo.size.height > geo.size.width
      let showLibrary = PadTeamsChrome.showsLibraryColumn(
        mode: layoutMode, isPortrait: portrait)
      let stacks = PadTeamsChrome.stacksCanvasAboveInspector(
        mode: layoutMode, isPortrait: portrait)
      ZStack(alignment: .leading) {
        HStack(spacing: 0) {
          if showLibrary {
            libraryColumn
              .frame(width: PadLayout.chatListMinWidth)
              .frame(maxHeight: .infinity)
            columnSeparator
          }
          if stacks {
            VStack(spacing: 0) {
              canvasPane(showsLibraryButton: !showLibrary, stacked: true)
                .frame(maxWidth: .infinity)
                .frame(height: geo.size.height * PadLayout.stackedWorkspaceMinFraction)
              rowSeparator
              inspectorPane
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
          } else {
            canvasPane(showsLibraryButton: !showLibrary, stacked: false)
              .frame(maxWidth: .infinity, maxHeight: .infinity)
            columnSeparator
            inspectorPane
              .frame(width: PadLayout.inspectorMinWidth)
              .frame(maxHeight: .infinity)
          }
        }

        if !showLibrary, libraryOverlayPresented {
          libraryOverlay
        }
      }
      .onAppear {
        isPortrait = portrait
        dismissLibraryOverlayIfColumnVisible(mode: layoutMode, isPortrait: portrait)
      }
      .onChange(of: geo.size) { _, size in
        let nextPortrait = size.height > size.width
        isPortrait = nextPortrait
        dismissLibraryOverlayIfColumnVisible(mode: layoutMode, isPortrait: nextPortrait)
      }
    }
    .animation(reduceMotion ? nil : Theme.Motion.snappy, value: libraryOverlayPresented)
  }

  private func dismissLibraryOverlayIfColumnVisible(mode: PadLayoutMode, isPortrait: Bool) {
    if PadTeamsChrome.showsLibraryColumn(mode: mode, isPortrait: isPortrait) {
      libraryOverlayPresented = false
    }
  }

  private var headerLeadingInset: CGFloat {
    layoutMode == .compact ? PadTeamsChrome.overlayControlInset : Theme.Spacing.md
  }

  private var headerTrailingInset: CGFloat {
    PadTeamsChrome.overlayControlInset
  }

  @ViewBuilder
  private func canvasPane(showsLibraryButton: Bool, stacked: Bool) -> some View {
    if let editor {
      PadTeamCanvas(
        model: editor,
        selectedSlot: selectedSlot,
        stacked: stacked,
        showsLibraryButton: showsLibraryButton,
        headerLeadingInset: headerLeadingInset,
        headerTrailingInset: headerTrailingInset,
        onPresentLibrary: { libraryOverlayPresented = true },
        onSelectSlot: selectSlot,
        onAssistant: openAssistant,
        onExport: exportTeam
      )
    } else {
      emptyCanvas(showsLibraryButton: showsLibraryButton)
    }
  }

  private var inspectorPane: some View {
    Group {
      if let editor {
        PadSlotInspector(model: editor, slotIndex: selectedSlot)
      } else {
        Text("Select a team, or start a new one.")
          .font(Theme.body(.subheadline))
          .foregroundStyle(Theme.textSecondary)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(Theme.canvas)
      }
    }
  }

  private func emptyCanvas(showsLibraryButton: Bool) -> some View {
    VStack(spacing: Theme.Spacing.md) {
      if showsLibraryButton {
        HStack {
          Button {
            libraryOverlayPresented = true
          } label: {
            Image(systemName: "sidebar.leading")
              .font(.system(size: 17, weight: .semibold))
              .foregroundStyle(Theme.accent)
              .frame(width: 44, height: 44)
              .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Team library")
          Spacer()
        }
        .padding(.leading, headerLeadingInset)
        .padding(.trailing, headerTrailingInset)
        .padding(.top, Theme.Spacing.sm)
      }
      Spacer()
      OakBrandMark(size: 48)
      Text("No team open")
        .font(Theme.display(.title3))
      Text("Select a team from the library, or start a new Champions team.")
        .font(Theme.body(.subheadline))
        .foregroundStyle(Theme.textSecondary)
        .multilineTextAlignment(.center)
        .padding(.horizontal, 32)
      Button("New team") { startNewTeam() }
        .buttonStyle(.oakPrimary)
        .accessibilityIdentifier("pad-teams-new-team-canvas")
      Button("Import from Showdown") { panel = .importPaste }
        .buttonStyle(.oakSecondary)
        .accessibilityIdentifier("oak-import-showdown")
      Spacer()
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.canvas)
    .accessibilityIdentifier("pad-team-canvas")
  }

  // MARK: Library

  @ViewBuilder
  private var libraryColumn: some View {
    if let listModel {
      libraryContent(listModel)
    } else {
      ProgressView()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.canvas)
    }
  }

  private func libraryContent(_ model: TeamsListViewModel) -> some View {
    VStack(spacing: 0) {
      HStack(spacing: Theme.Spacing.sm) {
        Text("Teams")
          .font(Theme.display(.headline))
          .foregroundStyle(Theme.textStrong)
          .accessibilityAddTraits(.isHeader)
        Spacer(minLength: 0)
        RegulationChip()
        Button {
          Haptics.tap()
          showAddActions = true
        } label: {
          Image(systemName: "plus")
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(Theme.accent)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Add team")
        .accessibilityIdentifier("oak-add-team")
      }
      .padding(.leading, Theme.Spacing.lg)
      .padding(.trailing, Theme.Spacing.sm)
      .padding(.top, Theme.Spacing.md)
      .padding(.bottom, Theme.Spacing.xs)

      if model.teams.isEmpty && model.archivedTeams.isEmpty {
        if model.isLoading {
          ProgressView()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
          libraryEmpty
        }
      } else {
        libraryList(model)
      }
    }
    .background(Theme.canvas)
    .overlay(alignment: .bottom) {
      if let message = model.errorMessage {
        ErrorBanner(message: message, onDismiss: { model.dismissError() })
          .padding(.horizontal, Theme.Spacing.md)
          .padding(.bottom, Theme.Spacing.sm)
      }
    }
    .accessibilityIdentifier("pad-teams-library")
  }

  private var libraryEmpty: some View {
    VStack(spacing: 12) {
      Text("No teams yet")
        .font(Theme.display(.title3))
      Text("Start a Champions team, or import a Showdown paste.")
        .font(Theme.body(.subheadline))
        .foregroundStyle(Theme.textSecondary)
        .multilineTextAlignment(.center)
        .padding(.horizontal, Theme.Spacing.lg)
      Button("New team") { startNewTeam() }
        .buttonStyle(.oakPrimary)
        .accessibilityIdentifier("pad-teams-new-team-library")
      Button("Import from Showdown") { panel = .importPaste }
        .buttonStyle(.oakSecondary)
        .accessibilityIdentifier("oak-import-showdown")
      Spacer(minLength: 0)
    }
    .padding(.top, Theme.Spacing.xl)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private func libraryList(_ model: TeamsListViewModel) -> some View {
    List {
      if !model.teams.isEmpty {
        Section {
          ForEach(model.teams) { team in
            livingRow(team, model: model)
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
            archivedRow(team, model: model)
          }
        }
      }
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .background(Theme.canvas)
    .refreshable {
      await model.reload()
      await model.reloadArchived()
    }
  }

  private func livingRow(_ team: TeamSummary, model: TeamsListViewModel) -> some View {
    Button {
      openLibraryTeam(team)
    } label: {
      PadTeamLibraryRow(team: team, model: model)
    }
    .buttonStyle(.plain)
    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
      if model.canDelete(team) {
        Button(role: .destructive) {
          Task { await deleteTeam(team) }
        } label: {
          Label("Delete", systemImage: "trash")
        }
      }
    }
    .contextMenu { rowMenu(for: team, model: model) }
    .listRowBackground(team.id == editor?.teamId ? Theme.accentSoft : Theme.surface)
    .listRowSeparatorTint(Theme.separator)
  }

  private func archivedRow(_ team: TeamSummary, model: TeamsListViewModel) -> some View {
    Button {
      openLibraryTeam(team)
    } label: {
      PadTeamLibraryRow(team: team, model: model, archived: true)
    }
    .buttonStyle(.plain)
    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
      Button(role: .destructive) {
        teamPendingDelete = team
      } label: {
        Label("Delete", systemImage: "trash")
      }
    }
    .contextMenu {
      Button(role: .destructive) {
        teamPendingDelete = team
      } label: {
        Label("Delete", systemImage: "trash")
      }
    }
    .listRowBackground(team.id == editor?.teamId ? Theme.accentSoft : Theme.surface)
    .listRowSeparatorTint(Theme.separator)
  }

  @ViewBuilder
  private func rowMenu(for team: TeamSummary, model: TeamsListViewModel) -> some View {
    if model.canEdit(team) {
      Button {
        openLibraryTeam(team)
      } label: {
        Label("Edit", systemImage: "pencil")
      }
    } else {
      Button {
        openLibraryTeam(team)
      } label: {
        Label("View", systemImage: "eye")
      }
    }
    if model.canDuplicate(team) {
      Button {
        Task {
          if let created = await model.duplicate(team) {
            openCreated(created)
          }
        }
      } label: {
        Label("Duplicate", systemImage: "plus.square.on.square")
      }
    }
    if model.canDelete(team) {
      Button(role: .destructive) {
        if team.isArchived {
          teamPendingDelete = team
        } else {
          Task { await deleteTeam(team) }
        }
      } label: {
        Label("Delete", systemImage: "trash")
      }
    }
  }

  private var libraryOverlay: some View {
    ZStack(alignment: .leading) {
      Theme.scrim
        .ignoresSafeArea()
        .onTapGesture { libraryOverlayPresented = false }
        .accessibilityLabel("Dismiss team library")
        .accessibilityAddTraits(.isButton)
      libraryColumn
        .frame(width: PadLayout.chatListMinWidth)
        .frame(maxHeight: .infinity)
        .background(Theme.canvas)
        .transition(.move(edge: .leading))
    }
  }

  private var columnSeparator: some View {
    Rectangle()
      .fill(Theme.separator)
      .frame(width: 1)
  }

  private var rowSeparator: some View {
    Rectangle()
      .fill(Theme.separator)
      .frame(height: 1)
  }

  // MARK: Panels (import / export / auth / add-to-team)

  @ViewBuilder
  private func panelContent(_ panel: PadTeamsPanel) -> some View {
    switch panel {
    case .signIn:
      AuthView(model: AuthViewModel(auth: services.auth, appState: appState))
    case .importPaste:
      if let listModel {
        PadShowdownImportPanel(
          model: listModel,
          onImported: { team in
            openCreated(team)
          },
          onDismiss: { self.panel = nil }
        )
      }
    case .export(let text):
      PadShowdownExportPanel(text: text, onDismiss: { self.panel = nil })
    case .addToTeam(let incoming):
      AddToTeamSheet(
        model: AddToTeamViewModel(
          teams: services.teams,
          isSignedIn: true,
          conversationFormat: .champions,
          incoming: incoming
        ),
        onOpened: { id, slot in
          self.panel = nil
          openTeam(id: id, slotIndex: slot)
        },
        onCancel: { self.panel = nil }
      )
    }
  }

  // MARK: Actions

  private func startNewTeam() {
    Haptics.tap()
    guard let listModel else { return }
    libraryOverlayPresented = false
    replaceEditor(listModel.makeEditor(forNewTeam: .champions), teamId: nil, slotIndex: 0, loads: false)
    shell.select(.teams())
  }

  private func openLibraryTeam(_ summary: TeamSummary) {
    guard let listModel else { return }
    libraryOverlayPresented = false
    replaceEditor(
      listModel.makeEditor(for: summary),
      teamId: summary.id,
      slotIndex: 0,
      loads: true
    )
  }

  private func openCreated(_ team: Team) {
    guard let listModel else { return }
    libraryOverlayPresented = false
    replaceEditor(
      listModel.makeEditor(for: team),
      teamId: team.id,
      slotIndex: 0,
      loads: false
    )
  }

  private func openTeam(id: String, slotIndex: Int?) {
    guard let listModel else { return }
    if let summary = (listModel.teams + listModel.archivedTeams).first(where: { $0.id == id }) {
      replaceEditor(
        listModel.makeEditor(for: summary),
        teamId: id,
        slotIndex: slotIndex ?? 0,
        loads: true
      )
      return
    }
    let placeholder = TeamSummary(
      id: id,
      name: "Team",
      format: .champions,
      memberCount: 0,
      incomplete: false,
      species: [],
      updatedAt: 0
    )
    replaceEditor(
      listModel.makeEditor(for: placeholder),
      teamId: id,
      slotIndex: slotIndex ?? 0,
      loads: true
    )
  }

  private func replaceEditor(
    _ next: TeamEditorViewModel,
    teamId: String?,
    slotIndex: Int,
    loads: Bool
  ) {
    let previous = editor
    editor = next
    selectedSlot = clampedSlot(slotIndex)
    shell.select(.teams(teamId: teamId, slotIndex: selectedSlot))
    Task {
      await previous?.flushSave()
      if loads {
        await next.load()
      } else {
        await next.refreshSprites()
        await next.refreshAllMovepools()
        next.scheduleAnalysis()
      }
      if let destSlot = destinationSlotIndex {
        selectedSlot = clampedSlot(destSlot)
      }
      syncTeamChip()
    }
  }

  private func selectSlot(_ index: Int) {
    guard (0..<PadTeamsChrome.slotCount).contains(index) else { return }
    if let editor, !editor.isReadOnly {
      while editor.members.count <= index && editor.canAddMember {
        editor.addMember()
      }
    }
    selectedSlot = index
    writeSlotToShell()
  }

  private func writeSlotToShell() {
    let teamId = editor?.teamId ?? destinationTeamId
    if case .teams(let existingId, _) = shell.destination, existingId == teamId {
      shell.selectSlot(selectedSlot)
      return
    }
    shell.select(.teams(teamId: teamId, slotIndex: selectedSlot))
  }

  private func clampedSlot(_ index: Int) -> Int {
    min(max(0, index), PadTeamsChrome.slotCount - 1)
  }

  private func openAssistant() {
    guard PadTeamsChrome.assistantOpensCompanion() else { return }
    Task {
      await editor?.flushSave()
      shell.revealCompanion()
      syncTeamChip()
    }
  }

  private func syncTeamChip() {
    guard shell.companionOpen, let editor, let id = editor.teamId else { return }
    shell.setContextChip(
      .team(
        id: id,
        name: teamChipName(editor),
        liveShowdown: PadTeamsChrome.liveShowdown(from: editor)
      )
    )
  }

  private func teamChipName(_ editor: TeamEditorViewModel) -> String {
    let trimmed = editor.name.trimmingCharacters(in: .whitespacesAndNewlines)
    if !trimmed.isEmpty { return trimmed }
    if let saved = editor.savedTeam?.name, !saved.isEmpty { return saved }
    return "Team"
  }

  private func exportTeam() {
    Task {
      guard let paste = await editor?.exportPaste() else { return }
      panel = .export(paste)
    }
  }

  private func deleteTeam(_ team: TeamSummary) async {
    await listModel?.delete(team)
    if editor?.teamId == team.id {
      editor = nil
      selectedSlot = 0
      shell.select(.teams())
    }
  }

  private func consumePendingDestination() {
    switch appState.pendingDestination {
    case let .team(id):
      openTeam(id: id, slotIndex: nil)
      appState.pendingDestination = nil
    case let .teams(query):
      if let query, let match = listModel?.teams.first(where: {
        $0.name.localizedCaseInsensitiveContains(query)
      }) {
        openLibraryTeam(match)
      }
      appState.pendingDestination = nil
    default:
      break
    }
  }

  private func applyShellDestination() {
    guard case .teams(let teamId, let slotIndex) = shell.destination else { return }
    if let slotIndex {
      selectedSlot = clampedSlot(slotIndex)
    }
    guard let teamId else { return }
    if editor?.teamId != teamId {
      openTeam(id: teamId, slotIndex: slotIndex)
    }
  }
}

// MARK: - Centered panels

private enum PadTeamsPanel: Identifiable, Equatable {
  case signIn
  case importPaste
  case export(String)
  case addToTeam(TeamMember)

  var id: String {
    switch self {
    case .signIn: "signIn"
    case .importPaste: "import"
    case .export: "export"
    case .addToTeam(let member): "add-\(member.species ?? "")"
    }
  }
}

/// Import paste as a centered panel (P-TEAM-AC-3.1). Same flow as iPhone
/// `ShowdownImportView`, with an explicit dismiss because this is not a sheet.
private struct PadShowdownImportPanel: View {
  let model: TeamsListViewModel
  var onImported: (Team) -> Void
  var onDismiss: () -> Void

  @State private var paste: String = ""
  @State private var notes: [ImportNote] = []
  @State private var importedTeamName: String?
  @State private var importedMembers: [TeamMember] = []
  @State private var isImporting: Bool = false

  var body: some View {
    NavigationStack {
      Form {
        Section("Showdown paste") {
          TextEditor(text: $paste)
            .font(Theme.mono(.footnote))
            .frame(minHeight: 180)
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)
            .accessibilityLabel("Showdown paste")
          if paste.isEmpty {
            Text("Paste a team exported from Pokémon Showdown.")
              .font(Theme.body(.footnote))
              .foregroundStyle(Theme.textSecondary)
          }
        }

        if let importedTeamName {
          Section {
            Label(
              "Imported \"\(importedTeamName)\" into your Teams.",
              systemImage: "checkmark.seal.fill"
            )
            .foregroundStyle(Theme.success)
          }
        }

        if !importedMembers.isEmpty {
          Section("Parsed team") {
            ForEach(Array(importedMembers.enumerated()), id: \.offset) { index, member in
              Text(member.species.map(TeamBlocksView.titleizeNonNil) ?? "Unknown")
                .font(Theme.body(.footnote))
                .accessibilityLabel("Slot \(index + 1)")
            }
          }
        }

        if !notes.isEmpty {
          Section("Import notes") {
            ForEach(notes) { note in
              Label(note.message, systemImage: "info.circle")
                .font(Theme.body(.footnote))
            }
          }
        }
      }
      .scrollContentBackground(.hidden)
      .background(Theme.canvas)
      .listRowBackground(Theme.surface)
      .navigationTitle("Import team")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarLeading) {
          Button("Cancel", action: onDismiss)
        }
        ToolbarItem(placement: .topBarTrailing) {
          if isImporting {
            ProgressView()
          } else if importedTeamName == nil {
            Button("Import") {
              Task { await runImport() }
            }
            .fontWeight(.semibold)
            .disabled(paste.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
          } else {
            Button("Done", action: onDismiss)
              .fontWeight(.semibold)
          }
        }
      }
      .overlay(alignment: .bottom) {
        if let message = model.errorMessage {
          ErrorBanner(message: message, onDismiss: { model.dismissError() })
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.bottom, Theme.Spacing.sm)
        }
      }
    }
    .oakEnamelNav()
  }

  private func runImport() async {
    isImporting = true
    defer { isImporting = false }
    guard let result = await model.importPaste(paste, format: .champions) else { return }
    notes = result.notes
    importedTeamName = result.team.name
    importedMembers = result.team.members
    onImported(result.team)
    if result.notes.isEmpty {
      onDismiss()
    }
  }
}

/// Export paste as a centered panel (P-TEAM-AC-3.2).
private struct PadShowdownExportPanel: View {
  let text: String
  var onDismiss: () -> Void

  var body: some View {
    NavigationStack {
      ScrollView {
        Text(text)
          .font(Theme.mono(.footnote))
          .frame(maxWidth: .infinity, alignment: .leading)
          .textSelection(.enabled)
          .padding()
      }
      .navigationTitle("Showdown export")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarLeading) {
          Button("Copy") { UIPasteboard.general.string = text }
        }
        ToolbarItem(placement: .topBarTrailing) {
          ShareLink(item: text) {
            Label("Share", systemImage: "square.and.arrow.up")
          }
        }
      }
      .safeAreaInset(edge: .bottom) {
        Button("Done", action: onDismiss)
          .buttonStyle(.oakPrimary)
          .padding(.horizontal, Theme.Spacing.lg)
          .padding(.vertical, Theme.Spacing.sm)
          .frame(maxWidth: .infinity)
          .background(Theme.canvas)
      }
    }
    .oakEnamelNav()
  }
}

// MARK: - Library row (copied from TeamsListView; that file is not in Own)

private struct PadTeamLibraryRow: View {
  let team: TeamSummary
  let model: TeamsListViewModel
  var archived: Bool = false

  var body: some View {
    HStack(spacing: 12) {
      slotIndicator
      VStack(alignment: .leading, spacing: 4) {
        Text(team.name)
          .font(Theme.body(.body))
          .lineLimit(1)
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

  private var slotIndicator: some View {
    HStack(spacing: 3) {
      ForEach(0..<PadTeamsChrome.slotCount, id: \.self) { slot in
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

  private func species(at slot: Int) -> String? {
    slot < team.species.count ? team.species[slot] : nil
  }

  private var formatLabel: String {
    archived ? "Archived · \(team.format.shortLabel)" : "Champions"
  }

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
