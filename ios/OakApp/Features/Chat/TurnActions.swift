import SwiftUI

/// Card/user-bubble action menu: retry / edit / pin / fork / copy / share.
/// Last-turn-only for retry/edit (REC-BR-1). Guest hides share/pin/fork.
struct TurnActions: View {
  let isAssistant: Bool
  let isLastCard: Bool
  let isSignedIn: Bool
  let isPinned: Bool
  let onRetry: (() -> Void)?
  let onEdit: (() -> Void)?
  let onCopyHuman: () -> Void
  let onCopyAgents: (() -> Void)?
  let onShare: (() -> Void)?
  let onPin: (() -> Void)?
  let onFork: (() -> Void)?

  var body: some View {
    Menu {
      if isAssistant {
        Button(action: onCopyHuman) {
          Label("Copy as human text", systemImage: "doc.on.doc")
        }
        if let onCopyAgents {
          Button(action: onCopyAgents) {
            Label("Copy for agents", systemImage: "doc.on.clipboard")
          }
        }
        if isSignedIn, let onShare {
          Button(action: onShare) {
            Label("Share", systemImage: "square.and.arrow.up")
          }
        }
        if isSignedIn, let onPin {
          Button(action: onPin) {
            Label(isPinned ? "Unpin" : "Pin", systemImage: isPinned ? "pin.slash" : "pin")
          }
        }
        if isSignedIn, let onFork {
          Button(action: onFork) {
            Label("Fork", systemImage: "arrow.triangle.branch")
          }
        }
        if isLastCard, let onRetry {
          Button(action: onRetry) {
            Label("Retry", systemImage: "arrow.clockwise")
          }
        }
      } else if isLastCard, let onEdit {
        Button(action: onEdit) {
          Label("Edit", systemImage: "pencil")
        }
      }
    } label: {
      Image(systemName: "ellipsis")
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(Theme.textMuted)
        .frame(width: 28, height: 28)
        .contentShape(Rectangle())
    }
    .accessibilityLabel("Turn actions")
  }
}
