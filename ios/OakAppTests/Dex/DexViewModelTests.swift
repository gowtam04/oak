import Foundation
import Testing

@testable import OakApp

@MainActor
struct DexViewModelTests {

  @Test
  func startLoadsBlankBrowseForPokemon() async {
    let fake = FakeDexLookupService()
    fake.searchResults["pokemon:"] = [
      SearchMatch(slug: "abra", displayName: "Abra", kind: .pokemon),
    ]
    let model = DexViewModel(dexLookup: fake, format: .scarletViolet)
    model.start()
    // Allow the Task in reload() to settle.
    await Task.yield()
    await waitUntil { !model.isLoading }

    #expect(model.section == .pokemon)
    #expect(model.matches.map(\.slug) == ["abra"])
    #expect(fake.searchCalls.count == 1)
    #expect(fake.searchCalls[0].kind == .pokemon)
    #expect(fake.searchCalls[0].query == "")
    #expect(fake.searchCalls[0].format == .scarletViolet)
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
    let model = DexViewModel(dexLookup: fake, format: .nationalDex)
    model.start()
    await waitUntil { !model.isLoading }

    model.selectSection(.move)
    await waitUntil { model.section == .move && !model.isLoading }

    #expect(model.matches.map(\.slug) == ["earthquake"])
    #expect(fake.searchCalls.last?.kind == .move)
  }

  @Test
  func selectFormatReloadsWithNewScope() async {
    let fake = FakeDexLookupService()
    fake.searchResults["pokemon:"] = [
      SearchMatch(slug: "pikachu", displayName: "Pikachu", kind: .pokemon),
    ]
    let model = DexViewModel(dexLookup: fake, format: .nationalDex)
    model.start()
    await waitUntil { !model.isLoading }

    model.selectFormat(.gen7)
    await waitUntil { model.format == .gen7 && !model.isLoading }

    #expect(fake.searchCalls.last?.format == .gen7)
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
