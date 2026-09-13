import SwiftUI

/// Empty Pad Chat thread: Oak identity, a short Champions-coach line, and
/// the existing example prompts as a spacious grid (P-CHAT-US-3).
///
/// Prompt **strings** stay ``ExamplePrompts/filedPool`` via
/// ``ExamplePrompts/pickFiledStarters()`` — same text as the iPhone empty desk.
struct PadEmptyWorkbench: View {
  var model: ChatViewModel
  @Binding var sendPulse: Bool
  var onDismissComposer: () -> Void

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  @State private var emptyStateAppeared = false
  @State private var filedStarters: [ExamplePrompts.FiledStarter] = []

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
        identity
        promptGrid
      }
      .padding(Theme.Spacing.xl)
      .frame(maxWidth: .infinity, alignment: .leading)
      .frame(minHeight: 0, alignment: .top)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.canvas)
    .scrollDismissesKeyboard(.interactively)
    .contentShape(Rectangle())
    .simultaneousGesture(
      TapGesture().onEnded {
        onDismissComposer()
        model.dismissSlashPicker()
      }
    )
    .onAppear {
      filedStarters = ExamplePrompts.pickFiledStarters()
      emptyStateAppeared = true
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("pad-empty-workbench")
  }

  /// Wordmark + the same Champions-coach line the iPhone empty desk uses.
  private var identity: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
      OakWordmarkLockup(tileSize: 40, titleStyle: .title2, elevated: false)
      Text("Teams, calcs, and live usage for Pokémon Champions. Oak will show its work.")
        .font(Theme.body(.subheadline))
        .foregroundStyle(Theme.textSecondary)
        .fixedSize(horizontal: false, vertical: true)
    }
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isHeader)
  }

  private var promptGrid: some View {
    LazyVGrid(
      columns: [GridItem(.adaptive(minimum: 240), spacing: Theme.Spacing.md, alignment: .top)],
      spacing: Theme.Spacing.md
    ) {
      ForEach(Array(filedStarters.enumerated()), id: \.element.id) { index, starter in
        promptCard(starter, index: index)
      }
    }
  }

  /// Large chip: category prefix + prompt. Tapping sends the same text as iPhone.
  private func promptCard(
    _ starter: ExamplePrompts.FiledStarter,
    index: Int
  ) -> some View {
    let shown = reduceMotion || emptyStateAppeared
    return Button {
      Haptics.tap()
      if !reduceMotion {
        sendPulse.toggle()
      }
      model.composerText = starter.prompt
      model.send()
    } label: {
      VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
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
      .padding(Theme.Spacing.lg)
      .frame(maxWidth: .infinity, minHeight: 88, alignment: .topLeading)
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
}
