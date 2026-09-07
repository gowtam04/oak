import SwiftUI

/// Dismissible soft-update sheet (P0). Presented over the tab shell when the App
/// Store has a newer marketing version than the installed build.
///
/// Primary action opens the store; secondary snoozes this store version (handled
/// by the host via ``onNotNow``). Swipe-to-dismiss is treated as "Not now" by the
/// host binding.
struct UpdateAvailableSheet: View {
  let offer: SoftUpdateOffer
  let onUpdate: () -> Void
  let onNotNow: () -> Void

  var body: some View {
    NavigationStack {
      VStack(spacing: Theme.Spacing.lg) {
        Image(systemName: "arrow.down.app.fill")
          .font(.system(size: 44))
          .foregroundStyle(Theme.accent)
          .accessibilityHidden(true)

        Text("Update available")
          .font(Theme.display(.title2))
          .multilineTextAlignment(.center)

        Text(bodyCopy)
          .font(Theme.body(.body))
          .foregroundStyle(Theme.textSecondary)
          .multilineTextAlignment(.center)

        Spacer(minLength: 0)

        VStack(spacing: Theme.Spacing.sm) {
          Button("Update", action: onUpdate)
            .buttonStyle(.oakPrimary)
            .accessibilityHint("Opens the App Store page for Oak.")

          Button("Not now", action: onNotNow)
            .buttonStyle(.oakSecondary)
            .accessibilityHint("Dismisses this prompt for a week.")
        }
      }
      .padding(Theme.Spacing.lg)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
      .background(Theme.canvas)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Close", action: onNotNow)
            .font(Theme.body(.body))
        }
      }
    }
    .oakEnamelNav()
    .presentationDetents([.medium])
    .presentationDragIndicator(.visible)
  }

  private var bodyCopy: String {
    "Oak \(offer.latest) is on the App Store. You’re on \(offer.local)."
  }
}

#if DEBUG
#Preview {
  UpdateAvailableSheet(
    offer: SoftUpdateOffer(
      latest: "1.0.3",
      local: "1.0.2",
      storeURL: LiveUpdateService.fallbackStoreURL
    ),
    onUpdate: {},
    onNotNow: {}
  )
}
#endif
