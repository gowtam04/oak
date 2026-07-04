import SwiftUI

/// The team-builder assistant, presented as a sheet from the team editor's toolbar —
/// iOS's native stand-in for web's docked `TeamsAssistantPanel.tsx`. On a phone a
/// sheet (rather than a side rail) keeps the editor form full-width and gives the
/// assistant a focused, dismissible surface; the LIVE unsaved draft rides every turn
/// regardless of which surface is on top.
///
/// A deliberately lean chat surface (NOT the full `AnswerCard` tree): user bubbles,
/// streamed assistant Markdown, a tool-activity ticker, and — when an answer proposes a
/// ``TeamPatch`` — a "Proposed changes" card with Apply / Undo. Apply mutates the
/// editor's in-memory draft only (``TeamsAssistantViewModel/apply(_:)``); the user still
/// reviews and Saves. All state lives in the injected ``TeamsAssistantViewModel``.
struct TeamsAssistantSheet: View {
  @State private var model: TeamsAssistantViewModel
  @State private var input = ""
  @Environment(\.dismiss) private var dismiss

  init(model: TeamsAssistantViewModel) {
    _model = State(initialValue: model)
  }

  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        thread
        Divider()
        composer
      }
      .navigationTitle("Team assistant")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Done") { dismiss() }
        }
      }
      .onDisappear { model.cancel() }
    }
  }

  // MARK: Thread

  private var thread: some View {
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 16) {
          if model.turns.isEmpty && model.status != .thinking {
            intro
          }

          ForEach(model.turns) { turn in
            turnView(turn)
              .id(turn.id)
          }

          if model.status == .thinking {
            pending
              .id(pendingAnchor)
          }

          if let errorMessage = model.errorMessage {
            ErrorBanner(
              message: errorMessage,
              retryTitle: "Retry",
              onRetry: { model.retry() }
            )
            .id(errorAnchor)
          }
        }
        .padding(16)
      }
      .onChange(of: model.turns.count) { _, _ in scrollToEnd(proxy) }
      .onChange(of: model.streamingMarkdown) { _, _ in scrollToEnd(proxy) }
      .onChange(of: model.activity) { _, _ in scrollToEnd(proxy) }
      .onChange(of: model.errorMessage) { _, _ in scrollToEnd(proxy) }
    }
  }

  private let pendingAnchor = -1
  private let errorAnchor = -2

  private func scrollToEnd(_ proxy: ScrollViewProxy) {
    let target: Int
    if model.errorMessage != nil {
      target = errorAnchor
    } else if model.status == .thinking {
      target = pendingAnchor
    } else if let last = model.turns.last {
      target = last.id
    } else {
      return
    }
    withAnimation(.easeOut(duration: 0.2)) {
      proxy.scrollTo(target, anchor: .bottom)
    }
  }

  // MARK: Empty state

  private var intro: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(
        "I can see the team you have open. Ask me to fill a slot, fix a moveset, check "
          + "your coverage, or suggest a spread — edits apply to your unsaved draft, and "
          + "you keep the Save button."
      )
      .font(Theme.body(.subheadline))
      .foregroundStyle(Theme.textSecondary)

      Text("Try asking")
        .instrumentLabel()
        .foregroundStyle(Theme.textSecondary)

      FlexibleChips(items: TeamsAssistantViewModel.suggestions) { suggestion in
        Button(suggestion) { model.send(suggestion) }
          .buttonStyle(.bordered)
          .controlSize(.small)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  // MARK: One turn

  @ViewBuilder
  private func turnView(_ turn: TeamsAssistantViewModel.Turn) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      userBubble(turn.user)
      if let answer = turn.answer {
        answerView(turn: turn, answer: answer)
      }
    }
  }

  private func userBubble(_ text: String) -> some View {
    HStack {
      Spacer(minLength: 32)
      Text(text)
        .font(Theme.body(.subheadline))
        .foregroundStyle(.white)
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, Theme.Spacing.sm)
        .background(
          Theme.accent,
          in: UnevenRoundedRectangle(
            topLeadingRadius: Theme.Radius.lg,
            bottomLeadingRadius: Theme.Radius.lg,
            bottomTrailingRadius: Theme.Radius.sm,
            topTrailingRadius: Theme.Radius.lg,
            style: .continuous
          )
        )
    }
  }

  @ViewBuilder
  private func answerView(
    turn: TeamsAssistantViewModel.Turn,
    answer: BuilderAnswer
  ) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      MarkdownBlockView(answer.answerMarkdown)
        .frame(maxWidth: .infinity, alignment: .leading)

      if let patch = answer.teamPatch, hasVisibleChanges(patch) {
        patchCard(turn: turn, patch: patch)
      }
    }
  }

  // MARK: Proposed-changes card

  /// Mirrors the web card's visibility rule: show only when the patch actually carries
  /// slot edits and/or a rename.
  private func hasVisibleChanges(_ patch: TeamPatch) -> Bool {
    patch.slots.count + (patch.name != nil ? 1 : 0) > 0
  }

  @ViewBuilder
  private func patchCard(
    turn: TeamsAssistantViewModel.Turn,
    patch: TeamPatch
  ) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Proposed changes")
        .font(Theme.body(.subheadline).weight(.semibold))

      VStack(alignment: .leading, spacing: 6) {
        ForEach(Array(describeTeamPatch(patch).enumerated()), id: \.offset) { _, line in
          HStack(alignment: .top, spacing: 8) {
            Image(systemName: "arrow.turn.down.right")
              .font(.caption2)
              .foregroundStyle(Theme.textSecondary)
              .accessibilityHidden(true)
            Text(line)
              .font(Theme.body(.footnote))
              .fixedSize(horizontal: false, vertical: true)
          }
        }
      }

      HStack(spacing: 12) {
        if model.appliedTurnIds.contains(turn.id) {
          Label("Applied to draft", systemImage: "checkmark.circle.fill")
            .font(Theme.body(.footnote).weight(.medium))
            .foregroundStyle(Theme.success)
          if model.lastApplied?.turnId == turn.id {
            Button("Undo") { model.undo() }
              .buttonStyle(.bordered)
              .controlSize(.small)
          }
        } else {
          Button("Apply to draft") { model.apply(turn) }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
        }
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .oakCard(radius: Theme.Radius.md)
  }

  // MARK: Pending / error

  private var pending: some View {
    HStack(alignment: .top, spacing: 8) {
      if model.streamingMarkdown.isEmpty {
        OakSpinner(size: 16)
        Text(model.activity ?? "Thinking\u{2026}")
          .font(Theme.body(.subheadline))
          .foregroundStyle(Theme.textSecondary)
      } else {
        MarkdownBlockView(model.streamingMarkdown)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  // MARK: Composer

  private var composer: some View {
    HStack(spacing: 10) {
      TextField("Ask about this team\u{2026}", text: $input, axis: .vertical)
        .textFieldStyle(.plain)
        .lineLimit(1...4)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 18))
        .onSubmit(submit)
        .disabled(model.status == .thinking)

      Button(action: submit) {
        ZStack {
          Circle()
            .fill(model.canSend(input) ? Theme.accent : Theme.surfaceSunken)
            .frame(width: 38, height: 38)
          Image(systemName: "arrow.up")
            .font(Theme.body(.subheadline).weight(.semibold))
            .foregroundStyle(model.canSend(input) ? .white : Theme.textMuted)
        }
      }
      .disabled(!model.canSend(input))
      .accessibilityLabel("Send")
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 10)
  }

  private func submit() {
    let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
    guard model.canSend(text) else { return }
    input = ""
    model.send(text)
  }
}

// MARK: - Flexible wrapping chip row

/// A simple wrapping row of chips (the suggestion prompts). Uses a plain `HStack` with
/// wrapping via `Layout` is overkill here — three short chips fit a phone width in one
/// line, and a horizontal scroll keeps it robust for any localization.
private struct FlexibleChips<Content: View>: View {
  let items: [String]
  @ViewBuilder let content: (String) -> Content

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(items, id: \.self) { content($0) }
      }
    }
  }
}
