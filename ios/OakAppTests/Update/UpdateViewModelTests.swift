import Foundation
import Testing

@testable import OakApp

/// ``UpdateViewModel`` against ``FakeUpdateService`` + in-memory prompt store.
@MainActor
struct UpdateViewModelTests {

  private let storeURL = URL(string: "https://apps.apple.com/app/id6786014161")!

  private func makeVM(
    result: UpdateCheckResult = .upToDate,
    local: String = "1.0.1",
    now: Date = Date(timeIntervalSince1970: 1_700_000_000),
    store: InMemoryUpdatePromptStore = InMemoryUpdatePromptStore()
  ) -> (UpdateViewModel, FakeUpdateService, InMemoryUpdatePromptStore, OpenURLProbe) {
    let fake = FakeUpdateService()
    fake.result = result
    let probe = OpenURLProbe()
    var clock = now
    let vm = UpdateViewModel(
      service: fake,
      store: store,
      openURL: { probe.open($0) },
      now: { clock },
      localVersion: { local }
    )
    // Expose a mutable clock via the store side-channel for snooze expiry tests.
    _ = clock
    return (vm, fake, store, probe)
  }

  // MARK: Auto-check

  @Test
  func autoCheckAvailablePresentsSoftUpdate() async {
    let (vm, fake, store, _) = makeVM(
      result: .available(latest: "1.0.2", storeURL: storeURL),
      local: "1.0.1"
    )

    await vm.checkIfNeeded()

    #expect(fake.checkCount == 1)
    #expect(vm.pendingSoftUpdate?.latest == "1.0.2")
    #expect(vm.pendingSoftUpdate?.local == "1.0.1")
    #expect(store.lastCheckAt != nil)
    #expect(vm.manualMessage == nil)
  }

  @Test
  func autoCheckUnavailableIsSilent() async {
    let (vm, fake, _, _) = makeVM(result: .unavailable)

    await vm.checkIfNeeded()

    #expect(fake.checkCount == 1)
    #expect(vm.pendingSoftUpdate == nil)
    #expect(vm.manualMessage == nil)
  }

  @Test
  func autoCheckUpToDateClearsPending() async {
    let (vm, _, _, _) = makeVM(result: .upToDate)

    await vm.checkIfNeeded()

    #expect(vm.pendingSoftUpdate == nil)
    #expect(vm.manualMessage == nil)
  }

  @Test
  func autoCheckThrottledWithin24Hours() async {
    let store = InMemoryUpdatePromptStore()
    let now = Date(timeIntervalSince1970: 1_700_000_000)
    store.lastCheckAt = now.addingTimeInterval(-60)  // one minute ago
    let (vm, fake, _, _) = makeVM(
      result: .available(latest: "1.0.2", storeURL: storeURL),
      now: now,
      store: store
    )

    await vm.checkIfNeeded()

    #expect(fake.checkCount == 0)
    #expect(vm.pendingSoftUpdate == nil)
  }

  @Test
  func autoCheckRunsAfterThrottleExpires() async {
    let store = InMemoryUpdatePromptStore()
    let now = Date(timeIntervalSince1970: 1_700_000_000)
    store.lastCheckAt = now.addingTimeInterval(-(UpdateViewModel.checkInterval + 1))
    let (vm, fake, _, _) = makeVM(
      result: .available(latest: "1.0.2", storeURL: storeURL),
      now: now,
      store: store
    )

    await vm.checkIfNeeded()

    #expect(fake.checkCount == 1)
    #expect(vm.pendingSoftUpdate?.latest == "1.0.2")
  }

  // MARK: Snooze

  @Test
  func dismissSoftUpdateSnoozesVersion() async {
    let store = InMemoryUpdatePromptStore()
    let now = Date(timeIntervalSince1970: 1_700_000_000)
    let (vm, fake, _, _) = makeVM(
      result: .available(latest: "1.0.2", storeURL: storeURL),
      now: now,
      store: store
    )

    await vm.checkIfNeeded()
    #expect(vm.pendingSoftUpdate != nil)
    vm.dismissSoftUpdate()
    #expect(vm.pendingSoftUpdate == nil)
    #expect(store.dismissedVersion == "1.0.2")
    #expect(store.dismissedAt == now)

    // Clear throttle so auto-check would run again — snooze should still suppress.
    store.lastCheckAt = nil
    await vm.checkIfNeeded()
    #expect(fake.checkCount == 2)
    #expect(vm.pendingSoftUpdate == nil)
  }

  @Test
  func snoozeExpiresAfterSevenDays() async {
    let store = InMemoryUpdatePromptStore()
    let dismissedAt = Date(timeIntervalSince1970: 1_700_000_000)
    store.dismissedVersion = "1.0.2"
    store.dismissedAt = dismissedAt

    var current = dismissedAt.addingTimeInterval(UpdateViewModel.snoozeInterval + 1)
    let fake = FakeUpdateService()
    fake.result = .available(latest: "1.0.2", storeURL: storeURL)
    let vm = UpdateViewModel(
      service: fake,
      store: store,
      openURL: { _ in },
      now: { current },
      localVersion: { "1.0.1" }
    )

    await vm.checkIfNeeded()
    #expect(vm.pendingSoftUpdate?.latest == "1.0.2")
    _ = current  // keep the clock captured
  }

  // MARK: Manual

  @Test
  func manualCheckBypassesThrottle() async {
    let store = InMemoryUpdatePromptStore()
    let now = Date(timeIntervalSince1970: 1_700_000_000)
    store.lastCheckAt = now  // just checked
    let (vm, fake, _, _) = makeVM(
      result: .upToDate,
      now: now,
      store: store
    )

    await vm.checkManually()

    #expect(fake.checkCount == 1)
    #expect(vm.manualMessage == UpdateViewModel.upToDateMessage)
  }

  @Test
  func manualCheckShowsErrorWhenUnavailable() async {
    let (vm, _, _, _) = makeVM(result: .unavailable)

    await vm.checkManually()

    #expect(vm.manualMessage == UpdateViewModel.checkFailedMessage)
    #expect(vm.pendingSoftUpdate == nil)
  }

  @Test
  func manualCheckShowsSheetEvenWhenSnoozed() async {
    let store = InMemoryUpdatePromptStore()
    let now = Date(timeIntervalSince1970: 1_700_000_000)
    store.dismissedVersion = "1.0.2"
    store.dismissedAt = now
    store.lastCheckAt = now
    let (vm, fake, _, _) = makeVM(
      result: .available(latest: "1.0.2", storeURL: storeURL),
      now: now,
      store: store
    )

    await vm.checkManually()

    #expect(fake.checkCount == 1)
    #expect(vm.pendingSoftUpdate?.latest == "1.0.2")
    #expect(vm.manualMessage == nil)
  }

  // MARK: Open store

  @Test
  func openStoreOpensURLAndClearsSheetWithoutSnooze() async {
    let store = InMemoryUpdatePromptStore()
    let (vm, _, _, probe) = makeVM(
      result: .available(latest: "1.0.2", storeURL: storeURL),
      store: store
    )

    await vm.checkIfNeeded()
    vm.openStore()

    #expect(probe.opened == [storeURL])
    #expect(vm.pendingSoftUpdate == nil)
    #expect(store.dismissedVersion == nil)
  }

  @Test
  func dismissManualMessageClearsStatus() async {
    let (vm, _, _, _) = makeVM(result: .upToDate)
    await vm.checkManually()
    #expect(vm.manualMessage != nil)
    vm.dismissManualMessage()
    #expect(vm.manualMessage == nil)
  }
}

/// Records URLs passed to the injected openURL closure.
@MainActor
final class OpenURLProbe {
  private(set) var opened: [URL] = []
  func open(_ url: URL) { opened.append(url) }
}
