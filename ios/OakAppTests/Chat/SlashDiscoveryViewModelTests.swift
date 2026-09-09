import Foundation
import Testing
import UIKit

@testable import OakApp

/// Slash-discovery P3 — `ChatViewModel` send intercept for help / bare `/`,
/// Usage slug, Dex kind hops, and images kept on handled slashes.
///
/// Style cloned from `ChatViewModelTests` (`makeViewModel`, `FakeChatService`,
/// `slashIsNotInterceptedWhileEditing`). New cases live here; do not restripe
/// `ChatViewModelTests.swift`. Native has no command palette (SD-AC-8.6,
/// SD-AC-9.1 / SD-AC-9.2) — this suite does not add palette coverage.
///
/// Expected ChatViewModel surface (P3 implementer):
///   `init(..., dexLookup: (any DexLookupService)? = nil, ...)`
///   `dexBind: DexBind?` — set when a Dex name row is picked; Send of `/dex`
///     with a still-valid bind hops `.dexHop(DexArtifactHop(kind:query:format:))`
///   `appState.pendingDestination`:
///     `/dex` no arg → `.dex(query: nil)`
///     `/dex` with bind / resolved kind → `.dexHop(DexArtifactHop(kind:, query: slug or displayName, format: .champions))`
///     `/usage` → `.usage(slug: resolvedSlug or nil)`
///   `/help` and bare `/` → `composerText = "/"`; do not clear `pendingImages`
///   Other hops → `composerText = ""`; keep `pendingImages`
///   Edit last does not intercept (SD-AC-2.5 / SD-BR-8)
///
/// Fails to compile until P3 wires `dexLookup` / `dexBind` / `.help` / `.bare`.
///
/// Requirement refs: SD-US-1…7, SD-AC-4.1, SD-AC-5.2, SD-AC-5.7, SD-AC-5.9,
/// SD-AC-7.1, SD-AC-8.6, SD-AC-9.1, SD-BR-2, SD-BR-8.
@MainActor
struct SlashDiscoveryViewModelTests {

  // MARK: Helpers

  private func makeViewModel(
    fake: FakeChatService,
    appState: AppState = AppState(),
    dexLookup: (any DexLookupService)? = nil,
    teams: (any TeamService)? = nil
  ) -> ChatViewModel {
    ChatViewModel(
      chat: fake,
      appState: appState,
      teams: teams,
      dexLookup: dexLookup,
      usesBackgroundGrace: false
    )
  }

  private func sampleImage() -> UIImage {
    UIImage(systemName: "photo") ?? UIImage()
  }

  private func attachOneImage(_ vm: ChatViewModel) {
    #expect(vm.attachImages([sampleImage()]) == 1)
    #expect(vm.pendingImages.count == 1)
  }

  // MARK: SD-AC-4.1 / SD-AC-5.9 — /help

  @Test
  func helpSendDoesNotStreamPrefillsSlashAndKeepsImages() {
    let fake = FakeChatService()
    let vm = makeViewModel(fake: fake)
    attachOneImage(vm)
    vm.composerText = "/help"

    vm.send()

    #expect(fake.sendCount == 0)
    #expect(vm.turns.isEmpty)
    #expect(vm.isStreaming == false)
    #expect(vm.streamTask == nil)
    #expect(vm.composerText == "/")
    #expect(vm.pendingImages.count == 1)
    #expect(vm.errorBanner == nil)
  }

  @Test
  func helpWithExtraWordsStillPrefillsSlashAndDoesNotStream() {
    let fake = FakeChatService()
    let vm = makeViewModel(fake: fake)
    attachOneImage(vm)
    vm.composerText = "/help extra words"

    vm.send()

    #expect(fake.sendCount == 0)
    #expect(vm.composerText == "/")
    #expect(vm.pendingImages.count == 1)
  }

  // MARK: SD-AC-7.1 / SD-AC-5.9 — bare /

  @Test
  func bareSlashSendDoesNotStreamKeepsSlashAndImages() {
    let fake = FakeChatService()
    let vm = makeViewModel(fake: fake)
    attachOneImage(vm)
    vm.composerText = "/"

    vm.send()

    #expect(fake.sendCount == 0)
    #expect(vm.turns.isEmpty)
    #expect(vm.isStreaming == false)
    #expect(vm.composerText == "/")
    #expect(vm.pendingImages.count == 1)
    #expect(vm.errorBanner == nil)
  }

  @Test
  func whitespaceBareSlashSendKeepsLeadingSlashAndDoesNotStream() {
    let fake = FakeChatService()
    let vm = makeViewModel(fake: fake)
    attachOneImage(vm)
    vm.composerText = " / "

    vm.send()

    #expect(fake.sendCount == 0)
    #expect(vm.composerText == "/")
    #expect(vm.pendingImages.count == 1)
  }

  // MARK: SD-AC-5.7 — /usage slug

  @Test
  func usageWithAResolvedSpeciesHopsUsageSlugAndDoesNotStream() async {
    let fake = FakeChatService()
    let dex = FakeDexLookupService()
    dex.searchResults["pokemon:garchomp"] = [
      SearchMatch(slug: "garchomp", displayName: "Garchomp", kind: .pokemon),
    ]
    let appState = AppState()
    let vm = makeViewModel(fake: fake, appState: appState, dexLookup: dex)
    vm.composerText = "/usage garchomp"

    vm.send()
    await waitUntil { appState.pendingDestination != nil }

    #expect(fake.sendCount == 0)
    #expect(vm.turns.isEmpty)
    #expect(vm.isStreaming == false)
    #expect(appState.pendingDestination == .usage(slug: "garchomp"))
  }

  @Test
  func unmatchedUsageTokenHopsUsageIndex() async {
    let fake = FakeChatService()
    let dex = FakeDexLookupService()
    let appState = AppState()
    let vm = makeViewModel(fake: fake, appState: appState, dexLookup: dex)
    vm.composerText = "/usage zzq"

    vm.send()
    await waitUntil { appState.pendingDestination != nil }

    #expect(fake.sendCount == 0)
    #expect(appState.pendingDestination == .usage(slug: nil))
  }

  @Test
  func usageMoveNameHopsUsageIndexNotASpecies() async {
    let fake = FakeChatService()
    let dex = FakeDexLookupService()
    dex.searchResults["move:earthquake"] = [
      SearchMatch(slug: "earthquake", displayName: "Earthquake", kind: .move),
    ]
    let appState = AppState()
    let vm = makeViewModel(fake: fake, appState: appState, dexLookup: dex)
    vm.composerText = "/usage earthquake"

    vm.send()
    await waitUntil { appState.pendingDestination != nil }

    #expect(fake.sendCount == 0)
    #expect(appState.pendingDestination == .usage(slug: nil))
  }

  // MARK: SD-AC-5.2 — /dex hops

  @Test
  func dexWithNoArgHopsDexIndex() async {
    let fake = FakeChatService()
    let appState = AppState()
    let vm = makeViewModel(fake: fake, appState: appState)
    vm.composerText = "/dex"

    vm.send()
    await waitUntil { appState.pendingDestination != nil }

    #expect(fake.sendCount == 0)
    #expect(vm.turns.isEmpty)
    #expect(appState.pendingDestination == .dex(query: nil))
  }

  @Test
  func dexWithPokemonBindHopsDexArtifact() async {
    let fake = FakeChatService()
    let appState = AppState()
    let vm = makeViewModel(fake: fake, appState: appState)
    vm.dexBind = DexBind(kind: .pokemon, slug: "garchomp", displayName: "Garchomp")
    vm.composerText = "/dex Garchomp"

    vm.send()
    await waitUntil { appState.pendingDestination != nil }

    #expect(fake.sendCount == 0)
    #expect(
      appState.pendingDestination
        == .dexHop(DexArtifactHop(kind: .pokemon, query: "garchomp", format: .champions))
    )
  }

  @Test
  func dexWithMoveBindHopsMoveKindNotPokemon() async {
    let fake = FakeChatService()
    let appState = AppState()
    let vm = makeViewModel(fake: fake, appState: appState)
    vm.dexBind = DexBind(kind: .move, slug: "earthquake", displayName: "Earthquake")
    vm.composerText = "/dex Earthquake"

    vm.send()
    await waitUntil { appState.pendingDestination != nil }

    #expect(fake.sendCount == 0)
    #expect(
      appState.pendingDestination
        == .dexHop(DexArtifactHop(kind: .move, query: "earthquake", format: .champions))
    )
  }

  @Test
  func dexHopDoesNotClearPendingImages() async {
    let fake = FakeChatService()
    let appState = AppState()
    let vm = makeViewModel(fake: fake, appState: appState)
    attachOneImage(vm)
    vm.composerText = "/dex"

    vm.send()
    await waitUntil { appState.pendingDestination != nil }

    #expect(fake.sendCount == 0)
    #expect(appState.pendingDestination == .dex(query: nil))
    #expect(vm.pendingImages.count == 1)
    #expect(vm.composerText == "")
  }

  // MARK: SD-AC-2.5 / SD-BR-8 — edit last is not intercepted

  @Test
  func slashIsNotInterceptedWhileEditing() async throws {
    let fake = FakeChatService()
    fake.scriptedEvents = [
      .answer(try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")),
    ]
    let vm = makeViewModel(fake: fake)
    vm.composerText = "first"
    vm.send()
    await vm.streamTask?.value

    vm.beginEditLast()
    vm.composerText = "/new"
    fake.scriptedEvents = [
      .answer(try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")),
    ]
    vm.send()
    await vm.streamTask?.value

    #expect(fake.sendCount == 2)
    #expect(fake.lastRecovery == .edit)
    #expect(fake.lastMessage == "/new")
  }

  // MARK: SD-BR-2 / SD-AC-7.2 — unknown slash still streams

  @Test
  func unknownSlashStillStreamsAsAMessage() async throws {
    let fake = FakeChatService()
    fake.scriptedEvents = [
      .answer(try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")),
    ]
    let vm = makeViewModel(fake: fake)
    vm.composerText = "/foo"

    vm.send()
    await vm.streamTask?.value

    #expect(fake.sendCount == 1)
    #expect(fake.lastMessage == "/foo")
    #expect(fake.lastRecovery == nil)
    #expect(vm.turns.isEmpty == false)
  }
}

/// Poll until `predicate` is true or a short timeout elapses (send-time Dex /
/// Usage resolve may hop off the main actor after `await` search).
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
