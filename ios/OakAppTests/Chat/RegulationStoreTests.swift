import Foundation
import Testing

@testable import OakApp

private struct StubRegulationService: RegulationService {
  var result: RegulationMeta?
  func current() async -> RegulationMeta? { result }
}

@MainActor
struct RegulationStoreTests {
  @Test
  func appStateFallsBackToChampionsWithNoCache() {
    let state = AppState(regulationStore: InMemoryRegulationStore())
    #expect(state.regulationChipLabel == "Champions")
    #expect(state.regulationHint == "Current Champions regulation")
  }

  @Test
  func appStatePaintsLastKnownOnInit() {
    let cached = RegulationMeta(
      format: .champions,
      regulation: "Regulation M-C",
      chipLabel: "Champions · Reg M-C",
      hint: "Current Champions regulation: Regulation M-C"
    )
    let state = AppState(regulationStore: InMemoryRegulationStore(snapshot: cached))
    #expect(state.regulationChipLabel == "Champions · Reg M-C")
    #expect(state.regulationHint.contains("M-C"))
  }

  @Test
  func refreshAppliesASuccessfulFetchAndPersists() async {
    let store = InMemoryRegulationStore()
    let state = AppState(regulationStore: store)
    let fetched = RegulationMeta(
      format: .champions,
      regulation: "Regulation M-C",
      chipLabel: "Champions · Reg M-C",
      hint: "Current Champions regulation: Regulation M-C"
    )
    await state.refreshRegulation(using: StubRegulationService(result: fetched))
    #expect(state.regulationChipLabel == "Champions · Reg M-C")
    #expect(store.snapshot == fetched)
  }

  @Test
  func refreshMissKeepsLastKnown() async {
    let cached = RegulationMeta(
      format: .champions,
      regulation: "Regulation M-B",
      chipLabel: "Champions · Reg M-B",
      hint: "Current Champions regulation: Regulation M-B"
    )
    let store = InMemoryRegulationStore(snapshot: cached)
    let state = AppState(regulationStore: store)
    await state.refreshRegulation(using: StubRegulationService(result: nil))
    #expect(state.regulationChipLabel == "Champions · Reg M-B")
    #expect(store.snapshot == cached)
  }

  @Test
  func userDefaultsRoundTrip() {
    let suiteName = "oak.regulation.tests.\(UUID().uuidString)"
    guard let defaults = UserDefaults(suiteName: suiteName) else {
      Issue.record("could not create suite UserDefaults")
      return
    }
    defaults.removePersistentDomain(forName: suiteName)
    defer { defaults.removePersistentDomain(forName: suiteName) }

    let store = UserDefaultsRegulationStore(defaults: defaults)
    #expect(store.snapshot == nil)

    let meta = RegulationMeta(
      format: .champions,
      regulation: "Regulation M-C",
      chipLabel: "Champions · Reg M-C",
      hint: "Current Champions regulation: Regulation M-C"
    )
    store.snapshot = meta
    #expect(store.snapshot == meta)
  }
}
