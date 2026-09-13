import SwiftUI

/// Leading Chat list column (P-CHAT-US-1). Signed-in: ``HistoryListViewModel``
/// plus conversation rows copied from iPhone ``ConversationListView``. Guest:
/// sign-in copy, not a fake empty history (P-CHAT-AC-1.5).
struct PadConversationListColumn: View {
  var chatModel: ChatViewModel
  var onNewConversation: () -> Void
  var onSignIn: () -> Void
  var onDidSelect: (() -> Void)? = nil
  var onCollapse: (() -> Void)? = nil
  /// Destinations reveal sits on this column when the enamel sidebar is
  /// hidden (`PadLayout.overlayControlInset`); otherwise the usual gutter.
  var headerLeadingInset: CGFloat = Theme.Spacing.lg

  @Environment(\.services) private var services
  @Environment(AppState.self) private var appState
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  @State private var listModel: HistoryListViewModel?
  @State private var renameTarget: ConversationSummary?
  @State private var renameText = ""
  @State private var loadError: String?
  @FocusState private var searchFocused: Bool

  private var isSignedIn: Bool {
    if case .signedIn = appState.authState { return true }
    return false
  }

  var body: some View {
    Group {
      if PadChatColumns.listShowsSignIn(isSignedIn: isSignedIn) {
        guestSignIn
      } else if let listModel {
        signedInList(listModel)
      } else {
        ProgressView()
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(Theme.canvas)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.canvas)
    .task(id: isSignedIn) {
      guard isSignedIn else {
        listModel = nil
        return
      }
      if listModel == nil {
        listModel = HistoryListViewModel(history: services.history)
      }
      await listModel?.reload()
    }
    .onChange(of: chatModel.sessionId) { _, _ in
      guard isSignedIn else { return }
      Task { await listModel?.reload() }
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("pad-conversation-list")
  }

  // MARK: Guest (P-CHAT-AC-1.5)

  private var guestSignIn: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.md) {
      header
      Image(systemName: "icloud")
        .font(.system(size: 22, weight: .medium))
        .foregroundStyle(Theme.textSecondary)
        .accessibilityHidden(true)
        .padding(.horizontal, Theme.Spacing.lg)
      Text("Sign in to save your conversations")
        .font(Theme.display(.title3))
        .foregroundStyle(Theme.textStrong)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, Theme.Spacing.lg)
      Button("Sign in", action: onSignIn)
        .font(Theme.display(.body, weight: .semibold))
        .buttonStyle(.borderless)
        .tint(Theme.accent)
        .padding(.horizontal, Theme.Spacing.lg)
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Theme.canvas)
  }

  // MARK: Signed-in list

  private func signedInList(_ model: HistoryListViewModel) -> some View {
    let bindable = Bindable(model)
    return VStack(spacing: 0) {
      header
      searchField(bindable.searchQuery)
      if let loadError {
        Text(loadError)
          .font(Theme.body(.caption))
          .foregroundStyle(Theme.danger)
          .padding(.horizontal, Theme.Spacing.lg)
          .padding(.bottom, Theme.Spacing.xs)
      }
      listContent(model)
    }
    .background(Theme.canvas)
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

  private var header: some View {
    HStack(spacing: Theme.Spacing.sm) {
      Text("Chats")
        .font(Theme.display(.headline))
        .foregroundStyle(Theme.textStrong)
        .accessibilityAddTraits(.isHeader)
      Spacer(minLength: 0)
      if let onCollapse {
        Button {
          Haptics.tap()
          onCollapse()
        } label: {
          Image(systemName: "rectangle.split.1x2")
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(Theme.accent)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .hoverEffect(.highlight)
        .accessibilityLabel("Collapse conversations")
        .accessibilityIdentifier("pad-chat-list-collapse")
      }
      Button {
        Haptics.tap()
        onNewConversation()
      } label: {
        Label("New conversation", systemImage: "square.and.pencil")
          .labelStyle(.iconOnly)
      }
      .accessibilityLabel("New conversation")
    }
    .padding(.leading, headerLeadingInset)
    .padding(.trailing, Theme.Spacing.lg)
    .padding(.top, Theme.Spacing.md)
    .padding(.bottom, Theme.Spacing.xs)
  }

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
        .onSubmit { Task { await listModel?.search() } }
      if !query.wrappedValue.isEmpty {
        Button {
          query.wrappedValue = ""
          Task { await listModel?.search() }
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
    .padding(.horizontal, Theme.Spacing.md)
    .padding(.bottom, Theme.Spacing.sm)
  }

  @ViewBuilder
  private func listContent(_ model: HistoryListViewModel) -> some View {
    if model.conversations.isEmpty {
      if model.isLoading {
        ProgressView()
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(Theme.canvas)
      } else {
        VStack(spacing: Theme.Spacing.sm) {
          Text(searchActive(model) ? "No matches" : "No conversations yet")
            .font(Theme.display(.title3))
          Text(
            searchActive(model)
              ? "No saved conversations match your search."
              : "Conversations you have with Oak are saved here automatically."
          )
          .font(Theme.body(.subheadline))
          .foregroundStyle(Theme.textSecondary)
          .multilineTextAlignment(.center)
          .padding(.horizontal, Theme.Spacing.lg)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.canvas)
      }
    } else {
      List {
        ForEach(model.conversations) { conversation in
          conversationRow(conversation, model: model)
        }
      }
      .listStyle(.plain)
      .scrollContentBackground(.hidden)
      .background(Theme.canvas)
      .refreshable { await model.reload() }
      .overlay(alignment: .bottom) {
        if let message = model.errorMessage {
          ErrorBanner(message: message, onDismiss: { model.dismissError() })
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.bottom, Theme.Spacing.sm)
        }
      }
    }
  }

  private func searchActive(_ model: HistoryListViewModel) -> Bool {
    !model.searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  @ViewBuilder
  private func conversationRow(
    _ conversation: ConversationSummary,
    model: HistoryListViewModel
  ) -> some View {
    let isOpen = conversation.id == chatModel.sessionId
    Button {
      Task { await select(conversation) }
    } label: {
      PadConversationRow(conversation: conversation, isOpen: isOpen)
    }
    .buttonStyle(.plain)
    .listRowInsets(
      EdgeInsets(
        top: Theme.Spacing.xs,
        leading: Theme.Spacing.md,
        bottom: Theme.Spacing.xs,
        trailing: Theme.Spacing.md
      )
    )
    .listRowBackground(
      Group {
        if isOpen {
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
    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
      Button(role: .destructive) {
        Task { await delete(conversation, model: model) }
      } label: {
        Label("Delete", systemImage: "trash")
      }
      Button {
        Task { await model.togglePin(conversation) }
      } label: {
        Label(
          conversation.pinned ? "Unpin" : "Pin",
          systemImage: conversation.pinned ? "pin.slash" : "pin"
        )
      }
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
      Menu("Export") {
        Button("Markdown") {
          Task { await export(conversation, model: model, as: .markdown) }
        }
        Button("PDF") {
          Task { await export(conversation, model: model, as: .pdf) }
        }
      }
      Button(role: .destructive) {
        Task { await delete(conversation, model: model) }
      } label: {
        Label("Delete", systemImage: "trash")
      }
    }
  }

  private func select(_ conversation: ConversationSummary) async {
    loadError = nil
    if chatModel.sessionId == conversation.id {
      onDidSelect?()
      return
    }
    let error = await PadChatSession.resume(
      summary: conversation,
      history: services.history,
      appState: appState,
      into: chatModel
    )
    loadError = error
    if error == nil {
      onDidSelect?()
    }
  }

  private func delete(_ conversation: ConversationSummary, model: HistoryListViewModel) async {
    let wasOpen = conversation.id == chatModel.sessionId
    await model.delete(conversation)
    if wasOpen {
      chatModel.startNewConversation()
    }
  }

  private func export(
    _ conversation: ConversationSummary,
    model: HistoryListViewModel,
    as format: ConversationExportFormat
  ) async {
    guard let url = await model.export(conversation, as: format) else { return }
    SystemShare.present(items: [url])
  }

  private var renameBinding: Binding<Bool> {
    Binding(
      get: { renameTarget != nil },
      set: { if !$0 { renameTarget = nil } }
    )
  }
}

/// Copied from iPhone `ConversationRow` (private in HistoryListView). Do not edit
/// that file — keep this row in visual lockstep.
private struct PadConversationRow: View {
  let conversation: ConversationSummary
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

  private var metaLine: String {
    let rel = updatedAt.formatted(.relative(presentation: .numeric, unitsStyle: .narrow))
    return "\(conversation.format.shortLabel) · \(rel)"
  }

  private var updatedAt: Date {
    Date(timeIntervalSince1970: Double(conversation.updatedAt) / 1000)
  }
}
