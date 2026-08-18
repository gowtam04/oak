import Foundation
import Testing

@testable import OakApp

/// `PinnedArtifactStripViewModel` — conversation pin strip (PIN-US-1–3).
/// Hidden when empty or guest. Tap reopens the snapshot. Unpin is immediate.
///
/// Expected API (`ios/OakApp/Features/Artifact/PinnedArtifactStrip.swift`):
///   `PinnedArtifactStripViewModel(pins:isSignedIn:conversationId:)`
///   `isVisible` — false when guest or `pins` is empty
///   `load()`, `open(id:)`, `unpin(id:)`
///
/// Requirement refs: PIN-US-1, PIN-US-2, PIN-US-3, PIN-AC-1.4, PIN-AC-3.2,
/// PIN-AC-3.4, AUTH-BR-1.
@MainActor
struct PinnedArtifactStripTests {

  private func summary(
    id: String,
    kind: ArtifactPinKind = .calc,
    title: String = "Calc"
  ) -> PinnedArtifactSummary {
    PinnedArtifactSummary(id: id, kind: kind, title: title, createdAt: 1)
  }

  private func makeVM(
    seed: [PinnedArtifactSummary],
    signedIn: Bool = true,
    conversationId: String = "conv-1"
  ) -> (PinnedArtifactStripViewModel, FakeArtifactPinService) {
    let service = FakeArtifactPinService(seed: seed)
    let vm = PinnedArtifactStripViewModel(
      pins: service,
      isSignedIn: signedIn,
      conversationId: conversationId
    )
    return (vm, service)
  }

  @Test
  func emptyStripIsNotVisible() async {
    let (vm, _) = makeVM(seed: [])
    await vm.load()

    #expect(vm.pins.isEmpty)
    #expect(vm.isVisible == false)
  }

  @Test
  func guestStripIsNeverVisibleAndDoesNotFetch() async {
    let (vm, fake) = makeVM(
      seed: [summary(id: "p1")],
      signedIn: false
    )
    await vm.load()

    #expect(vm.isVisible == false)
    #expect(vm.pins.isEmpty)
    #expect(fake.listCount == 0)
  }

  @Test
  func signedInStripListsThisConversationOnly() async {
    let (vm, fake) = makeVM(
      seed: [
        summary(id: "p1", kind: .comparison, title: "Garchomp vs Dragapult"),
        summary(id: "p2", kind: .teamSheet, title: "Sun Offense"),
      ]
    )
    await vm.load()

    #expect(vm.isVisible)
    #expect(vm.pins.map(\.id) == ["p1", "p2"])
    #expect(fake.lastConversationId == "conv-1")
  }

  @Test
  func unpinRemovesImmediatelyWithoutAConfirm() async {
    let (vm, fake) = makeVM(seed: [summary(id: "p1"), summary(id: "p2")])
    await vm.load()

    await vm.unpin(id: "p1")

    #expect(fake.deleteCount == 1)
    #expect(fake.lastDeletedId == "p1")
    #expect(vm.pins.map(\.id) == ["p2"])
    #expect(vm.isVisible)
  }

  @Test
  func unpinningTheLastPinHidesTheStrip() async {
    let (vm, _) = makeVM(seed: [summary(id: "p1")])
    await vm.load()
    #expect(vm.isVisible)

    await vm.unpin(id: "p1")

    #expect(vm.pins.isEmpty)
    #expect(vm.isVisible == false)
  }

  @Test
  func tappingAStripItemOpensThatSnapshot() async {
    let calc = Artifact(title: "Damage calculation", content: .damageCalc(
      DamageCalc(assumptions: [:], result: [:], isEstimate: true, breakdown: nil)
    ))
    let service = FakeArtifactPinService(
      seed: [summary(id: "p1", kind: .calc, title: "EQ vs Farigiraf")],
      snapshots: ["p1": calc]
    )
    let vm = PinnedArtifactStripViewModel(
      pins: service,
      isSignedIn: true,
      conversationId: "conv-1"
    )
    await vm.load()

    let opened = await vm.open(id: "p1")

    #expect(service.getCount == 1)
    #expect(opened?.title == "Damage calculation")
    guard case .damageCalc = opened?.content else {
      Issue.record("expected the pinned calc snapshot")
      return
    }
  }
}
