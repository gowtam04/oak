import Foundation
import Testing

@testable import OakApp

/// Pins `PadLayout` / `PadLayoutMode` (pure width → mode, layout constants,
/// companion stacking) and Chat inspector **column policy** (Phase 5).
/// Production types live in `ios/OakApp/Pad/PadLayout.swift`.
///
/// Expected API (`docs/features/ipad-app/architecture/api-design.md`):
///   `enum PadLayoutMode: Equatable, Sendable { case regular, medium, compact }`
///   `enum PadLayout` with named width/fraction constants and
///   `static func mode(for width: CGFloat) -> PadLayoutMode`
///   `static func stacksCompanion(width: CGFloat, height: CGFloat) -> Bool`
///   — true iff `height > width` (companion policy; prefer geometry over
///   size class so Split View tall windows stack).
///
/// Inspector pane policy lives on **one** helper the Phase 5 implementer
/// must extend in Pad chat files (`ios/OakApp/Pad/Chat/…`, not a new
/// `PadInspectorColumn` type for these pins). Keep P3 call sites compiling
/// by adding a default — do **not** add a second `showsListColumn` overload
/// that would be ambiguous with the default:
///
/// ```
/// enum PadChatColumns {
///   static func showsListColumn(mode: PadLayoutMode, inspectorOpen: Bool = false) -> Bool
///   static func showsPersistentList(mode:inspectorOpen:userCollapsed:) -> Bool
///     — userCollapsed default false; ANDs with showsListColumn (P-CHAT-AC-1.8)
///   static func showsInspector(mode: PadLayoutMode, inspectorOpen: Bool) -> Bool
///   static func stacksInspectorUnderThread(mode: PadLayoutMode) -> Bool // compact true
///   static func listShowsSignIn(isSignedIn: Bool) -> Bool // P3; unchanged
/// }
/// ```
///
/// Chat pane table (`api-design.md` P-SHELL-AC-5.4):
///   regular closed → list | thread                         list yes, inspector no
///   regular open   → list | thread | inspector             list yes, inspector yes, not stacked
///   medium closed  → list | thread                         list yes
///   medium open    → thread | inspector (list overlay)     list NO, inspector yes, not stacked
///   compact closed → thread; list overlay                  list no
///   compact open   → thread stacked above inspector        list no, inspector yes, stacked
///     (thread keeps the larger share — `PadLayout.stackedWorkspaceMinFraction`)
///
/// Overlay / back-to-list is not a second helper (P3). Pin strip UI is not
/// encoded here (`inspectorOpensFromPin` would be too weak). Artifact back
/// stack stays `ArtifactViewModelTests`. P-CHAT-BR-3 (Chat artifacts use the
/// inspector, not a sheet/panel) is the `showsInspector` column, not a
/// `PadArtifactSurface` pin.
///
/// Requirement refs: P-SHELL-US-5, P-SHELL-AC-5.1–5.4, P-UI-AC-4.3, ADR-P2,
/// P-ART-US-1, P-ART-US-2, P-CHAT-BR-1–3, P-CHAT-AC-1.6–1.7.
struct PadLayoutTests {

  // MARK: Constants

  @Test
  func layoutConstantsMatchApiDesign() {
    #expect(PadLayout.regularMinWidth == 1100)
    #expect(PadLayout.mediumMinWidth == 700)
    #expect(PadLayout.sidebarWidth == 220)
    #expect(PadLayout.sidebarRailWidth == 72)
    #expect(PadLayout.overlayControlInset == 56)
    #expect(PadLayout.chatListMinWidth == 260)
    #expect(PadLayout.inspectorMinWidth == 320)
    #expect(PadLayout.companionMinWidth == 320)
    #expect(PadLayout.readableProseWidth == 720)
    #expect(PadLayout.companionDefaultFraction == 0.38)
    #expect(PadLayout.companionMinFraction == 0.28)
    #expect(PadLayout.companionMaxFraction == 0.48)
    #expect(PadLayout.stackedWorkspaceMinFraction == 0.52)
  }

  // MARK: mode(for:) — implementation-plan widths + boundaries
  // regular: width >= 1100; medium: 700 ..< 1100; compact: < 700 (ADR-P2)

  @Test
  func modeForWidth1200IsRegular() {
    #expect(PadLayout.mode(for: 1200) == .regular)
  }

  @Test
  func modeForWidth900IsMedium() {
    #expect(PadLayout.mode(for: 900) == .medium)
  }

  @Test
  func modeForWidth600IsCompact() {
    #expect(PadLayout.mode(for: 600) == .compact)
  }

  @Test
  func modeBoundariesAt1100And700() {
    #expect(PadLayout.mode(for: 1100) == .regular)
    #expect(PadLayout.mode(for: 1099) == .medium)
    #expect(PadLayout.mode(for: 700) == .medium)
    #expect(PadLayout.mode(for: 699) == .compact)
  }

  @Test
  func layoutModesAreDistinctAndEquatable() {
    #expect(PadLayoutMode.regular == PadLayoutMode.regular)
    #expect(PadLayoutMode.regular != PadLayoutMode.medium)
    #expect(PadLayoutMode.medium != PadLayoutMode.compact)
    #expect(PadLayoutMode.compact != PadLayoutMode.regular)
  }

  // MARK: Companion stacking
  // P-SHELL-US-5 / api-design companion policy: stack when height > width
  // (portrait and tall Split View), even if mode(for: width) is medium/regular.

  @Test
  func stacksCompanionWhenHeightExceedsWidth() {
    #expect(PadLayout.mode(for: 900) == .medium)
    #expect(PadLayout.stacksCompanion(width: 900, height: 1200))

    #expect(PadLayout.mode(for: 1200) == .regular)
    #expect(!PadLayout.stacksCompanion(width: 1200, height: 900))
  }

  @Test
  func stacksCompanionIsHeightGreaterThanWidthOnly() {
    #expect(PadLayout.stacksCompanion(width: 600, height: 800))
    #expect(!PadLayout.stacksCompanion(width: 800, height: 600))
    #expect(!PadLayout.stacksCompanion(width: 1000, height: 1000))
    #expect(PadLayout.stacksCompanion(width: 1100, height: 1400))
  }

  // MARK: Chat inspector column policy (P-SHELL-AC-5.4)
  // Collapse order: hide the conversation list first (medium open), then
  // stack inspector under the thread (compact). Never three skinny columns.
  // P-ART-US-1 / P-ART-AC-1.1–1.2: inspector beside the thread when open;
  // dismiss restores remaining width (medium list returns).
  // P-CHAT-AC-1.6 medium overlay; P-CHAT-AC-1.7 compact stack.
  // P-CHAT-BR-3: Chat artifacts occupy this inspector column.

  @Test
  func regularClosedShowsListHidesInspector() {
    #expect(PadChatColumns.showsListColumn(mode: .regular, inspectorOpen: false) == true)
    #expect(PadChatColumns.showsInspector(mode: .regular, inspectorOpen: false) == false)
    #expect(PadChatColumns.stacksInspectorUnderThread(mode: .regular) == false)
  }

  @Test
  func regularOpenShowsListAndInspectorUnstacked() {
    #expect(PadChatColumns.showsListColumn(mode: .regular, inspectorOpen: true) == true)
    #expect(PadChatColumns.showsInspector(mode: .regular, inspectorOpen: true) == true)
    #expect(PadChatColumns.stacksInspectorUnderThread(mode: .regular) == false)
  }

  @Test
  func mediumClosedShowsListHidesInspector() {
    #expect(PadChatColumns.showsListColumn(mode: .medium, inspectorOpen: false) == true)
    #expect(PadChatColumns.showsInspector(mode: .medium, inspectorOpen: false) == false)
    #expect(PadChatColumns.stacksInspectorUnderThread(mode: .medium) == false)
  }

  @Test
  func mediumOpenHidesListShowsInspectorUnstacked() {
    // P-CHAT-AC-1.6: list is overlay/control, not a persistent column.
    #expect(PadChatColumns.showsListColumn(mode: .medium, inspectorOpen: true) == false)
    #expect(PadChatColumns.showsInspector(mode: .medium, inspectorOpen: true) == true)
    #expect(PadChatColumns.stacksInspectorUnderThread(mode: .medium) == false)
  }

  @Test
  func compactClosedHidesPersistentListAndInspector() {
    #expect(PadChatColumns.showsListColumn(mode: .compact, inspectorOpen: false) == false)
    #expect(PadChatColumns.showsInspector(mode: .compact, inspectorOpen: false) == false)
    #expect(PadChatColumns.stacksInspectorUnderThread(mode: .compact) == true)
  }

  @Test
  func compactOpenStacksInspectorUnderThread() {
    // P-CHAT-AC-1.7: inspector stacks under the thread; list stays overlay.
    #expect(PadChatColumns.showsListColumn(mode: .compact, inspectorOpen: true) == false)
    #expect(PadChatColumns.showsInspector(mode: .compact, inspectorOpen: true) == true)
    #expect(PadChatColumns.stacksInspectorUnderThread(mode: .compact) == true)
  }

  @Test
  func dismissingInspectorRestoresMediumListColumn() {
    // P-ART-AC-1.2: dismiss returns the thread to remaining width; list
    // comes back on medium. Regular list never left.
    #expect(PadChatColumns.showsListColumn(mode: .medium, inspectorOpen: true) == false)
    #expect(PadChatColumns.showsListColumn(mode: .medium, inspectorOpen: false) == true)
    #expect(PadChatColumns.showsInspector(mode: .medium, inspectorOpen: false) == false)
    #expect(PadChatColumns.showsListColumn(mode: .regular, inspectorOpen: false) == true)
  }

  @Test
  func showsListColumnDefaultsToInspectorClosed() {
    // P3 call sites (`showsListColumn(mode:)`) must keep compiling and
    // mean inspector-closed.
    #expect(
      PadChatColumns.showsListColumn(mode: .regular)
        == PadChatColumns.showsListColumn(mode: .regular, inspectorOpen: false)
    )
    #expect(
      PadChatColumns.showsListColumn(mode: .medium)
        == PadChatColumns.showsListColumn(mode: .medium, inspectorOpen: false)
    )
    #expect(
      PadChatColumns.showsListColumn(mode: .compact)
        == PadChatColumns.showsListColumn(mode: .compact, inspectorOpen: false)
    )
    #expect(PadChatColumns.showsListColumn(mode: .regular) == true)
    #expect(PadChatColumns.showsListColumn(mode: .medium) == true)
    #expect(PadChatColumns.showsListColumn(mode: .compact) == false)
  }

  @Test
  func inspectorPolicyFollowsLayoutModeWidths() {
    let regular = PadLayout.mode(for: 1200)
    let medium = PadLayout.mode(for: 900)
    let compact = PadLayout.mode(for: 600)
    #expect(regular == .regular)
    #expect(medium == .medium)
    #expect(compact == .compact)

    #expect(PadChatColumns.showsListColumn(mode: regular, inspectorOpen: true) == true)
    #expect(PadChatColumns.showsListColumn(mode: medium, inspectorOpen: true) == false)
    #expect(PadChatColumns.showsListColumn(mode: compact, inspectorOpen: true) == false)

    #expect(PadChatColumns.showsInspector(mode: regular, inspectorOpen: true) == true)
    #expect(PadChatColumns.showsInspector(mode: medium, inspectorOpen: true) == true)
    #expect(PadChatColumns.showsInspector(mode: compact, inspectorOpen: true) == true)

    #expect(PadChatColumns.stacksInspectorUnderThread(mode: regular) == false)
    #expect(PadChatColumns.stacksInspectorUnderThread(mode: medium) == false)
    #expect(PadChatColumns.stacksInspectorUnderThread(mode: compact) == true)
  }

  // MARK: User-collapsed Chat list (P-CHAT-AC-1.8)
  // Width/inspector table is unchanged; userCollapsed only ANDs off the
  // persistent column. Default false keeps P3 call sites.

  @Test
  func showsPersistentListDefaultsToNotUserCollapsed() {
    #expect(
      PadChatColumns.showsPersistentList(mode: .regular)
        == PadChatColumns.showsListColumn(mode: .regular)
    )
    #expect(
      PadChatColumns.showsPersistentList(mode: .medium)
        == PadChatColumns.showsListColumn(mode: .medium)
    )
    #expect(
      PadChatColumns.showsPersistentList(mode: .compact)
        == PadChatColumns.showsListColumn(mode: .compact)
    )
  }

  @Test
  func userCollapsedHidesPersistentListOnRegularEvenWithInspector() {
    #expect(
      PadChatColumns.showsPersistentList(
        mode: .regular,
        inspectorOpen: false,
        userCollapsed: true
      ) == false
    )
    #expect(
      PadChatColumns.showsPersistentList(
        mode: .regular,
        inspectorOpen: true,
        userCollapsed: true
      ) == false
    )
    #expect(
      PadChatColumns.showsListColumn(mode: .regular, inspectorOpen: true) == true
    )
  }

  @Test
  func userCollapsedDoesNotOverrideWidthForcedHide() {
    #expect(
      PadChatColumns.showsPersistentList(
        mode: .medium,
        inspectorOpen: true,
        userCollapsed: false
      ) == false
    )
    #expect(
      PadChatColumns.showsPersistentList(
        mode: .compact,
        inspectorOpen: false,
        userCollapsed: false
      ) == false
    )
  }

  @Test
  func compactStackedInspectorGivesThreadLargerShare() {
    // P-CHAT-AC-1.7 / P-SHELL-AC-5.4: thread keeps the larger share when
    // stacked. The fraction clamp is the existing PadLayout constant
    // (workspace/thread ≥ 0.52); do not invent a second inspector fraction.
    #expect(PadChatColumns.stacksInspectorUnderThread(mode: .compact) == true)
    #expect(PadLayout.stackedWorkspaceMinFraction > 0.5)
    #expect(PadLayout.stackedWorkspaceMinFraction == 0.52)
  }
}
