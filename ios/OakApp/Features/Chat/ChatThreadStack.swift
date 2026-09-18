import SwiftUI
import UIKit

/// Scrollable chat thread extracted from ``ChatView`` (turns, streaming, error
/// banner, follow-ups, empty desk). iPhone ``ChatView`` wraps this and keeps
/// screen chrome (toolbar, composer, artifact sheet, voice cover, calculator).
/// Pad ``PadThreadColumn`` hosts the same stack plus ``ComposerView``.
///
/// Takes the live ``ChatViewModel`` by reference (not `@State`) so
/// ``PadRootView`` can own the one Chat session (ADR-P3).
struct ChatThreadStack: View {
  @Bindable var model: ChatViewModel

  /// Artifact taps in the thread. `nil` on Pad until the inspector (P5).
  var artifactModel: ArtifactViewModel?

  /// Guest sign-in nudge inside the scrollable thread. `nil` when signed in.
  var signInAction: (() -> Void)?

  /// Bumped when an example starter is tapped so the composer send button pulses.
  @Binding var sendPulse: Bool

  /// Resignes composer focus (owned by the screen that hosts ``ComposerView``).
  var onDismissComposer: () -> Void

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(AppState.self) private var appState

  /// Flipped `true` in the empty state's `.onAppear` so the example chips cascade in
  /// once (staggered fade), rather than snapping in with the hero.
  @State private var emptyStateAppeared = false

  /// The empty desk's four filed starters (Battle / Dex / Rules / Meta), resampled
  /// from ``ExamplePrompts/filedPool`` each time the empty state (re)appears —
  /// never mid-appearance, so rows don't shuffle under the user's finger.
  @State private var filedStarters: [ExamplePrompts.FiledStarter] = []

  var body: some View {
    VStack(spacing: 0) {
      thread
      Divider()
      if let banner = model.errorBanner {
        errorBannerView(banner)
          .transition(bannerTransition)
      }
    }
    .animation(reduceMotion ? nil : Theme.Motion.snappy, value: model.errorBanner)
    .onChange(of: model.turns.count) { _, _ in
      if case .assistant = model.turns.last?.content { Haptics.success() }
    }
  }

  // MARK: Sign-in nudge (guest)

  /// A single quiet row inviting a guest to sign in so their conversations persist
  /// (accounts-and-access.md M-ACCT-US-1). Lives INSIDE the scrollable thread area
  /// (above the empty state when empty; with the bottom-anchored conversation
  /// cluster otherwise) — **not** a full-width band under the header (soul.md: red
  /// is a record light, not wallpaper; chrome stays quiet). Muted footnote text +
  /// an inline red text-button; a small icloud glyph pairs with the text so the
  /// invitation isn't carried by the red button color alone (M-AC-UI9.3). No
  /// surface fill, no padding beyond breathing room — it reads as a caption, not a
  /// card.
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
            .oakDismissesComposerKeyboard {
              onDismissComposer()
              model.dismissSlashPicker()
            }
          } else {
            VStack(spacing: 0) {
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
                if let signInAction {
                  signInNudge(action: signInAction)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
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
            .oakDismissesComposerKeyboard {
              onDismissComposer()
              model.dismissSlashPicker()
            }
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
      HStack(alignment: .top) {
        Spacer(minLength: 32)
        VStack(alignment: .trailing, spacing: 6) {
          UserMessageView(text: text, imageCount: imageCount)
          if isLastUser, model.canUndoSend || model.canEditLastUser {
            HStack(spacing: 8) {
              if model.canUndoSend {
                Button("Undo") { model.undoSend() }
                  .font(Theme.body(.caption, weight: .semibold))
              }
              if model.canEditLastUser {
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
        }
      }
    case let .assistant(answer):
      VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
        // The full field-by-field card. A clarify-option / suggestion tap sends its
        // text verbatim as the next user turn; tapping a candidate / subject / type or
        // a proposed/saved team opens it in the artifact viewer (M-ART-US-1/2/3).
        if model.showsVoiceMic(for: answer) {
          Label("Voice turn", systemImage: "mic.fill")
            .font(Theme.body(.caption, weight: .medium))
            .foregroundStyle(Theme.textSecondary)
            .accessibilityLabel("Voice turn")
        }
        if let banner = model.voiceHydrateBanner(for: turn) {
          voiceHydrateBanner(banner, messageId: turn.serverMessageId)
        }
        AnswerCardView(
          answer: answer,
          density: appState.answerDensity,
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
          onOpenDamageCalc: { calc in
            model.openCalculator(
              rest: "",
              scenario: scenarioFromDamageCalc(calc, format: model.displayFormat)
            )
          },
          onOpenCandidates: { candidates in
            artifactModel?.openCandidates(
              candidates,
              onShowAll: {
                sendFollowUp(
                  "Show me all \(candidates.totalCount) of those, not just the top \(candidates.shown.count)."
                )
              }
            )
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

  /// Sends `text` verbatim as the next user message (clarify options + suggestion
  /// chips). A no-op while a turn is already streaming.
  private func sendFollowUp(_ text: String) {
    model.composerText = text
    model.send()
  }

  @ViewBuilder
  private func voiceHydrateBanner(_ banner: VoiceHydrateBanner, messageId: String?) -> some View {
    HStack {
      switch banner {
      case .finishing:
        Text("Finishing card…")
          .font(Theme.body(.caption))
          .foregroundStyle(Theme.textSecondary)
      case .retry:
        Text("Couldn't finish this card.")
          .font(Theme.body(.caption))
          .foregroundStyle(Theme.textSecondary)
        if let messageId {
          Button("Retry") {
            Task { await model.retryVoiceHydrate(assistantMessageId: messageId) }
          }
          .font(Theme.body(.caption, weight: .semibold))
        }
      }
      Spacer(minLength: 0)
    }
    .accessibilityElement(children: .combine)
  }

  /// Thinking trace while empty, then a rising answer plate once tokens
  /// arrive (the terminal answer later replaces it authoritatively).
  private var inProgressView: some View {
    IncomingAnswerPlate(
      phase: model.streamingPhase,
      activities: model.toolActivities,
      reconnecting: model.reconnecting,
      streamingText: model.streamingText,
      startedAt: model.streamStartedAt
    )
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  /// Empty chat: Fredoka title on paper, mute sub, four full-width starter
  /// rows. Current landing IA — not the July centered Oak lockup.
  private var emptyState: some View {
    emptyLanding
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

  /// Title + sub + starter rows. No Standby label, no LED well, no brand tile.
  private var emptyLanding: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
      Text("What do you want to know?")
        .font(Theme.display(.title))
        .foregroundStyle(Theme.textStrong)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityAddTraits(.isHeader)
        .accessibilityIdentifier("empty-desk-prompt")

      Text("Teams, calcs, and live usage for Pokémon Champions. Oak will show its work.")
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
      Text(model.regulationLabel)
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
          .strokeBorder(Theme.borderStrong, lineWidth: 1)
      }
      .oakShadow(.card)
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

// MARK: - User note (red-soft bubble)

/// A user's note, trailing-aligned. Enamel restores the red-soft bubble:
/// `Theme.userBubble` fill, 30% poke-red hairline, `radius-lg` with `radius-sm`
/// on the bottom-right — not Signal's sunken gray note.
private struct UserMessageView: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.colorScheme) private var colorScheme
  let text: String
  let imageCount: Int

  var body: some View {
    VStack(alignment: .trailing, spacing: Theme.Spacing.xs) {
      if !text.isEmpty {
        Text(text)
          .font(Theme.body(.body, weight: .medium))
          .foregroundStyle(Theme.textStrong)
          .padding(.horizontal, Theme.Spacing.lg)
          .padding(.vertical, Theme.Spacing.md)
          .background(Theme.userBubble, in: noteShape)
          .overlay {
            noteShape.strokeBorder(Theme.userBubbleBorder, lineWidth: 1)
          }
          .shadow(
            color: colorScheme == .dark ? .clear : Theme.Shadow.card.ambient.color,
            radius: Theme.Shadow.card.ambient.radius,
            y: Theme.Shadow.card.ambient.y
          )
          .shadow(
            color: colorScheme == .dark ? .clear : Theme.Shadow.card.key.color,
            radius: Theme.Shadow.card.key.radius,
            y: Theme.Shadow.card.key.y
          )
      }
      if imageCount > 0 {
        Label("\(imageCount) image(s) attached", systemImage: "photo")
          .font(Theme.body(.caption))
          .foregroundStyle(Theme.textSecondary)
      }
    }
    .transition(entrance)
  }

  private var noteShape: UnevenRoundedRectangle {
    UnevenRoundedRectangle(
      cornerRadii: RectangleCornerRadii(
        topLeading: Theme.Radius.lg,
        bottomLeading: Theme.Radius.lg,
        bottomTrailing: Theme.Radius.sm,
        topTrailing: Theme.Radius.lg
      ),
      style: .continuous
    )
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

private extension View {
  /// Tapping empty canvas (and simultaneous with chip/button taps) resigns the
  /// composer. Applied to the scroll *content*, not the ScrollView, so dragging
  /// a long thread still works. `.scrollDismissesKeyboard(.interactively)` covers
  /// drag-to-dismiss once the thread is actually scrollable.
  func oakDismissesComposerKeyboard(_ dismiss: @escaping () -> Void) -> some View {
    self
      .contentShape(Rectangle())
      .simultaneousGesture(TapGesture().onEnded(dismiss))
  }
}
