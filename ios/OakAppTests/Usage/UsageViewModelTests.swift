import Foundation
import Testing

@testable import OakApp

/// `UsageViewModel` against `FakeUsageService` (Champions-first P7, ADR-5 / ADR-6).
///
/// Public live Champions ladder — Doubles default, Singles as the other view,
/// unavailable fail-soft, no Smogon OU. Compile-fail until P7 adds:
///
/// Expected API (`ios/OakApp/Features/Usage/UsageViewModel.swift` + wire):
///   `enum UsageLadder: String, Codable, Sendable { case doubles, singles }`
///   `struct UsageLeaderboardRow` — `rank`, `name`, `slug`, `usagePct` (wire
///     `usage_pct`, optional), `sprite?`. `id` is `slug`.
///   `struct UsageLeaderboard` — `available`, `ladder`, `season?`, `fetchedAt?`
///     (wire `fetched_at`), `attribution?`, `error?`, `rows`.
///   `struct UsageSpeciesResponse` — `available`, `found?`, `slug?`, season /
///     fetchedAt / attribution, `error?`.
///   `UsageViewModel(usage:isSignedIn:)`
///     `ladder` defaults `.doubles` (CF-USAGE-AC-1.2, CF-AS-2 — not persisted)
///     `requiresSignIn == false` (CF-USAGE-AC-1.1 / CF-AS-1 — public)
///     `start()` / `selectLadder(_:)` load via `UsageService.leaderboard`
///     `isUnavailable` when `available == false`; `rows` empty; no Smogon copy
///     `openSpecies(_:)` drill-in (CF-USAGE-AC-1.4)
///
/// Requirement refs: CF-USAGE-US-1, CF-USAGE-AC-1.1–1.6, CF-UI-US-6,
/// CF-UI-AC-6.1–6.3, CF-AS-1, CF-AS-2, CF-INT-BR-6, CF-INT-BR-7, ADR-5, ADR-6.
@MainActor
struct UsageViewModelTests {

  private func availableBoard(
    ladder: UsageLadder = .doubles,
    rows: [UsageLeaderboardRow] = [
      UsageLeaderboardRow(rank: 1, name: "Garchomp", slug: "garchomp", usagePct: 22.0, sprite: nil),
      UsageLeaderboardRow(rank: 3, name: "Farigiraf", slug: "farigiraf", usagePct: 11.0, sprite: nil),
    ]
  ) -> UsageLeaderboard {
    UsageLeaderboard(
      available: true,
      ladder: ladder,
      season: "Current",
      fetchedAt: 1_700_000_000_000,
      attribution: "championsbattledata.com — a community-maintained Pokémon Champions project",
      error: nil,
      rows: rows
    )
  }

  private func makeVM(
    signedIn: Bool = false,
    fake: FakeUsageService = FakeUsageService()
  ) -> (UsageViewModel, FakeUsageService) {
    (UsageViewModel(usage: fake, isSignedIn: signedIn), fake)
  }

  // MARK: CF-USAGE-AC-1.2 / CF-UI-AC-6.1 / CF-AS-2 — Doubles default

  @Test
  func opensOnDoublesWithoutPersistingTheLadder() async {
    let fake = FakeUsageService()
    fake.nextLeaderboard = availableBoard()
    let (vm, _) = makeVM(fake: fake)

    #expect(vm.ladder == .doubles)
    await vm.start()

    #expect(fake.leaderboardCount == 1)
    #expect(fake.lastLeaderboardLadder == .doubles)
    #expect(vm.ladder == .doubles)
    #expect(vm.rows.map(\.slug) == ["garchomp", "farigiraf"])

    // A fresh VM does not inherit Singles (CF-AS-2).
    await vm.selectLadder(.singles)
    #expect(vm.ladder == .singles)
    let (fresh, _) = makeVM()
    #expect(fresh.ladder == .doubles)
  }

  @Test
  func selectSinglesReloadsThatLadder() async {
    let fake = FakeUsageService()
    fake.nextLeaderboard = availableBoard()
    let (vm, _) = makeVM(fake: fake)
    await vm.start()

    fake.nextLeaderboard = availableBoard(ladder: .singles, rows: [
      UsageLeaderboardRow(rank: 1, name: "Garchomp", slug: "garchomp", usagePct: 18.0, sprite: nil),
    ])
    await vm.selectLadder(.singles)

    #expect(vm.ladder == .singles)
    #expect(fake.lastLeaderboardLadder == .singles)
    #expect(fake.leaderboardCount == 2)
    #expect(vm.rows.map(\.slug) == ["garchomp"])
  }

  // MARK: CF-USAGE-AC-1.1 / CF-AS-1 — public (guest)

  @Test
  func guestCanLoadTheLeaderboardWithoutSigningIn() async {
    let fake = FakeUsageService()
    fake.nextLeaderboard = availableBoard()
    let (vm, _) = makeVM(signedIn: false, fake: fake)

    #expect(vm.requiresSignIn == false)
    #expect(vm.isSignedIn == false)
    await vm.start()

    #expect(fake.leaderboardCount == 1)
    #expect(vm.isUnavailable == false)
    #expect(vm.rows.isEmpty == false)
    #expect(vm.errorMessage == nil)
  }

  @Test
  func signedInLoadIsTheSamePublicPath() async {
    let fake = FakeUsageService()
    fake.nextLeaderboard = availableBoard()
    let (vm, _) = makeVM(signedIn: true, fake: fake)

    #expect(vm.requiresSignIn == false)
    await vm.start()
    #expect(fake.leaderboardCount == 1)
    #expect(vm.rows.count == 2)
  }

  // MARK: CF-USAGE-AC-1.3 / CF-UI-AC-6.2 — live as-of

  @Test
  func availableBoardSurfacesSeasonFetchedAtAndAttribution() async {
    let fake = FakeUsageService()
    fake.nextLeaderboard = availableBoard()
    let (vm, _) = makeVM(fake: fake)
    await vm.start()

    #expect(vm.available)
    #expect(vm.season == "Current")
    #expect(vm.fetchedAt == 1_700_000_000_000)
    #expect(vm.attribution?.lowercased().contains("champions") == true)
    #expect(vm.attribution?.lowercased().contains("smogon") != true)
  }

  // MARK: CF-USAGE-AC-1.6 / CF-UI-AC-6.3 / CF-INT-BR-6 — fail-soft

  @Test
  func unavailableLadderIsHonestAndEmptyNotASmogonBoard() async {
    let fake = FakeUsageService()
    fake.nextLeaderboard = .unavailable(ladder: .doubles)
    let (vm, _) = makeVM(fake: fake)
    await vm.start()

    #expect(vm.available == false)
    #expect(vm.isUnavailable)
    #expect(vm.rows.isEmpty)
    #expect(vm.ladder == .doubles)
    #expect(vm.unavailableMessage != nil)
    let copy = (
      (vm.unavailableMessage ?? "") + (vm.errorMessage ?? "") + (vm.attribution ?? "")
    ).lowercased()
    #expect(copy.contains("smogon") == false)
    #expect(copy.contains("gen9ou") == false)
  }

  @Test
  func transportFaultFailSoftsToUnavailableWithoutThrowing() async {
    let fake = FakeUsageService()
    fake.leaderboardError = .transport(underlying: "URLError.-1009")
    let (vm, _) = makeVM(fake: fake)

    await vm.start()

    #expect(vm.isUnavailable)
    #expect(vm.rows.isEmpty)
    #expect(vm.errorMessage == UsageViewModel.connectionMessage || vm.unavailableMessage != nil)
  }

  // MARK: CF-USAGE-AC-1.4 — species drill-in

  @Test
  func openingARowLoadsTheSpeciesDrillInOnTheSameLadder() async {
    let fake = FakeUsageService()
    fake.nextLeaderboard = availableBoard()
    fake.nextSpecies = UsageSpeciesResponse(
      available: true,
      found: true,
      slug: "garchomp",
      season: "Current",
      fetchedAt: 1_700_000_000_000,
      attribution: "championsbattledata.com",
      error: nil
    )
    let (vm, _) = makeVM(fake: fake)
    await vm.start()

    await vm.openSpecies("garchomp")

    #expect(fake.speciesCount == 1)
    #expect(fake.lastSpeciesSlug == "garchomp")
    #expect(fake.lastSpeciesLadder == .doubles)
    #expect(vm.speciesDetail?.found == true)
    #expect(vm.speciesDetail?.slug == "garchomp")
    #expect(vm.speciesDetail?.available == true)
  }

  @Test
  func speciesUnavailableFailSoftsAndDoesNotInventASet() async {
    let fake = FakeUsageService()
    fake.nextLeaderboard = availableBoard()
    fake.nextSpecies = .unavailable
    let (vm, _) = makeVM(fake: fake)
    await vm.start()

    await vm.openSpecies("garchomp")

    #expect(vm.speciesDetail?.available == false)
    #expect(vm.speciesDetail?.found != true)
    #expect(vm.speciesDetail?.error == "upstream_unavailable")
  }

  // MARK: Wire decode (GET /api/usage)

  @Test
  func availableLeaderboardJSONDecodesSnakeCaseKeys() throws {
    let json = """
      {"available":true,"ladder":"doubles","season":"Current","fetched_at":1700000000000,\
      "attribution":"championsbattledata.com","rows":[\
      {"rank":1,"name":"Garchomp","slug":"garchomp","usage_pct":22.5}]}
      """
    let board = try JSONDecoder().decode(UsageLeaderboard.self, from: Data(json.utf8))
    #expect(board.available)
    #expect(board.ladder == .doubles)
    #expect(board.season == "Current")
    #expect(board.fetchedAt == 1_700_000_000_000)
    #expect(board.rows.count == 1)
    #expect(board.rows[0].slug == "garchomp")
    #expect(board.rows[0].usagePct == 22.5)
  }

  @Test
  func unavailableLeaderboardJSONDecodesWithoutRows() throws {
    let json = """
      {"available":false,"ladder":"singles","error":"upstream_unavailable","rows":[]}
      """
    let board = try JSONDecoder().decode(UsageLeaderboard.self, from: Data(json.utf8))
    #expect(board.available == false)
    #expect(board.ladder == .singles)
    #expect(board.error == "upstream_unavailable")
    #expect(board.rows.isEmpty)
  }
}
