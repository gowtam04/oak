import Foundation
import Testing

@testable import OakApp

/// Phase 5 lockstep oracle — `diffPokemonProfiles` (CMP-US-2 / CMP-US-3).
///
/// Clones `web/src/lib/pokemon-compare.ts`. Fails to compile until
/// `PokemonCompare.swift` exists
/// (`ios/OakApp/Features/Artifact/PokemonCompare.swift`).
///
/// Expected API:
///   `diffPokemonProfiles(_ left: PokemonCompareSubject, _ right: PokemonCompareSubject) -> PokemonCompareDiff`
///
///   `PokemonCompareSubject(format: Format, profile: PokemonArtifactData, set: TeamMember?, offensive: OffensiveProfile?)`
///   `PokemonCompareDiff`
///     `.left` / `.right` — `{ format, displayName }` (cross-scope tags, not unified)
///     `.stats` — `{ left: BaseStats, right: BaseStats }`
///     `.types` / `.abilities` / `.movepool` — `PokemonCompareSetDiff`
///     `.speed` — `{ leftValue, rightValue, defaultLevel, usedSetLeft, usedSetRight }`
///     `.matchups` — `{ weakTo, resists, immuneTo, offensiveSuperEffective }` each a set-diff
///   `PokemonCompareSetDiff(onlyLeft: [String], onlyRight: [String], shared: [String])`
///
/// Movepool slugs are flattened across learn-method groups. Ability slugs are
/// the non-nil `slot1` / `slot2` / `hidden` values. Offensive matchup-diff
/// reads `subject.offensive` (do not invent a type-chart port). Speed uses a
/// stated default level unless `set` is present (CMP-AC-3.2); this suite pins
/// the flags, not computed-stat numbers.
///
/// Requirement refs: CMP-US-2, CMP-AC-2.1–2.3, CMP-US-3, CMP-AC-3.1–3.4,
/// CMP-BR-2.
struct PokemonCompareTests {

  private func profile(
    name: String,
    types: [String],
    abilities: Abilities,
    stats: BaseStats,
    matchups: DefensiveProfile,
    movepool: [MovepoolGroup]
  ) -> PokemonArtifactData {
    PokemonArtifactData(
      displayName: name,
      nationalDexNumber: 445,
      types: types,
      abilities: abilities,
      baseStats: stats,
      baseStatTotal: stats.hp + stats.atk + stats.def + stats.spa + stats.spd + stats.spe,
      spriteUrl: "s",
      artworkUrl: "a",
      forms: [name.lowercased()],
      isGen9Native: true,
      sourceGeneration: nil,
      matchups: matchups,
      movepool: movepool
    )
  }

  private var garchompStats: BaseStats {
    BaseStats(hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102)
  }

  private var dragapultStats: BaseStats {
    BaseStats(hp: 88, atk: 120, def: 75, spa: 100, spd: 75, spe: 142)
  }

  private func move(_ slug: String, type: String) -> MovepoolMove {
    MovepoolMove(slug: slug, displayName: slug, type: type)
  }

  private func garchompGen4() -> PokemonArtifactData {
    profile(
      name: "Garchomp",
      types: ["dragon", "ground"],
      abilities: Abilities(slot1: "sand-veil", slot2: nil, hidden: nil),
      stats: garchompStats,
      matchups: DefensiveProfile(
        weakTo: ["ice", "dragon"],
        resists: ["rock", "fire", "poison"],
        immuneTo: ["electric"],
        quadWeakTo: ["ice"],
        quadResists: nil
      ),
      movepool: [
        MovepoolGroup(method: "level-up", moves: [move("outrage", type: "dragon"), move("dragon-claw", type: "dragon")]),
        MovepoolGroup(method: "machine", moves: [move("earthquake", type: "ground")]),
      ]
    )
  }

  private func garchompGen9() -> PokemonArtifactData {
    profile(
      name: "Garchomp",
      types: ["dragon", "ground"],
      abilities: Abilities(slot1: "sand-veil", slot2: nil, hidden: "rough-skin"),
      stats: garchompStats,
      matchups: DefensiveProfile(
        weakTo: ["ice", "dragon", "fairy"],
        resists: ["rock", "fire", "poison"],
        immuneTo: ["electric"],
        quadWeakTo: ["ice"],
        quadResists: nil
      ),
      movepool: [
        MovepoolGroup(method: "level-up", moves: [move("dragon-claw", type: "dragon"), move("scaleshot", type: "dragon")]),
        MovepoolGroup(method: "machine", moves: [move("earthquake", type: "ground")]),
      ]
    )
  }

  private func dragapultChampions() -> PokemonArtifactData {
    profile(
      name: "Dragapult",
      types: ["dragon", "ghost"],
      abilities: Abilities(slot1: "clear-body", slot2: "infiltrator", hidden: "cursed-body"),
      stats: dragapultStats,
      matchups: DefensiveProfile(
        weakTo: ["ice", "dragon", "ghost", "dark", "fairy"],
        resists: ["fire", "water", "grass", "electric", "poison", "bug"],
        immuneTo: ["normal", "fighting"],
        quadWeakTo: nil,
        quadResists: nil
      ),
      movepool: [
        MovepoolGroup(method: "level-up", moves: [move("dragon-darts", type: "dragon")]),
        MovepoolGroup(method: "machine", moves: [move("shadow-ball", type: "ghost")]),
      ]
    )
  }

  // MARK: CMP-US-2 / CMP-AC-2.1 — cross-scope tags

  @Test
  func tagsEachColumnWithItsOwnFormatAndDoesNotUnifyScope() {
    let diff = diffPokemonProfiles(
      PokemonCompareSubject(format: .gen4, profile: garchompGen4(), set: nil, offensive: nil),
      PokemonCompareSubject(format: .scarletViolet, profile: garchompGen9(), set: nil, offensive: nil)
    )
    #expect(diff.left.format == .gen4)
    #expect(diff.right.format == .scarletViolet)
    #expect(diff.left.format != diff.right.format)
    #expect(diff.left.displayName == "Garchomp")
    #expect(diff.right.displayName == "Garchomp")
  }

  @Test
  func allowsDifferentSpeciesInDifferentScopes() {
    let diff = diffPokemonProfiles(
      PokemonCompareSubject(format: .scarletViolet, profile: garchompGen9(), set: nil, offensive: nil),
      PokemonCompareSubject(format: .champions, profile: dragapultChampions(), set: nil, offensive: nil)
    )
    #expect(diff.left.format == .scarletViolet)
    #expect(diff.right.format == .champions)
    #expect(diff.left.displayName == "Garchomp")
    #expect(diff.right.displayName == "Dragapult")
  }

  // MARK: CMP-US-3 / CMP-AC-3.1 — stats, types, abilities

  @Test
  func diffsStatsTypesAndAbilities() {
    let diff = diffPokemonProfiles(
      PokemonCompareSubject(format: .gen4, profile: garchompGen4(), set: nil, offensive: nil),
      PokemonCompareSubject(format: .scarletViolet, profile: garchompGen9(), set: nil, offensive: nil)
    )
    #expect(diff.stats.left == garchompStats)
    #expect(diff.stats.right == garchompStats)
    #expect(Set(diff.types.shared) == Set(["dragon", "ground"]))
    #expect(diff.types.onlyLeft.isEmpty)
    #expect(diff.types.onlyRight.isEmpty)
    #expect(Set(diff.abilities.shared) == Set(["sand-veil"]))
    #expect(diff.abilities.onlyLeft.isEmpty)
    #expect(Set(diff.abilities.onlyRight) == Set(["rough-skin"]))
  }

  @Test
  func diffsTypesAcrossSpecies() {
    let diff = diffPokemonProfiles(
      PokemonCompareSubject(format: .scarletViolet, profile: garchompGen9(), set: nil, offensive: nil),
      PokemonCompareSubject(format: .champions, profile: dragapultChampions(), set: nil, offensive: nil)
    )
    #expect(Set(diff.types.shared) == Set(["dragon"]))
    #expect(Set(diff.types.onlyLeft) == Set(["ground"]))
    #expect(Set(diff.types.onlyRight) == Set(["ghost"]))
    #expect(diff.stats.left.spe == 102)
    #expect(diff.stats.right.spe == 142)
  }

  // MARK: CMP-AC-3.2 — speed default vs originating set

  @Test
  func speedFlagsASuppliedSetAndStatesADefaultLevel() {
    let set = TeamMember(
      species: "garchomp",
      ability: "rough-skin",
      item: nil,
      moves: [],
      nature: "jolly",
      evs: StatSpread(hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 252),
      ivs: StatSpread(hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31),
      teraType: nil,
      level: 50,
      nickname: nil,
      gender: nil,
      shiny: nil
    )
    let diff = diffPokemonProfiles(
      PokemonCompareSubject(format: .gen4, profile: garchompGen4(), set: nil, offensive: nil),
      PokemonCompareSubject(format: .scarletViolet, profile: garchompGen9(), set: set, offensive: nil)
    )
    #expect(diff.speed.usedSetLeft == false)
    #expect(diff.speed.usedSetRight == true)
    #expect(diff.speed.defaultLevel > 0)
  }

  // MARK: CMP-AC-3.3 — movepool set-diff

  @Test
  func movepoolIsASetDiffNotTwoFullDumps() {
    let diff = diffPokemonProfiles(
      PokemonCompareSubject(format: .gen4, profile: garchompGen4(), set: nil, offensive: nil),
      PokemonCompareSubject(format: .scarletViolet, profile: garchompGen9(), set: nil, offensive: nil)
    )
    #expect(Set(diff.movepool.onlyLeft) == Set(["outrage"]))
    #expect(Set(diff.movepool.onlyRight) == Set(["scaleshot"]))
    #expect(Set(diff.movepool.shared) == Set(["earthquake", "dragon-claw"]))
    let leftPool: Set = ["outrage", "dragon-claw", "earthquake"]
    #expect(Set(diff.movepool.onlyLeft) != leftPool)
    #expect(Set(diff.movepool.onlyLeft).isDisjoint(with: Set(diff.movepool.shared)))
    #expect(Set(diff.movepool.onlyRight).isDisjoint(with: Set(diff.movepool.shared)))
    #expect(Set(diff.movepool.onlyLeft).isDisjoint(with: Set(diff.movepool.onlyRight)))
  }

  // MARK: CMP-AC-3.4 — matchup-diff

  @Test
  func diffsDefensiveAndOffensiveMatchups() {
    let leftOffensive = OffensiveProfile(
      superEffectiveAgainst: ["dragon"],
      notVeryEffectiveAgainst: ["steel"],
      noEffectAgainst: ["fairy"]
    )
    let rightOffensive = OffensiveProfile(
      superEffectiveAgainst: ["dragon", "ghost"],
      notVeryEffectiveAgainst: ["steel"],
      noEffectAgainst: []
    )
    let diff = diffPokemonProfiles(
      PokemonCompareSubject(format: .gen4, profile: garchompGen4(), set: nil, offensive: leftOffensive),
      PokemonCompareSubject(format: .scarletViolet, profile: garchompGen9(), set: nil, offensive: rightOffensive)
    )
    #expect(Set(diff.matchups.weakTo.shared) == Set(["ice", "dragon"]))
    #expect(diff.matchups.weakTo.onlyLeft.isEmpty)
    #expect(Set(diff.matchups.weakTo.onlyRight) == Set(["fairy"]))
    #expect(Set(diff.matchups.resists.shared) == Set(["rock", "fire", "poison"]))
    #expect(Set(diff.matchups.immuneTo.shared) == Set(["electric"]))
    #expect(Set(diff.matchups.offensiveSuperEffective.shared) == Set(["dragon"]))
    #expect(diff.matchups.offensiveSuperEffective.onlyLeft.isEmpty)
    #expect(Set(diff.matchups.offensiveSuperEffective.onlyRight) == Set(["ghost"]))
  }
}
