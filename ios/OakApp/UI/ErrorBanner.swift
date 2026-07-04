import SwiftUI

/// A shared, on-theme error banner that replaces the five identical off-theme
/// copies scattered across History, TeamsList, TeamEditor, TeamsAssistantSheet,
/// and ShowdownImport.
///
/// Visual anatomy (left → right):
/// ```
/// [ ⚠  message text (up to 2 lines)         [Retry]  [✕] ]
/// ```
///
/// - The warning icon is `Theme.danger` — the canonical "something went wrong"
///   semantic color, not a raw `.orange` literal.
/// - The message uses `Theme.body(.footnote)` + `Theme.textPrimary`, matching
///   the text weight of the existing banners while adopting the type system.
/// - Retry is optional — supply it when the caller can meaningfully re-attempt
///   (e.g. TeamsAssistantSheet). Pass `retryTitle` to customise the label
///   (default: "Retry").
/// - Dismiss is optional — supply it when the error is transient or the caller
///   owns an `errorMessage` binding it wants cleared on tap (most callers).
///   Uses `Theme.textMuted` so it reads as a secondary action.
/// - Container: `Theme.Spacing.md` padding, `Theme.surface` background,
///   `RoundedRectangle` at `Theme.Radius.md` with `.continuous` style, a
///   `Theme.separator` hairline strokeBorder, and `.oakShadow(Theme.Shadow.card)`
///   in light mode only (same light/dark idiom as `OakCardModifier`).
///
/// Adoption note: the five existing banners need no changes in this wave — a
/// later agent swaps each caller to use `ErrorBanner` directly.
struct ErrorBanner: View {

  let message: String
  var retryTitle: String? = nil
  var onRetry: (() -> Void)? = nil
  var onDismiss: (() -> Void)? = nil

  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
    let isLight = colorScheme == .light

    HStack(spacing: Theme.Spacing.sm) {
      Image(systemName: "exclamationmark.triangle.fill")
        .foregroundStyle(Theme.danger)

      Text(message)
        .font(Theme.body(.footnote))
        .foregroundStyle(Theme.textPrimary)
        .lineLimit(2)
        .frame(maxWidth: .infinity, alignment: .leading)

      if let retryTitle, let onRetry {
        Button(retryTitle, action: onRetry)
          .font(Theme.body(.footnote).weight(.semibold))
          .foregroundStyle(Theme.accent)
      }

      if let onDismiss {
        Button(action: onDismiss) {
          Image(systemName: "xmark")
            .foregroundStyle(Theme.textMuted)
        }
      }
    }
    .padding(Theme.Spacing.md)
    .background {
      shape.fill(Theme.surface)
    }
    .overlay {
      shape.strokeBorder(Theme.separator, lineWidth: 1)
    }
    .clipShape(shape)
    // Light mode carries elevation via shadow; dark mode relies on the hairline
    // strokeBorder above (same recipe as OakCardModifier).
    .shadow(
      color: isLight ? Theme.Shadow.card.ambient.color : .clear,
      radius: Theme.Shadow.card.ambient.radius,
      y: Theme.Shadow.card.ambient.y
    )
    .shadow(
      color: isLight ? Theme.Shadow.card.key.color : .clear,
      radius: Theme.Shadow.card.key.radius,
      y: Theme.Shadow.card.key.y
    )
  }
}

// MARK: - Previews

#Preview("ErrorBanner — variants") {
  @MainActor func demo(_ scheme: ColorScheme) -> some View {
    VStack(spacing: Theme.Spacing.lg) {
      ErrorBanner(
        message: "Could not load history. Check your connection.",
        onDismiss: {}
      )
      ErrorBanner(
        message: "Request failed. Tap Retry to try again.",
        retryTitle: "Retry",
        onRetry: {},
        onDismiss: {}
      )
      ErrorBanner(
        message: "A longer error message that might need two lines to display correctly on smaller screens.",
        retryTitle: "Try again",
        onRetry: {}
      )
      ErrorBanner(
        message: "No dismiss or retry — informational only."
      )
    }
    .padding(Theme.Spacing.lg)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.canvas)
    .environment(\.colorScheme, scheme)
  }
  return HStack(spacing: 0) {
    demo(.light)
    demo(.dark)
  }
}
