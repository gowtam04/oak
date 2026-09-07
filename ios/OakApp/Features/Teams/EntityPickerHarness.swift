#if DEBUG
import SwiftUI

/// DEBUG-only visual harness for ``EntityPickerSheet``.
///
/// The team builder's entity picker sheet is only reachable behind a signed-in
/// account, which makes the sheet's system-chrome layout (inline nav bar + the
/// paper search pill) awkward to inspect or screenshot in isolation. This
/// harness presents the exact same ``EntityPickerSheet`` — same `NavigationStack`,
/// `List`, paper search field, and toolbar — over a static, offline `.options` source so
/// the chrome/inset behavior can be verified without a network round-trip or auth.
///
/// It is compiled only in DEBUG and only reached when the app is launched with the
/// ``launchFlag`` argument (e.g. `xcrun simctl launch booted <id> -OakUIPickerHarness`);
/// it is never in the view tree of a shipped build.
struct EntityPickerHarness: View {
  /// Launch argument that routes the app to this harness instead of `RootView`.
  static let launchFlag = "-OakUIPickerHarness"

  /// A static species-like option list, alphabetical, mirroring the real picker's
  /// look (display names, some forme parentheticals) so a screenshot matches what a
  /// tester sees.
  private static let sampleOptions: [PickerOption] = [
    "Abomasnow", "Abra", "Absol", "Accelgor", "Aegislash",
    "Basculegion (F)", "Bastiodon", "Beartic", "Beedrill", "Beedrill (Mega)",
    "Bellibolt", "Blastoise", "Blastoise (Mega)", "Blaziken", "Blaziken (Mega)",
    "Camerupt", "Camerupt (Mega)", "Charizard", "Charizard (Mega X)", "Clefable",
  ].map { PickerOption(slug: $0.lowercased().replacingOccurrences(of: " ", with: "-"), displayName: $0) }

  @State private var isPresented = true

  var body: some View {
    Theme.canvas
      .ignoresSafeArea()
      .sheet(isPresented: $isPresented) {
        EntityPickerSheet(
          title: "Species",
          source: .options(Self.sampleOptions),
          // A non-empty current value so the leading "Clear selection" row renders —
          // that row is the one the bug report shows clipped under the header.
          currentValue: "blastoise",
          search: { _, _ in [] },
          onSelect: { _ in }
        )
        .oakPaperSheet()
      }
  }
}
#endif
