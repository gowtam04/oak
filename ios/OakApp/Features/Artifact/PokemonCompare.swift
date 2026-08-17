import Foundation

/// Client-side two-subject Pokémon compare (ADR-11).
///
/// Clones `web/src/lib/pokemon-compare.ts` against the native artifact + set
/// types. No compare endpoint — the caller fetches both `/api/entity` profiles
/// and this helper diffs them. Cross-scope pairs keep both format tags
/// (CMP-BR-2). Not a chat turn (CMP-BR-4).
///
/// Movepool slugs are flattened across learn-method groups. Ability slugs are
/// the non-nil `slot1` / `slot2` / `hidden` values. Offensive matchup-diff
/// reads `subject.offensive` (no type-chart port). Speed states a default
/// level unless `set` is present (CMP-AC-3.2).

/// Stated default when neither subject carries a set (CMP-AC-3.2).
private let defaultSpeedLevel = 50

struct PokemonCompareSubject: Sendable {
  let format: Format
  let profile: PokemonArtifactData
  let set: TeamMember?
  let offensive: OffensiveProfile?
}

struct PokemonCompareSetDiff: Equatable, Sendable {
  let onlyLeft: [String]
  let onlyRight: [String]
  let shared: [String]
}

struct PokemonCompareSide: Equatable, Sendable {
  let format: Format
  let displayName: String
}

struct PokemonCompareStatsPair: Equatable, Sendable {
  let left: BaseStats
  let right: BaseStats
}

struct PokemonCompareSpeed: Equatable, Sendable {
  let leftValue: Int
  let rightValue: Int
  let defaultLevel: Int
  let usedSetLeft: Bool
  let usedSetRight: Bool
}

struct PokemonCompareMatchups: Equatable, Sendable {
  let weakTo: PokemonCompareSetDiff
  let resists: PokemonCompareSetDiff
  let immuneTo: PokemonCompareSetDiff
  let offensiveSuperEffective: PokemonCompareSetDiff
}

struct PokemonCompareDiff: Equatable, Sendable {
  let left: PokemonCompareSide
  let right: PokemonCompareSide
  let stats: PokemonCompareStatsPair
  let types: PokemonCompareSetDiff
  let abilities: PokemonCompareSetDiff
  let speed: PokemonCompareSpeed
  let movepool: PokemonCompareSetDiff
  let matchups: PokemonCompareMatchups
}

/// Diff two portable profiles. Does not mutate inputs.
func diffPokemonProfiles(
  _ left: PokemonCompareSubject,
  _ right: PokemonCompareSubject
) -> PokemonCompareDiff {
  let leftAbilities = abilitySlugs(left.profile.abilities)
  let rightAbilities = abilitySlugs(right.profile.abilities)
  let leftOffensive = left.offensive?.superEffectiveAgainst ?? []
  let rightOffensive = right.offensive?.superEffectiveAgainst ?? []

  return PokemonCompareDiff(
    left: PokemonCompareSide(format: left.format, displayName: left.profile.displayName),
    right: PokemonCompareSide(format: right.format, displayName: right.profile.displayName),
    stats: PokemonCompareStatsPair(
      left: left.profile.baseStats,
      right: right.profile.baseStats
    ),
    types: setDiff(left.profile.types, right.profile.types),
    abilities: setDiff(leftAbilities, rightAbilities),
    speed: PokemonCompareSpeed(
      leftValue: left.profile.baseStats.spe,
      rightValue: right.profile.baseStats.spe,
      defaultLevel: defaultSpeedLevel,
      usedSetLeft: left.set != nil,
      usedSetRight: right.set != nil
    ),
    movepool: setDiff(flattenMovepool(left.profile.movepool), flattenMovepool(right.profile.movepool)),
    matchups: PokemonCompareMatchups(
      weakTo: setDiff(left.profile.matchups.weakTo, right.profile.matchups.weakTo),
      resists: setDiff(left.profile.matchups.resists, right.profile.matchups.resists),
      immuneTo: setDiff(left.profile.matchups.immuneTo, right.profile.matchups.immuneTo),
      offensiveSuperEffective: setDiff(leftOffensive, rightOffensive)
    )
  )
}

private func abilitySlugs(_ abilities: Abilities) -> [String] {
  var slugs: [String] = []
  if !abilities.slot1.isEmpty { slugs.append(abilities.slot1) }
  if let slot2 = abilities.slot2, !slot2.isEmpty { slugs.append(slot2) }
  if let hidden = abilities.hidden, !hidden.isEmpty { slugs.append(hidden) }
  return slugs
}

private func flattenMovepool(_ groups: [MovepoolGroup]) -> [String] {
  groups.flatMap { $0.moves.map(\.slug) }
}

private func setDiff(_ left: [String], _ right: [String]) -> PokemonCompareSetDiff {
  let leftSet = Set(left)
  let rightSet = Set(right)
  var onlyLeft: [String] = []
  var onlyRight: [String] = []
  var shared: [String] = []
  var seen = Set<String>()

  for item in left {
    if seen.contains(item) { continue }
    seen.insert(item)
    if rightSet.contains(item) {
      shared.append(item)
    } else {
      onlyLeft.append(item)
    }
  }
  for item in right {
    if seen.contains(item) || leftSet.contains(item) { continue }
    seen.insert(item)
    onlyRight.append(item)
  }
  return PokemonCompareSetDiff(onlyLeft: onlyLeft, onlyRight: onlyRight, shared: shared)
}
