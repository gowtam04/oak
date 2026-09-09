import Testing

@testable import OakApp

/// Root tab catalogue (Champions-first P7, ADR-6).
///
/// iOS Usage is a **fifth tab** — Chat / Teams / Usage / Dex / Settings — with
/// Calc remaining a cover, not a tab. `AppTab` today is a private nested type
/// on `RootView` with four cases; P7 must promote it to an internal
/// `CaseIterable` enum (file- or module-scoped) so this pin compiles.
///
/// Expected API (`ios/OakApp/App/RootView.swift` or `AppTab.swift`):
///   `enum AppTab: String, CaseIterable, Hashable, Sendable`
///   cases in display order: `chat`, `teams`, `usage`, `dex`, `settings`
///
/// Requirement refs: CF-OPS-BR-4, CF-UI-AC-6.4, ADR-6.
struct AppTabTests {

  @Test
  func fiveRootTabsInAdr6Order() {
    #expect(
      AppTab.allCases.map(\.rawValue) == [
        "chat", "teams", "usage", "dex", "settings",
      ])
  }

  @Test
  func usageIsARootTabNotADexSection() {
    #expect(AppTab.allCases.contains(.usage))
    #expect(!DexSection.allCases.map(\.rawValue).contains("usage"))
  }

  @Test
  func calcIsNotARootTab() {
    #expect(!AppTab.allCases.map(\.rawValue).contains("calc"))
    #expect(!AppTab.allCases.map(\.rawValue).contains("calculator"))
  }
}
