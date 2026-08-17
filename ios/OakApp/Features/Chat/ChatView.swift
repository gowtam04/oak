import SwiftUI
import UIKit

/// The chat thread screen (chat-experience.md M-CHAT-US-1/2/3/4): a scrolling
/// conversation of user messages and reasoned answers, a live streaming section
/// while a turn is in flight, a recoverable error banner, and the composer.
///
/// The view owns its ``ChatViewModel`` (`@State`) and drives it directly; all logic
/// and the SSE reducer live in the view model. Finalized answers render through the
/// full field-by-field ``AnswerCardView`` tree (status, reasoning, citations,
/// inferences, candidates, damage calc, team blocks, clarify options, suggestions,
/// uncertainty…); a clarify-option or suggestion tap is sent verbatim as the next
/// user turn. Layout uses Dynamic-Type styles and semantic colors so it adapts to
/// text size and light/dark.
///
/// The view is **content-only** — it does not own a `NavigationStack`; the caller
/// provides one (the guest single-thread home wraps it; a signed-in thread is pushed
/// onto the Chat tab's stack). Two flags adapt it to those contexts:
/// ``showsNewConversationButton`` hides the toolbar's New-conversation button for a
/// pushed signed-in thread (where "New Chat" lives on the list and Back returns to
/// it), and ``signInAction`` — set for a guest only — renders a quiet "Sign in to
/// save your conversations" row inside the scrollable thread, above the empty
/// state when empty and at the top of the scroll otherwise (accounts-and-access.md
/// M-ACCT-US-1) — not a full-width band under the header.
struct ChatView: View {
  @State private var model: ChatViewModel

  /// The injected service container — read to build the artifact viewer's data seam
  /// (``ServiceContainer/artifact``) and, after a voice session ends, to reload the
  /// thread (``ServiceContainer/history``). Available here because the whole app is
  /// wrapped in `.oakServices(…)` above `RootView`.
  @Environment(\.services) private var services

  /// Read to gate voice mode (signed-in only, M-AC voice-mode) and to build the
  /// signed-out mic nudge.
  @Environment(AppState.self) private var appState

  /// Gates every entrance/movement animation (constraint 2): under Reduce Motion the
  /// bubble/banner slides and the chip cascade collapse to plain opacity or nothing.
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// Drives the screen-off auto-reconnect: a `.background` transition mid-stream arms
  /// the retry gate, `.active` fires any deferred retry (mirrors web's
  /// `visibilitychange` handling in `sse-client.ts`).
  @Environment(\.scenePhase) private var scenePhase

  /// Flipped `true` in the empty state's `.onAppear` so the example chips cascade in
  /// once (staggered fade), rather than snapping in with the hero.
  @State private var emptyStateAppeared = false

  /// A single scale pulse on the send button, fired when an example chip is tapped so
  /// the eye lands where the action is (§4.01). Skipped under Reduce Motion.
  @State private var sendPulse = false

  /// The empty desk's four filed starters (Battle / Dex / Rules / Meta), resampled
  /// from ``ExamplePrompts/filedPool`` each time the empty state (re)appears —
  /// never mid-appearance, so rows don't shuffle under the user's finger.
  @State private var filedStarters: [ExamplePrompts.FiledStarter] = []

  /// The thread's artifact bottom-sheet viewer (artifact-viewer.md M-ART-US-1/2/3).
  /// One per chat thread, hosted once via ``artifactViewerHost(_:)``. Built lazily in
  /// `.task(id:)` (the environment isn't available in `init`) and rebuilt when the
  /// Champions toggle flips so entity fetches re-scope to the active format
  /// (M-BR-ART-4); rebuilding clears the back stack, which is fine since the sheet is
  /// closed when the composer toggle is reached.
  @State private var artifactModel: ArtifactViewModel?

  /// Drives the voice-mode `.fullScreenCover` (``VoiceLauncher``). Flipped true by
  /// the composer's mic button (only after it's cleared the sign-in + microphone
  /// permission gates); flipping back to false — however the cover closes — is
  /// what triggers ``refreshAfterVoice()``.
  @State private var isVoicePresented = false

  /// Whether the toolbar shows the New-conversation button (M-CHAT-US-3). On for the
  /// guest single thread; off for a pushed signed-in thread.
  private let showsNewConversationButton: Bool

  /// When set, the toolbar shows a New-conversation button even on a pushed thread
  /// (where the leading wordmark is absent), and tapping it calls this instead of
  /// ``ChatViewModel/startNewConversation()`` — letting a signed-in pushed thread route
  /// New Chat back to the tab's stack (TestFlight AG4sZ6E).
  private let onNewConversation: (() -> Void)?

  /// When non-nil, renders the guest sign-in nudge above the thread; the "Sign in"
  /// button calls this (it presents the sign-in sheet). `nil` for a signed-in thread.
  private let signInAction: (() -> Void)?

  init(
    model: ChatViewModel,
    showsNewConversationButton: Bool = true,
    onNewConversation: (() -> Void)? = nil,
    signInAction: (() -> Void)? = nil
  ) {
    _model = State(initialValue: model)
    self.showsNewConversationButton = showsNewConversationButton
    self.onNewConversation = onNewConversation
    self.signInAction = signInAction
  }

  var body: some View {
    VStack(spacing: 0) {
      thread
      Divider()
      if let banner = model.errorBanner {
        errorBannerView(banner)
          .transition(bannerTransition)
      }
      ComposerView(
        model: model,
        onVoice: { isVoicePresented = true },
        voiceReady: voiceReady,
        onSignInNudge: signInAction,
        sendPulse: sendPulse
      )
    }
    // The error banner slides up from the composer seam as it appears/clears.
    .animation(reduceMotion ? nil : Theme.Motion.snappy, value: model.errorBanner)
    // Answer arrival is a redundant success haptic — the new card is the visible cue
    // (M-AC-UI9.3). Fires only when the newest turn is an assistant answer.
    .onChange(of: model.turns.count) { _, _ in
      if case .assistant = model.turns.last?.content { Haptics.success() }
    }
    .navigationTitle("Oak")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      // Signal wordmark (`Oak.` + red period) leading, so the Chat root reads as
      // Oak the instant it opens. Only on the root (guest single thread); a
      // pushed signed-in thread keeps the system back button leading.
      if showsNewConversationButton {
        ToolbarItem(placement: .topBarLeading) {
          OakWordmarkLockup()
        }
      }
      // The scope control (GS-C): the header's visible counterpart to the `scope`
      // SSE event and the ONLY interactive scope control (the Champions pill +
      // Account toggle are gone). Centered so it reads as the thread's scope, not
      // an action; disabled mid-stream so a turn's scope stays stable.
      ToolbarItem(placement: .principal) {
        scopeChip
      }
      ToolbarItem(placement: .topBarTrailing) {
        HStack(spacing: 12) {
          if model.isSignedIn, !model.turns.isEmpty {
            Menu {
              Button("Export Markdown") {
                Task { await exportThread(.markdown) }
              }
              Button("Export PDF") {
                Task { await exportThread(.pdf) }
              }
            } label: {
              Label("Export", systemImage: "square.and.arrow.up")
            }
          }
          if showsNewConversationButton || onNewConversation != nil {
            Button {
              if let onNewConversation {
                onNewConversation()
              } else {
                model.startNewConversation()
              }
            } label: {
              Label("New conversation", systemImage: "square.and.pencil")
            }
          }
        }
      }
    }
    // Navigating away UNSUBSCRIBES — it never cancels generation (background-turns
    // design §6.2). `detach` closes the socket, keeps the pending-turn pointer, and
    // releases the screen-wake hold; the server turn keeps running and is reattached
    // on return.
    .onDisappear { model.detach() }
    // Returning to the thread: if a turn is still generating for it but the socket has
    // dropped, reattach to its live stream and rebuild the in-flight UI from the replay.
    .onAppear {
      model.reattachIfNeeded()
      Task { await model.loadMentionTeams() }
    }
    // Background: take a short grace window so a nearly-done turn finishes streaming.
    // Foreground: reattach to a still-running turn whose socket dropped.
    .onChange(of: scenePhase) { _, newPhase in
      switch newPhase {
      case .background:
        model.sceneDidEnterBackground()
      case .active:
        model.sceneWillEnterForeground()
      default:
        break
      }
    }
    // Build the viewer once on appear, and rebuild it when the displayed scope
    // changes (a chip pick or a resolved `scope` event) so its fixed format
    // re-scopes to the active scope (M-BR-ART-4; web scopes the viewer to
    // `displayFormat` too).
    .task(id: model.displayFormat) {
      let viewer = ArtifactViewModel(
        service: services.artifact,
        format: model.displayFormat
      )
      artifactModel = viewer
    }
    // Host the artifact bottom sheet once at the screen level; pushing an entity
    // opens it, an empty back stack closes it (M-AC-A3.3, M-BR-ART-5).
    .artifactViewerHost(artifactModel)
    // Voice mode (T5): a fresh `VoiceLauncher` — and a fresh `VoiceSession` — is
    // built every time this opens. However it closes (End button, `.onDisappear`
    // teardown, anything else), the `isVoicePresented` binding flips back to
    // false, which is what triggers the post-session refresh below.
    .fullScreenCover(isPresented: $isVoicePresented) {
      VoiceLauncher(sessionId: model.sessionId, format: model.displayFormat)
    }
    .onChange(of: isVoicePresented) { wasPresented, isPresented in
      if wasPresented, !isPresented { refreshAfterVoice() }
    }
  }

  // MARK: Scope chip (generation-scope GS-C)

  /// The header scope control: a compact pill showing the displayed scope's short
  /// label, opening a menu of all known formats as an inline radio list
  /// (checkmark on the current pick). Picking one seeds the next turn's scope
  /// (`selectScope`). Disabled while a turn streams so the scope can't change
  /// mid-turn — mirrors `ScopeChip.tsx` (label = the scope, menu =
  /// `Format.knownCases`, disabled while streaming).
  @ViewBuilder
  private var scopeChip: some View {
    Menu {
      Picker(
        "Answer scope",
        selection: Binding(
          get: { model.displayFormat },
          set: { model.selectScope($0) }
        )
      ) {
        let mru = appState.lastUsedScopes
        if !mru.isEmpty, case .signedIn = appState.authState {
          Section("Recent") {
            ForEach(mru, id: \.self) { format in
              Text(format.displayLabel).tag(format)
            }
          }
        }
        Section {
          ForEach(Format.knownCases.filter { !mru.contains($0) || mru.isEmpty || appState.authState == .guest }, id: \.self) { format in
            Text(format.displayLabel).tag(format)
          }
        }
      }
    } label: {
      HStack(spacing: 6) {
        // Always-on 6pt scope LED — Signal's header mark, not a "changed from
        // default" indicator.
        Circle()
          .fill(Theme.accent)
          .frame(width: 6, height: 6)
          .accessibilityHidden(true)
        Text(model.displayFormat.shortLabel)
          .font(Theme.body(.caption, weight: .medium))
        Image(systemName: "chevron.down")
          .font(.system(size: 9, weight: .bold))
      }
      .foregroundStyle(Theme.textSecondary)
      .padding(.horizontal, 10)
      .padding(.vertical, 5)
      .background(Theme.surface, in: Capsule())
      .overlay(Capsule().strokeBorder(Theme.separator, lineWidth: 1))
      .contentShape(Capsule())
    }
    .disabled(model.isStreaming)
    .accessibilityLabel("Answer scope")
    .accessibilityValue(model.displayFormat.displayLabel)
    .accessibilityHint("Choose which game or generation answers are based on")
  }

  // MARK: Voice mode (T5)

  /// Voice mode is signed-in only (the server 401s a guest, component-design.md
  /// voice-mode section) — the composer's mic button uses this to choose between
  /// the permission gate and the sign-in nudge.
  private var voiceReady: Bool {
    if case .signedIn = appState.authState { return true }
    return false
  }

  /// Reloads the thread once the voice overlay closes, guest-guarded (mirrors
  /// web's `handleVoiceClose`). The realtime session persisted its turns
  /// server-side as it went, so this is the same "pull the authoritative thread"
  /// refresh a normal answer's finalize already relies on elsewhere — errors
  /// (including a 401 that slipped through, or the just-finished turn not having
  /// landed yet) are silently swallowed rather than surfaced as a banner.
  private func refreshAfterVoice() {
    guard case .signedIn = appState.authState else { return }
    Task {
      guard let detail = try? await services.history.get(id: model.sessionId) else { return }
      model.loadResumed(conversationId: detail.id, format: detail.format, turns: detail.turns)
    }
  }

  // MARK: Sign-in nudge (guest)

  /// A single quiet row inviting a guest to sign in so their conversations persist
  /// (accounts-and-access.md M-ACCT-US-1). Lives INSIDE the scrollable thread area
  /// (above the empty state when empty, top of the scroll otherwise) — **not** a
  /// full-width band under the header (soul.md: red is a record light, not
  /// wallpaper; chrome stays quiet). Muted footnote text + an inline red
  /// text-button; a small icloud glyph pairs with the text so the invitation isn't
  /// carried by the red button color alone (M-AC-UI9.3). No surface fill, no
  /// padding beyond breathing room — it reads as a caption, not a card.
  @ViewBuilder
  private func signInNudge(action: @escaping () -> Void) -> some View {
    HStack(spacing: 6) {
      Image(systemName: "icloud")
        .font(.system(size: 11, weight: .medium))
        .foregroundStyle(Theme.textSecondary)
        .accessibilityHidden(true)
      Text("Sign in to save your conversations")
        .font(Theme.body(.footnote))
        .foregroundStyle(Theme.textSecondary)
        .fixedSize(horizontal: false, vertical: true)
      Button("Sign in", action: action)
        .font(Theme.display(.footnote, weight: .semibold))
        .buttonStyle(.borderless)
        .tint(Theme.accent)
    }
    .padding(.vertical, Theme.Spacing.xs)
  }

  // MARK: Thread

  private var thread: some View {
    ScrollViewReader { proxy in
      GeometryReader { geo in
        ScrollView {
          // Empty chat is top-aligned (title + starter rows). A conversation is
          // bottom-anchored — a greedy top Spacer pushes a short thread down
          // against the composer. Both pin content to at least the viewport
          // height; once a thread outgrows the viewport it scrolls normally.
          if model.turns.isEmpty && !model.isStreaming {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
              if let signInAction {
                signInNudge(action: signInAction)
                  .frame(maxWidth: Self.plateMaxWidth, alignment: .leading)
                  .frame(maxWidth: .infinity)
              }
              emptyState
            }
            .padding(Theme.Spacing.lg)
            .frame(minHeight: geo.size.height, alignment: .top)
          } else {
            VStack(spacing: 0) {
              if let signInAction {
                signInNudge(action: signInAction)
                  .padding(.horizontal, Theme.Spacing.lg)
                  .padding(.top, Theme.Spacing.sm)
              }
              PinStripView(
                pins: pinItems,
                onJump: { id in
                  if let turn = model.turns.first(where: { $0.serverMessageId == id }) {
                    withAnimation { proxy.scrollTo(turn.id, anchor: .top) }
                  }
                },
                onUnpin: { id in
                  if let turn = model.turns.first(where: { $0.serverMessageId == id }) {
                    Task { await model.pinTurn(turn) }
                  }
                }
              )
              Spacer(minLength: 0)
              LazyVStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                ForEach(model.turns) { turn in
                  turnView(turn)
                    .id(turn.id)
                }
                // Turn insertion animates so the user bubble's entrance transition fires
                // (Reduce Motion: the transition itself degrades to opacity-only).
                .animation(reduceMotion ? nil : Theme.Motion.smooth, value: model.turns.count)

                // The in-flight turn: live status + streamed prose as it arrives.
                if model.isStreaming || !model.streamingText.isEmpty {
                  inProgressView
                    .id(Self.inProgressAnchor)
                }
              }
            }
            .padding(Theme.Spacing.lg)
            .frame(minHeight: geo.size.height, alignment: .bottom)
          }
        }
        .background(Theme.canvas)
        .scrollDismissesKeyboard(.interactively)
        // Keep the newest content in view as turns/tokens arrive (M-AC-2.2).
        .onChange(of: model.turns.count) { _, _ in scrollToBottom(proxy) }
        .onChange(of: model.streamingText) { _, _ in scrollToBottom(proxy) }
        .onChange(of: model.toolActivities.count) { _, _ in scrollToBottom(proxy) }
      }
    }
  }

  @ViewBuilder
  private func turnView(_ turn: ChatViewModel.ChatTurnItem) -> some View {
    let isLastUser = model.isLastUser(turn)
    let isLastAssistant = model.isLastAssistant(turn)
    switch turn.content {
    case let .user(text, imageCount):
      VStack(alignment: .trailing, spacing: 6) {
        UserMessageView(text: text, imageCount: imageCount)
        HStack {
          if isLastUser, model.canUndoSend {
            Button("Undo") { model.undoSend() }
              .font(Theme.body(.caption, weight: .semibold))
          }
          if isLastUser, model.canEditLastUser {
            TurnActions(
              isAssistant: false,
              isLastCard: true,
              isSignedIn: model.isSignedIn,
              isPinned: false,
              onRetry: nil,
              onEdit: { model.beginEditLast() },
              onCopyHuman: {},
              onCopyAgents: nil,
              onShare: nil,
              onPin: nil,
              onFork: nil
            )
          }
        }
      }
    case let .assistant(answer):
      VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
        // The full field-by-field card. A clarify-option / suggestion tap sends its
        // text verbatim as the next user turn; tapping a candidate / subject / type or
        // a proposed/saved team opens it in the artifact viewer (M-ART-US-1/2/3).
        AnswerCardView(
          answer: answer,
          onFollowUp: sendFollowUp,
          onOpenSavedTeam: { ref in
            Task { await artifactModel?.openSavedTeam(id: ref.id, name: ref.name) }
          },
          onOpenEntity: { kind, query in
            Task { await artifactModel?.openEntity(kind: kind, query: query) }
          },
          onOpenProposedTeam: { team, warnings in
            artifactModel?.openProposedTeam(team, warnings: warnings)
          },
          onOpenComparison: { subjects in
            artifactModel?.openComparison(subjects)
          },
          onOpenDamageCalc: { damageCalc in
            artifactModel?.openDamageCalc(damageCalc)
          },
          onCopyHuman: {
            UIPasteboard.general.string = OakAnswerHumanMarkdown.build(answer)
          }
        )
        TurnActions(
          isAssistant: true,
          isLastCard: isLastAssistant && !model.isStreaming,
          isSignedIn: model.isSignedIn,
          isPinned: turn.serverMessageId.map { model.pinnedMessageIds.contains($0) } ?? false,
          onRetry: (isLastAssistant && model.canRetryLastAnswer) ? { model.retryLastAnswer() } : nil,
          onEdit: nil,
          onCopyHuman: {
            UIPasteboard.general.string = OakAnswerHumanMarkdown.build(answer)
          },
          onCopyAgents: {
            UIPasteboard.general.string = OakAnswerAgentMarkdown.build(answer)
          },
          onShare: model.isSignedIn ? { Task { await share(turn) } } : nil,
          onPin: model.isSignedIn ? { Task { await model.pinTurn(turn) } } : nil,
          onFork: model.isSignedIn ? { Task { await model.forkFrom(turn) } } : nil
        )
        FollowUpChipRow(chips: model.followUpChips(for: answer), onTap: model.handleChip)
      }
    }
  }

  private var pinItems: [PinStripView.PinItem] {
    model.pinnedMessageIds.compactMap { id in
      guard let turn = model.turns.first(where: { $0.serverMessageId == id }),
            case let .assistant(answer) = turn.content
      else { return nil }
      let title = answer.subjects?.first?.name ?? "Pinned answer"
      return PinStripView.PinItem(messageId: id, title: title)
    }
  }

  private func share(_ turn: ChatViewModel.ChatTurnItem) async {
    guard let url = await model.shareTurn(turn) else { return }
    SystemShare.present(items: [url])
  }

  private func exportThread(_ format: ConversationExportFormat) async {
    guard let url = await model.exportConversation(as: format) else { return }
    SystemShare.present(items: [url])
  }

  /// Sends `text` verbatim as the next user message (clarify options + suggestion
  /// chips). A no-op while a turn is already streaming.
  private func sendFollowUp(_ text: String) {
    model.composerText = text
    model.send()
  }

  /// One incoming plate: status + sunken bars while empty, streamed markdown
  /// once tokens arrive (the terminal answer later replaces it authoritatively).
  private var inProgressView: some View {
    IncomingAnswerPlate(
      phase: model.streamingPhase,
      activities: model.toolActivities,
      reconnecting: model.reconnecting,
      streamingText: model.streamingText
    )
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  /// Signal empty chat: large title, mute sub, four full-width starter rows.
  /// Scope LED lives in the header only — not repeated on this plate.
  private var emptyState: some View {
    blankSpecimenPlate
      .frame(maxWidth: Self.plateMaxWidth)
      .frame(maxWidth: .infinity)
      .onAppear {
        filedStarters = ExamplePrompts.pickFiledStarters()
        emptyStateAppeared = true
        Task {
          await model.loadEmptyDeskRecents()
          await model.loadMentionTeams()
        }
      }
  }

  /// Max width the empty-chat column snaps to.
  private static let plateMaxWidth: CGFloat = 520

  /// Title + sub + starter rows. No Standby label, no LED well, no type-dot
  /// hero composition.
  private var blankSpecimenPlate: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
      Text("What do you want to know?")
        .font(Theme.display(.title))
        .foregroundStyle(Theme.textStrong)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityAddTraits(.isHeader)
        .accessibilityIdentifier("empty-desk-prompt")

      Text("Mechanics, locations, teams, damage. Oak will show its work.")
        .font(Theme.body(.subheadline))
        .foregroundStyle(Theme.textSecondary)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.bottom, Theme.Spacing.sm)

      if model.isSignedIn {
        emptyDeskRecents
          .padding(.bottom, Theme.Spacing.sm)
      }

      VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
        ForEach(Array(filedStarters.enumerated()), id: \.element.id) { index, starter in
          filedStarterRow(starter, index: index)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.top, Theme.Spacing.xl)
  }

  @ViewBuilder
  private var emptyDeskRecents: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
      if let recent = model.recentConversation {
        Button {
          appState.pendingDestination = .conversation(id: recent.id)
        } label: {
          Label("Continue \(recent.title)", systemImage: "clock.arrow.circlepath")
            .font(Theme.body(.subheadline, weight: .medium))
            .foregroundStyle(Theme.textStrong)
        }
        .buttonStyle(.plain)
      }
      if let team = model.recentTeam {
        Button {
          appState.pendingDestination = .team(id: team.id)
        } label: {
          Label("Open \(team.name)", systemImage: "square.grid.3x2")
            .font(Theme.body(.subheadline, weight: .medium))
            .foregroundStyle(Theme.textStrong)
        }
        .buttonStyle(.plain)
      }
      Text("Scope: \(model.displayFormat.shortLabel)")
        .font(Theme.body(.caption))
        .foregroundStyle(Theme.textMuted)
    }
  }

  /// One starter row: mute category prefix + prompt. Surface + hairline, r10.
  /// Tapping sends the prompt as the next user turn and pulses send.
  private func filedStarterRow(
    _ starter: ExamplePrompts.FiledStarter,
    index: Int
  ) -> some View {
    let shown = reduceMotion || emptyStateAppeared
    return Button {
      Haptics.tap()
      if !reduceMotion {
        sendPulse.toggle()
      }
      sendFollowUp(starter.prompt)
    } label: {
      HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.sm) {
        Text(starter.category.rawValue)
          .font(Theme.body(.caption, weight: .medium))
          .foregroundStyle(Theme.textMuted)
        Text(starter.prompt)
          .font(Theme.body(.subheadline, weight: .medium))
          .foregroundStyle(Theme.textStrong)
          .multilineTextAlignment(.leading)
          .fixedSize(horizontal: false, vertical: true)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(.horizontal, Theme.Spacing.md)
      .padding(.vertical, 10)
      .background(
        Theme.surface,
        in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
      )
      .overlay {
        RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
          .strokeBorder(Theme.separator, lineWidth: 1)
      }
    }
    .buttonStyle(OakPressableButtonStyle())
    .opacity(shown ? 1 : 0)
    .offset(y: shown ? 0 : 8)
    .animation(reduceMotion ? nil : Theme.Motion.staggered(index), value: emptyStateAppeared)
    .accessibilityLabel("\(starter.category.rawValue): \(starter.prompt)")
    .accessibilityHint("Sends this as your next message")
  }

  /// The entrance transition for the error banner — a slide up from the composer
  /// seam, degrading to a plain crossfade under Reduce Motion.
  private var bannerTransition: AnyTransition {
    reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity)
  }

  // MARK: Error banner

  @ViewBuilder
  private func errorBannerView(_ banner: ChatViewModel.ErrorBanner) -> some View {
    HStack(alignment: .top, spacing: Theme.Spacing.sm) {
      Image(systemName: "exclamationmark.triangle.fill")
        .foregroundStyle(Theme.danger)
        .symbolEffect(.pulse, options: .nonRepeating, isActive: !reduceMotion)
      Text(banner.message)
        .font(Theme.body(.footnote))
        .foregroundStyle(Theme.textPrimary)
        .frame(maxWidth: .infinity, alignment: .leading)
      if banner.isRetryable {
        Button("Retry") { model.retry() }
          .font(Theme.display(.footnote))
          .buttonStyle(.borderless)
          .tint(Theme.accent)
      }
    }
    .padding(Theme.Spacing.md)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Theme.danger.opacity(0.12))
  }

  // MARK: Helpers

  private static let inProgressAnchor = "oak.inProgress"

  private func scrollToBottom(_ proxy: ScrollViewProxy) {
    withAnimation(.easeOut(duration: 0.2)) {
      if model.isStreaming || !model.streamingText.isEmpty {
        proxy.scrollTo(Self.inProgressAnchor, anchor: .bottom)
      } else if let last = model.turns.last {
        proxy.scrollTo(last.id, anchor: .bottom)
      }
    }
  }
}

// MARK: - User note (sunken + hairline; no red bubble, no corner pip)

/// A user's note, trailing-aligned. Sunken fill + hairline — **not** an
/// accent-filled iMessage/ChatGPT bubble and **not** a red-pipped instrument card.
private struct UserMessageView: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let text: String
  let imageCount: Int

  var body: some View {
    HStack {
      Spacer(minLength: 32)
      VStack(alignment: .trailing, spacing: Theme.Spacing.xs) {
        if !text.isEmpty {
          Text(text)
            .font(Theme.body(.body, weight: .medium))
            .foregroundStyle(Theme.textStrong)
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.vertical, Theme.Spacing.md)
            .background(Theme.surfaceSunken, in: noteShape)
            .overlay {
              noteShape.strokeBorder(Theme.separator, lineWidth: 1)
            }
        }
        if imageCount > 0 {
          Label("\(imageCount) image(s) attached", systemImage: "photo")
            .font(Theme.body(.caption))
            .foregroundStyle(Theme.textSecondary)
        }
      }
    }
    .transition(entrance)
  }

  private var noteShape: RoundedRectangle {
    RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
  }

  /// Pops in from the sending corner (scale + rise + fade); Reduce Motion keeps only
  /// the fade (constraint 2). Removal is always a plain fade.
  private var entrance: AnyTransition {
    if reduceMotion { return .opacity }
    return .asymmetric(
      insertion: .scale(scale: 0.92, anchor: .bottomTrailing)
        .combined(with: .opacity)
        .combined(with: .offset(y: 8)),
      removal: .opacity
    )
  }
}

// MARK: - Optional artifact-viewer host

private extension View {
  /// Hosts the artifact bottom sheet once the thread's ``ArtifactViewModel`` has been
  /// built (it's created lazily in `.task`, so it's `nil` for the first frame).
  ///
  /// The sheet is attached to a **stateless background layer** rather than wrapped
  /// around `self` in a conditional: the chat subtree (composer focus, scroll offset)
  /// then keeps a stable identity when the model flips `nil → non-nil` on first
  /// appear. A `.sheet` presents window-modally regardless of its anchor, so a
  /// `Color.clear` host is sufficient; it reuses the model-owned
  /// ``SwiftUICore/View/artifactViewer(_:)`` modifier.
  func artifactViewerHost(_ model: ArtifactViewModel?) -> some View {
    background {
      if let model {
        Color.clear.artifactViewer(model)
      }
    }
  }
}

#if DEBUG
/// A preview/canvas ``ChatService`` that streams a short scripted answer without the
/// network. Shared by the chat feature's previews (internal, not `private`).
struct PreviewChatService: ChatService {
  func send(
    sessionId: String,
    message: String,
    images: [UIImage],
    scopeSeed: Format?,
    recovery: ChatRecovery?,
    mentionedTeamIds: [String]?
  ) -> AsyncThrowingStream<SSEEvent, Error> {
    AsyncThrowingStream { continuation in
      let answer = OakAnswer(
        status: .answered,
        answerMarkdown: "**Garchomp** is a Dragon/Ground pseudo-legendary with a base stat total of 600.",
        reasoningMarkdown: "Resolved Garchomp and read its base stats and typing.",
        citations: [],
        inferences: [],
        generationBasis: GenerationBasis(generation: "Gen 9 (Scarlet/Violet)", fallback: false, note: nil),
        subjects: nil,
        candidates: nil,
        damageCalc: nil,
        suggestions: nil,
        question: nil,
        uncertaintyFlags: nil,
        proposedTeam: nil,
        savedTeam: nil,
        proposedTeamWarnings: nil
      )
      continuation.yield(.toolActivity(tool: "resolve_entity", label: "Resolving \"Garchomp\""))
      continuation.yield(.answerStart)
      continuation.yield(.answerDelta(text: answer.answerMarkdown))
      continuation.yield(.answer(answer))
      continuation.finish()
    }
  }

  func resumeStream(turnId: String, sessionId: String) -> AsyncThrowingStream<SSEEvent, Error> {
    AsyncThrowingStream { $0.finish() }
  }

  func stop(turnId: String, sessionId: String) async throws {}

  func persistScope(
    format: Format,
    conversationId: String?,
    sessionId: String
  ) async throws -> [Format] { [] }
}

#Preview("Chat") {
  let state = AppState()
  return NavigationStack {
    ChatView(model: ChatViewModel(chat: PreviewChatService(), appState: state))
  }
  .environment(state)
}

#Preview("Chat (guest nudge)") {
  let state = AppState()
  return NavigationStack {
    ChatView(
      model: ChatViewModel(chat: PreviewChatService(), appState: state),
      signInAction: {}
    )
  }
  .environment(state)
}
#endif
