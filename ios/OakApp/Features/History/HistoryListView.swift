import SwiftUI

/// The saved-conversation list (history-and-teams.md M-HIST-US-2; M-UI-US-4): a
/// searchable, format-filterable list of conversations with native list patterns —
/// swipe actions, context menus, and pull-to-refresh (M-AC-H2.5).
///
/// **Content-only / signed-in only.** It does not own a `NavigationStack` — the Chat
/// tab's signed-in home embeds it inside its own stack (titled "Chats") and supplies
/// the New-Chat toolbar button. It is shown only when signed in (M-BR-H1), so there
/// is no guest branch here; a guest gets the single-thread chat instead. The view
/// owns its ``HistoryListViewModel`` (`@State`) and drives it; all logic lives in the
/// view model. Tapping a row hands the conversation back to the Chat tab via
/// ``onSelect``, which pushes the thread route (load detail + resume into chat).
struct ConversationListView: View {
  @State private var model: HistoryListViewModel
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// Called when a conversation row is tapped — the Chat tab pushes the thread
  /// route, which loads the detail and resumes it into chat (M-AC-H3.1).
  private let onSelect: (ConversationSummary) -> Void

  /// The conversation currently being renamed (drives the rename alert).
  @State private var renameTarget: ConversationSummary?
  @State private var renameText: String = ""

  init(
    model: HistoryListViewModel,
    onSelect: @escaping (ConversationSummary) -> Void
  ) {
    _model = State(initialValue: model)
    self.onSelect = onSelect
  }

  var body: some View {
    @Bindable var model = model
    listContent
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          formatFilterMenu
        }
      }
      .searchable(text: $model.searchQuery, prompt: "Search conversations")
      .onSubmit(of: .search) {
        Task { await model.search() }
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
          Section("Pinned") {
            ForEach(pinnedConversations) { conversation in
              conversationRow(conversation)
            }
          }
        }
        ForEach(otherConversations) { conversation in
          conversationRow(conversation)
        }
      }
      .listStyle(.plain)
      .animation(reduceMotion ? nil : Theme.Motion.smooth, value: model.conversations)
      .refreshable { await model.reload() }
      .overlay(alignment: .bottom) {
        if let message = model.errorMessage {
          errorBanner(message)
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
    Button {
      onSelect(conversation)
    } label: {
      ConversationRow(conversation: conversation)
    }
    .buttonStyle(.plain)
    .listRowBackground(conversation.pinned ? Theme.accent.opacity(0.05) : nil)
    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
      Button(role: .destructive) {
        Task { await model.delete(conversation) }
      } label: {
        Label("Delete", systemImage: "trash")
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
      Button(role: .destructive) {
        Task { await model.delete(conversation) }
      } label: {
        Label("Delete", systemImage: "trash")
      }
    }
  }

  /// Six skeleton rows shown while the first page is loading, replacing the
  /// centered spinner (loading state communicates row shape, not just activity).
  private var skeletonList: some View {
    List {
      ForEach(0..<6, id: \.self) { _ in
        SkeletonListRow()
      }
    }
    .listStyle(.plain)
  }

  /// Exactly the web history sidebar's three filter chips (`ConversationList.tsx`
  /// `FILTERS`) — **not** a six-way format filter (that's the Teams list's job;
  /// see `TeamsListView`). Conversation history stays scoped to the two most
  /// common formats for now.
  private var formatFilterMenu: some View {
    Menu {
      filterButton(title: "All", format: nil)
      filterButton(title: "Gen 9", format: .scarletViolet)
      filterButton(title: "Champions", format: .champions)
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
  }

  private var searchActive: Bool {
    !model.searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      || model.formatFilter != nil
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

/// One conversation row: a leading format medallion, title, a format tag, and the
/// last-active time. Color is never the sole signal — the format is also shown as
/// text (M-AC-UI9.3 / conventions.md).
private struct ConversationRow: View {
  let conversation: ConversationSummary

  var body: some View {
    HStack(spacing: 12) {
      FormatMedallion(format: conversation.format)
      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 6) {
          if conversation.pinned {
            Image(systemName: "pin.fill")
              .font(.caption)
              .foregroundStyle(Theme.accent)
              .accessibilityLabel("Pinned")
          }
          Text(conversation.title)
            .font(Theme.body(.body).weight(.medium))
            .lineLimit(1)
        }
        HStack(spacing: 6) {
          Text(formatLabel)
          Text("·")
          Text(updatedAt, format: .relative(presentation: .named))
        }
        .font(.caption)
        .foregroundStyle(.secondary)
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, 4)
    .contentShape(Rectangle())
  }

  private var formatLabel: String {
    conversation.format.shortLabel
  }

  private var updatedAt: Date {
    Date(timeIntervalSince1970: Double(conversation.updatedAt) / 1000)
  }
}

/// The leading 34pt format medallion: Champions reads as a sunflower `crown.fill`
/// on a sunflower-tinted disc; every other scope (Gen 9 and the mainline
/// gen-scope formats, plus an unrecognized future format) shares an azure
/// `leaf.fill` disc — deliberately not a ball motif (constraint 1), and
/// deliberately one shared "standard" treatment rather than a bespoke icon per
/// generation (the format text label alongside it, not the icon, carries which
/// generation it actually is). Decorative only (M-AC-UI9.3), so hidden from
/// VoiceOver.
private struct FormatMedallion: View {
  let format: Format

  var body: some View {
    Circle()
      .fill(tint.opacity(0.12))
      .frame(width: 34, height: 34)
      .overlay {
        Image(systemName: iconName)
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(tint)
      }
      .accessibilityHidden(true)
  }

  private var iconName: String {
    switch format {
    case .champions: return "crown.fill"
    case .scarletViolet, .gen5, .gen6, .gen7, .gen8, .unknown: return "leaf.fill"
    }
  }

  private var tint: Color {
    switch format {
    case .champions: return Theme.sunflower
    case .scarletViolet, .gen5, .gen6, .gen7, .gen8, .unknown: return Theme.azure
    }
  }
}

#if DEBUG
/// A preview-only ``HistoryService`` returning a small static list without the
/// network, so the canvas renders the conversation list. Confined to this file.
private struct PreviewHistoryService: HistoryService {
  func list(query: String?, format: Format?) async throws -> [ConversationSummary] {
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
}

#Preview("Conversations") {
  NavigationStack {
    ConversationListView(
      model: HistoryListViewModel(history: PreviewHistoryService()),
      onSelect: { _ in }
    )
    .navigationTitle("Chats")
  }
}
#endif
