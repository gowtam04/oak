import Foundation
import Testing

@testable import OakApp

/// Champions-first (CF-DEX-US-1): Dex defaults to Champions and ignores leftover
/// format writes — there is no National Dex / gen-N picker.
@MainActor
struct DexViewModelTests {

  @Test
  func startLoadsBlankBrowseForPokemon() async {
    let fake = FakeDexLookupService()
    fake.searchResults["pokemon:"] = [
      SearchMatch(slug: "abra", displayName: "Abra", kind: .pokemon),
    ]
    let model = DexViewModel(dexLookup: fake)
    model.start()
    // Allow the Task in reload() to settle.
    await Task.yield()
    await waitUntil { !model.isLoading }

    #expect(model.section == .pokemon)
    #expect(model.format == .champions)
    #expect(model.matches.map(\.slug) == ["abra"])
    #expect(fake.searchCalls.count == 1)
    #expect(fake.searchCalls[0].kind == .pokemon)
    #expect(fake.searchCalls[0].query == "")
    #expect(fake.searchCalls[0].format == .champions)
  }

  @Test
  func selectSectionReloadsWithNewKind() async {
    let fake = FakeDexLookupService()
    fake.searchResults["pokemon:"] = [
      SearchMatch(slug: "abra", displayName: "Abra", kind: .pokemon),
    ]
    fake.searchResults["move:"] = [
      SearchMatch(slug: "earthquake", displayName: "Earthquake", kind: .move),
    ]
    let model = DexViewModel(dexLookup: fake)
    model.start()
    await waitUntil { !model.isLoading }

    model.selectSection(.move)
    await waitUntil { model.section == .move && !model.isLoading }

    #expect(model.matches.map(\.slug) == ["earthquake"])
    #expect(fake.searchCalls.last?.kind == .move)
    #expect(fake.searchCalls.last?.format == .champions)
  }

  /// CF-DEX-AC-1.5 / CF-UI-AC-1.1 — Dex is Champions-only; leftover format
  /// writes must not reopen National Dex / gen-N.
  @Test
  func selectFormatDoesNotChangeChampionsScope() async {
    let fake = FakeDexLookupService()
    fake.searchResults["pokemon:"] = [
      SearchMatch(slug: "pikachu", displayName: "Pikachu", kind: .pokemon),
    ]
    let model = DexViewModel(dexLookup: fake)
    model.start()
    await waitUntil { !model.isLoading }

    model.selectFormat(.gen7)
    await waitUntil { !model.isLoading }

    #expect(model.format == .champions)
    #expect(fake.searchCalls.last?.format == .champions)
  }

  @Test
  func defaultInitIsChampionsWithNoFormatPicker() {
    let model = DexViewModel(dexLookup: FakeDexLookupService())
    #expect(model.format == .champions)
  }

  // MARK: Artifact hop — stays Champions (CF-DEX-US-1)

  @Test
  func applyArtifactHopStaysOnChampionsAndQueuesTheEntityRoute() async {
    let fake = FakeDexLookupService()
    fake.searchResults["move:"] = [
      SearchMatch(slug: "earthquake", displayName: "Earthquake", kind: .move),
    ]
    let model = DexViewModel(dexLookup: fake)
    model.start()
    await waitUntil { !model.isLoading }

    model.applyArtifactHop(
      DexArtifactHop(kind: .move, query: "earthquake", format: .gen5)
    )
    await waitUntil { model.section == .move && !model.isLoading }

    #expect(model.format == .champions)
    #expect(model.section == .move)
    #expect(model.pendingRoute == DexEntityRoute(kind: .move, query: "earthquake"))
    #expect(fake.searchCalls.last?.format == .champions)
    #expect(fake.searchCalls.last?.kind == .move)
  }

  @Test
  func applyArtifactHopDoesNotAdoptAnotherGame() async {
    let fake = FakeDexLookupService()
    let model = DexViewModel(dexLookup: fake)

    model.applyArtifactHop(
      DexArtifactHop(kind: .pokemon, query: "Garchomp", format: .gen5)
    )

    #expect(model.format == .champions)
    #expect(model.pendingRoute?.kind == .pokemon)
    #expect(model.pendingRoute?.query == "Garchomp")
  }
}

/// Poll until `predicate` is true or a short timeout elapses (view-model Tasks
/// hop off the main actor briefly after `await` service calls).
@MainActor
private func waitUntil(
  timeoutMs: Int = 500,
  _ predicate: @MainActor () -> Bool
) async {
  let steps = max(timeoutMs / 10, 1)
  for _ in 0..<steps {
    if predicate() { return }
    try? await Task.sleep(nanoseconds: 10_000_000)
  }
}
