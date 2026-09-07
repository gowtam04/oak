import SwiftUI

/// The saved-conversation list (history-and-teams.md M-HIST-US-2; M-UI-US-4): a
/// searchable, format-filterable list of conversations with native list patterns —
/// swipe actions, context menus, and pull-to-refresh (M-AC-H2.5).
///
/// **Content-only / signed-in only.** It does not own a `NavigationStack` — the Chat
/// tab's signed-in home embeds it inside its own stack (titled "Chats") and supplies
/// the inline title. It is shown only when signed in (M-BR-H1), so there is no guest
/// branch here; a guest gets the single-thread chat instead. The view owns its
/// ``HistoryListViewModel`` (`@State`) and drives it; all logic lives in the view
/// model. Tapping a row hands the conversation back to the Chat tab via ``onSelect``,
/// which pushes the thread route (load detail + resume into chat); ``onNewChat`` (the
/// floating action disc) starts a fresh thread.
///
/// Chrome: a custom **paper search pill** (not `.searchable`) pinned above the
/// list, a **red enamel new-chat FAB** bottom-trailing, dense paper rows (title
/// + mono meta), an **Open stamp** marking the last-opened thread (never a red
/// left rail), and a **filter cue** when a format filter is on.
struct ConversationListView: View {
  @State private var model: HistoryListViewModel
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// Called when a conversation row is tapped — the Chat tab pushes the thread
  /// route, which loads the detail and resumes it into chat (M-AC-H3.1).
  private let onSelect: (ConversationSummary) -> Void

  /// Starts a new thread — the FAB action (the Chat tab pushes `.new`). Defaults to
  /// a no-op so previews/tests can omit it.
  private let onNewChat: () -> Void

  /// The conversation currently being renamed (drives the rename alert).
  @State private var renameTarget: ConversationSummary?
  @State private var renameText: String = ""

  /// The last conversation opened from this list, marked as the active row when the
  /// user returns (web `[data-active]` parity). In-memory only — no persistence.
  @State private var lastOpenedId: String?

  @State private var showingBulkDeleteConfirm = false
  @State private var showingNewFolder = false
  @State private var newFolderName = ""
  @State private var folderToDelete: ConversationFolder?
  @State private var folderToRename: ConversationFolder?
  @State private var folderRenameText = ""

  /// Drives the custom search pill's focus grammar (poke-red border + halo).
  @FocusState private var searchFocused: Bool

  init(
    model: HistoryListViewModel,
    onSelect: @escaping (ConversationSummary) -> Void,
    onNewChat: @escaping () -> Void = {}
  ) {
    _model = State(initialValue: model)
    self.onSelect = onSelect
    self.onNewChat = onNewChat
  }

  var body: some View {
    @Bindable var model = model
    VStack(spacing: 0) {
      searchField($model.searchQuery)
      includeArchivedToggle
      if let filter = model.formatFilter {
        activeFilterPill(filter)
      }
      listContent
    }
    .background(Theme.canvas)
    .overlay(alignment: .bottomTrailing) { newChatFAB }
    .toolbar {
      ToolbarItem(placement: .topBarLeading) {
        organizeMenu
      }
      ToolbarItem(placement: .topBarTrailing) {
        HStack {
          Button(model.isSelecting ? "Done" : "Select") {
            model.isSelecting.toggle()
            if !model.isSelecting { /* selection cleared on Done via bulk */ }
          }
          formatFilterMenu
        }
      }
    }
    .safeAreaInset(edge: .bottom) {
      if model.isSelecting, !model.selectedIds.isEmpty {
        bulkBar
      }
    }
    .alert("Delete conversations?", isPresented: $showingBulkDeleteConfirm) {
      Button("Delete", role: .destructive) {
        Task { await model.bulk(.delete) }
      }
      Button("Cancel", role: .cancel) {}
    } message: {
      Text("This permanently removes \(model.selectedIds.count) conversation(s).")
    }
    .alert("New folder", isPresented: $showingNewFolder) {
      TextField("Name", text: $newFolderName)
      Button("Create") {
        let name = newFolderName
        newFolderName = ""
        Task { await model.createFolder(named: name) }
      }
      Button("Cancel", role: .cancel) { newFolderName = "" }
    }
    .alert("Rename folder", isPresented: Binding(
      get: { folderToRename != nil },
      set: { if !$0 { folderToRename = nil } }
    )) {
      TextField("Name", text: $folderRenameText)
      Button("Save") {
        if let folder = folderToRename {
          let name = folderRenameText
          Task { await model.renameFolder(folder, to: name) }
        }
        folderToRename = nil
      }
      Button("Cancel", role: .cancel) { folderToRename = nil }
    }
    .alert("Delete folder?", isPresented: Binding(
      get: { folderToDelete != nil },
      set: { if !$0 { folderToDelete = nil } }
    )) {
      Button("Delete folder", role: .destructive) {
        if let folder = folderToDelete {
          Task { await model.deleteFolder(folder) }
        }
        folderToDelete = nil
      }
      Button("Cancel", role: .cancel) { folderToDelete = nil }
    } message: {
      Text("Conversations in this folder become unfiled. They are not deleted.")
    }
    // Initial load; pull-to-refresh and search/filter changes re-fetch on their own.
    .task { await model.reload() }
    .alert(
      "Rename conversation",
      isPresented: renameBinding,
      presenting: renameTarget
    ) { conversation in
      TextField("Title", text: $renameText)
      Button("Save") {
        let title = renameText
        Task { await model.rename(conversation, to: title) }
      }
      Button("Cancel", role: .cancel) {}
    }
  }

  // MARK: Search field (custom sunken pill — replaces `.searchable`, §5.4)

  /// A paper search pill: `--surface` fill + hairline at rest, **poke-red**
  /// focus border + 18% red halo, a leading magnifier, and a trailing clear
  /// button. Wired to the same `searchQuery`/`search()` behavior as the old
  /// `.searchable`, submitting on return.
  private func searchField(_ query: Binding<String>) -> some View {
    HStack(spacing: Theme.Spacing.sm) {
      Image(systemName: "magnifyingglass")
        .foregroundStyle(Theme.textMuted)
        .accessibilityHidden(true)
      TextField("Search conversations", text: query)
        .font(Theme.body(.callout))
        .foregroundStyle(Theme.textPrimary)
        .tint(Theme.accent)
        .submitLabel(.search)
        .focused($searchFocused)
        .autocorrectionDisabled()
        .textInputAutocapitalization(.never)
        .onSubmit { Task { await model.search() } }
      if !query.wrappedValue.isEmpty {
        Button {
          query.wrappedValue = ""
          Task { await model.search() }
        } label: {
          Image(systemName: "xmark.circle.fill")
            .foregroundStyle(Theme.textMuted)
        }
        .accessibilityLabel("Clear search")
      }
    }
    .padding(.horizontal, Theme.Spacing.md)
    .padding(.vertical, 10)
    .background(Theme.surface, in: Capsule())
    .overlay {
      Capsule().strokeBorder(searchFocused ? Theme.accent : Theme.border, lineWidth: searchFocused ? 1.5 : 1)
    }
    .shadow(color: searchFocused ? Theme.accent.opacity(0.18) : .clear, radius: 4)
    .padding(.horizontal, Theme.Spacing.lg)
    .padding(.top, Theme.Spacing.sm)
    .padding(.bottom, model.formatFilter == nil ? Theme.Spacing.sm : Theme.Spacing.xs)
    .animation(reduceMotion ? nil : Theme.Motion.snappy, value: searchFocused)
  }

  /// Search-only opt-in to include archived threads (ORG-AC-2.4).
  @ViewBuilder
  private var includeArchivedToggle: some View {
    if !(model.searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) {
      Toggle("Include archived", isOn: $model.includeArchivedInSearch)
        .font(Theme.body(.caption))
        .padding(.horizontal, Theme.Spacing.lg)
        .padding(.bottom, Theme.Spacing.xs)
        .onChange(of: model.includeArchivedInSearch) { _, _ in
          Task { await model.search() }
        }
    }
  }

  // MARK: Active filter cue (dismissible scope pill, §5.4)

  /// A dismissible pill naming the active format filter; tapping the ✕ clears it.
  /// The toolbar filter icon is also tinted/filled while a filter is on.
  private func activeFilterPill(_ format: Format) -> some View {
    HStack(spacing: Theme.Spacing.xs) {
      Text(format.shortLabel)
        .instrumentLabel(.caption2)
        .foregroundStyle(Theme.accent)
      Button {
        Task { await model.setFormatFilter(nil) }
      } label: {
        Image(systemName: "xmark")
          .font(.system(size: 9, weight: .bold))
          .foregroundStyle(Theme.accent)
      }
      .accessibilityLabel("Clear \(format.shortLabel) filter")
    }
    .padding(.horizontal, Theme.Spacing.sm)
    .padding(.vertical, 5)
    .background(Theme.accentSoft, in: Capsule())
    .overlay(Capsule().strokeBorder(Theme.accent.opacity(0.35), lineWidth: 1))
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, Theme.Spacing.lg)
    .padding(.bottom, Theme.Spacing.sm)
    .accessibilityElement(children: .combine)
    .accessibilityLabel("Filtered to \(format.shortLabel)")
  }

  // MARK: New-chat FAB (§5.4)

  /// Enamel 56pt new-chat disc, bottom-trailing above the tab bar — a
  /// one-handed reach (replaces the top-right toolbar compose button).
  private var newChatFAB: some View {
    Button {
      Haptics.tap()
      onNewChat()
    } label: {
      Image(systemName: "square.and.pencil")
        .font(.system(size: 22, weight: .semibold))
        .foregroundStyle(Theme.onRed)
        .frame(width: 56, height: 56)
        .background(Theme.accent, in: Circle())
        .oakShadow(.raised)
    }
    .buttonStyle(FloatingActionButtonStyle(reduceMotion: reduceMotion))
    .padding(.trailing, Theme.Spacing.lg)
    .padding(.bottom, Theme.Spacing.lg)
    .accessibilityLabel("New chat")
  }

  // MARK: List

  @ViewBuilder
  private var listContent: some View {
    if model.conversations.isEmpty {
      if model.isLoading {
        skeletonList
      } else {
        emptyState
      }
    } else {
      List {
        if !pinnedConversations.isEmpty {
          Section {
            ForEach(pinnedConversations) { conversation in
              conversationRow(conversation)
            }
          } header: {
            Text("Pinned").instrumentLabel().foregroundStyle(Theme.textMuted)
          }
        }
        ForEach(otherConversations) { conversation in
          conversationRow(conversation)
        }
      }
      .listStyle(.plain)
      .scrollContentBackground(.hidden)
      .background(Theme.canvas)
      .animation(reduceMotion ? nil : Theme.Motion.smooth, value: model.conversations)
      .refreshable { await model.reload() }
      .overlay(alignment: .bottom) {
        if let message = model.errorMessage {
          ErrorBanner(message: message, onDismiss: { model.dismissError() })
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.bottom, Theme.Spacing.sm)
        }
      }
    }
  }

  /// The already-loaded array split into pinned/unpinned for the "Pinned" section
  /// grouping — a pure presentation reshape, no view-model change.
  private var pinnedConversations: [ConversationSummary] {
    model.conversations.filter(\.pinned)
  }

  private var otherConversations: [ConversationSummary] {
    model.conversations.filter { !$0.pinned }
  }

  /// One row's full interaction surface (tap, swipe actions, context menu),
  /// factored out so both the "Pinned" section and the main list share it.
  @ViewBuilder
  private func conversationRow(_ conversation: ConversationSummary) -> some View {
    // Active = last-opened thread: poke-red-soft paper row + Open stamp.
    // Never a red left selection rail. Pinned is still the pin glyph only.
    let isActive = conversation.id == lastOpenedId
    Button {
      if model.isSelecting {
        model.toggleSelected(conversation.id)
      } else {
        lastOpenedId = conversation.id
        onSelect(conversation)
      }
    } label: {
      HStack {
        if model.isSelecting {
          Image(systemName: model.selectedIds.contains(conversation.id) ? "checkmark.circle.fill" : "circle")
            .foregroundStyle(Theme.accent)
        }
        ConversationRow(conversation: conversation, isOpen: isActive)
      }
    }
    .buttonStyle(.plain)
    .listRowInsets(
      EdgeInsets(
        top: Theme.Spacing.xs,
        leading: Theme.Spacing.lg,
        bottom: Theme.Spacing.xs,
        trailing: Theme.Spacing.lg
      )
    )
    .listRowBackground(
      Group {
        if isActive {
          RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
            .fill(Theme.accentSoft)
            .overlay {
              RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                .strokeBorder(Theme.accent.opacity(0.35), lineWidth: 1)
            }
            .padding(.vertical, 2)
        } else {
          Theme.surface
        }
      }
    )
    .listRowSeparatorTint(Theme.separator)
    .listRowSeparator(isActive ? .hidden : .automatic)
    // Separator aligned to the text, not the row edge.
    .alignmentGuide(.listRowSeparatorLeading) { _ in Theme.Spacing.lg }
    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
      Button(role: .destructive) {
        Task { await model.delete(conversation) }
      } label: {
        Label("Delete", systemImage: "trash")
      }
      Button {
        Task { await model.archive(conversation) }
      } label: {
        Label(conversation.archived ? "Unarchive" : "Archive", systemImage: "archivebox")
      }
    }
    .swipeActions(edge: .leading) {
      Button {
        Task { await model.togglePin(conversation) }
      } label: {
        Label(
          conversation.pinned ? "Unpin" : "Pin",
          systemImage: conversation.pinned ? "pin.slash" : "pin"
        )
      }
      .tint(Theme.accent)
    }
    .contextMenu {
      Button {
        renameText = conversation.title
        renameTarget = conversation
      } label: {
        Label("Rename", systemImage: "pencil")
      }
      Button {
        Task { await model.togglePin(conversation) }
      } label: {
        Label(
          conversation.pinned ? "Unpin" : "Pin",
          systemImage: conversation.pinned ? "pin.slash" : "pin"
        )
      }
      Button {
        Task { await model.archive(conversation) }
      } label: {
        Label(conversation.archived ? "Unarchive" : "Archive", systemImage: "archivebox")
      }
      Menu("Move to folder") {
        Button("Unfiled") {
          Task { await model.move(conversation, to: nil) }
        }
        ForEach(model.folders) { folder in
          Button(folder.name) {
            Task { await model.move(conversation, to: folder.id) }
          }
        }
      }
      Menu("Export") {
        Button("Markdown") {
          Task { await export(conversation, as: .markdown) }
        }
        Button("PDF") {
          Task { await export(conversation, as: .pdf) }
        }
      }
      Button(role: .destructive) {
        Task { await model.delete(conversation) }
      } label: {
        Label("Delete", systemImage: "trash")
      }
    }
  }

  private var organizeMenu: some View {
    Menu {
      Button("All") { Task { await model.showAll() } }
      Button("Unfiled") { Task { await model.showUnfiled() } }
      ForEach(model.folders) { folder in
        Button(folder.name) { Task { await model.showFolder(folder.id) } }
      }
      Button("Archive") { Task { await model.showArchive() } }
      Divider()
      Button("New folder") { showingNewFolder = true }
      if let current = model.folders.first(where: { $0.id == model.folderFilter }) {
        Button("Rename “\(current.name)”") {
          folderRenameText = current.name
          folderToRename = current
        }
        Button("Delete “\(current.name)”", role: .destructive) {
          folderToDelete = current
        }
      }
    } label: {
      Label(
        FolderSupport.filterLabel(
          showingArchive: model.showingArchive,
          folderFilter: model.folderFilter,
          folders: model.folders
        ),
        systemImage: "folder"
      )
    }
  }

  private var bulkBar: some View {
    HStack {
      Button("Archive") { Task { await model.bulk(model.showingArchive ? .unarchive : .archive) } }
      Menu("Move") {
        Button("Unfiled") { Task { await model.bulk(.move, folderId: nil) } }
        ForEach(model.folders) { folder in
          Button(folder.name) { Task { await model.bulk(.move, folderId: folder.id) } }
        }
      }
      Spacer()
      Button("Delete", role: .destructive) { showingBulkDeleteConfirm = true }
    }
    .padding()
    .background(Theme.surface)
    .overlay(alignment: .top) {
      Rectangle().fill(Theme.separator).frame(height: 1)
    }
  }

  private func export(_ conversation: ConversationSummary, as format: ConversationExportFormat) async {
    guard let url = await model.export(conversation, as: format) else { return }
    SystemShare.present(items: [url])
  }

  /// Eight skeleton rows shown while the first page is loading, replacing the
  /// centered spinner (loading state communicates row shape, not just activity).
  private var skeletonList: some View {
    List {
      ForEach(0..<8, id: \.self) { _ in
        SkeletonListRow()
          .listRowBackground(Theme.surface)
      }
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .background(Theme.canvas)
  }

  /// Format filter spanning every known scope (`Format.knownCases`) — mirrors the
  /// Teams list's filter and `FORMATS` in full so every conversation scope is
  /// reachable from the history list. The icon fills + tints accent while a filter
  /// is active (paired with the dismissible pill — never color alone).
  private var formatFilterMenu: some View {
    Menu {
      filterButton(title: "All", format: nil)
      ForEach(Format.knownCases, id: \.self) { format in
        filterButton(title: format.shortLabel, format: format)
      }
    } label: {
      Label(
        "Filter",
        systemImage: model.formatFilter == nil
          ? "line.3.horizontal.decrease.circle"
          : "line.3.horizontal.decrease.circle.fill"
      )
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

  // MARK: Empty / error states

  private var emptyState: some View {
    VStack(spacing: 12) {
      OakBrandMark(size: 64)
      Text(searchActive ? "No matches" : "No conversations yet")
        .font(Theme.display(.title3))
      Text(
        searchActive
          ? "No saved conversations match your search."
          : "Conversations you have with Oak are saved here automatically."
      )
      .font(Theme.body(.subheadline))
      .foregroundStyle(Theme.textSecondary)
      .multilineTextAlignment(.center)
      .padding(.horizontal, 32)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.canvas)
  }

  private var searchActive: Bool {
    !model.searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      || model.formatFilter != nil
  }

  // MARK: Rename alert binding

  /// A bool binding that mirrors `renameTarget != nil` so the alert presents while a
  /// target is set and clears it on dismiss.
  private var renameBinding: Binding<Bool> {
    Binding(
      get: { renameTarget != nil },
      set: { if !$0 { renameTarget = nil } }
    )
  }
}

/// The floating-action-disc press style: a 0.94 scale-down while held, springing with
/// `Theme.Motion.snappy`. Scale is dropped under Reduce Motion (feedback stays as the
/// opacity dim).
private struct FloatingActionButtonStyle: ButtonStyle {
  let reduceMotion: Bool

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .scaleEffect(configuration.isPressed && !reduceMotion ? 0.94 : 1)
      .opacity(configuration.isPressed ? 0.92 : 1)
      .animation(Theme.Motion.snappy, value: configuration.isPressed)
  }
}

/// One conversation row: the title and a mono meta line ("GEN 9 · 19H AGO").
/// When `isOpen`, an **Open** stamp trails (never a red rail). Color is never
/// the sole signal — the format is shown as text (M-AC-UI9.3).
private struct ConversationRow: View {
  let conversation: ConversationSummary
  /// True when this is the last-opened / active thread — shows the OPEN stamp.
  var isOpen: Bool = false

  var body: some View {
    HStack(spacing: Theme.Spacing.sm) {
      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 5) {
          if conversation.pinned {
            Image(systemName: "pin.fill")
              .font(.caption2)
              .foregroundStyle(Theme.accent)
              .accessibilityLabel("Pinned")
          }
          Text(conversation.title)
            .font(Theme.body(.subheadline, weight: .semibold))
            .foregroundStyle(Theme.textStrong)
            .lineLimit(1)
            .truncationMode(.tail)
        }
        Text(metaLine)
          .instrumentLabel(.caption2)
          .foregroundStyle(Theme.textMuted)
      }
      Spacer(minLength: 0)
      if isOpen {
        Text("Open")
          .instrumentLabel(.caption2)
          .foregroundStyle(Theme.accent)
          .padding(.horizontal, 7)
          .padding(.vertical, 3)
          .background(
            Theme.accentSoft,
            in: RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
          )
          .overlay {
            RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
              .strokeBorder(Theme.accent.opacity(0.35), lineWidth: 1)
          }
          .accessibilityLabel("Open")
      }
    }
    .padding(.vertical, 10)
    .contentShape(Rectangle())
  }

  /// "GEN 9 · 19H AGO" — the uppercase scope short-label (reusing `Format.shortLabel`,
  /// never a new user-facing name) and an abbreviated relative time; `instrumentLabel`
  /// uppercases the whole line.
  private var metaLine: String {
    let rel = updatedAt.formatted(.relative(presentation: .numeric, unitsStyle: .narrow))
    return "\(conversation.format.shortLabel) · \(rel)"
  }

  private var updatedAt: Date {
    Date(timeIntervalSince1970: Double(conversation.updatedAt) / 1000)
  }
}

#if DEBUG
/// A preview-only ``HistoryService`` returning a small static list without the
/// network, so the canvas renders the conversation list. Confined to this file.
private struct PreviewHistoryService: HistoryService {
  func list(
    query: String?,
    format: Format?,
    folderId: String?,
    archived: Bool?,
    includeArchived: Bool
  ) async throws -> [ConversationSummary] {
    [
      ConversationSummary(
        id: "1", title: "Garchomp's best moveset",
        format: .scarletViolet, pinned: true, updatedAt: 1_700_000_000_000
      ),
      ConversationSummary(
        id: "2", title: "Champions: Miraidon counters",
        format: .champions, pinned: false, updatedAt: 1_699_900_000_000
      ),
    ]
  }
  func get(id: String) async throws -> ConversationDetail {
    ConversationDetail(id: id, title: "Conversation", format: .scarletViolet, pinned: false, turns: [])
  }
  func rename(id: String, title: String) async throws {}
  func setPinned(id: String, pinned: Bool) async throws {}
  func delete(id: String) async throws {}
  func importGuestThread(sessionId: String, format: Format, turns: [ChatTurn]) async throws -> String? { nil }
  func listFolders() async throws -> [ConversationFolder] { [] }
  func createFolder(name: String) async throws -> ConversationFolder {
    ConversationFolder(id: "f1", name: name, createdAt: 0)
  }
  func renameFolder(id: String, name: String) async throws {}
  func deleteFolder(id: String) async throws {}
  func setArchived(id: String, archived: Bool) async throws {}
  func setFolder(id: String, folderId: String?) async throws {}
  func bulkUpdate(ids: [String], action: BulkConversationAction, folderId: String?) async throws -> BulkUpdateResponse {
    BulkUpdateResponse(updated: ids, skipped: [])
  }
  func setTurnPinned(conversationId: String, messageId: String, pinned: Bool) async throws -> [String] { [] }
  func fork(conversationId: String, throughMessageId: String) async throws -> ForkResponse {
    ForkResponse(id: "fork", title: "Preview (fork)")
  }
  func exportConversation(id: String, format: ConversationExportFormat) async throws -> Data { Data() }
}

#Preview("Conversations") {
  NavigationStack {
    ConversationListView(
      model: HistoryListViewModel(history: PreviewHistoryService()),
      onSelect: { _ in }
    )
    .navigationTitle("Chats")
    .navigationBarTitleDisplayMode(.inline)
  }
  .oakEnamelNav()
}
#endif
