import Foundation

/// Sequential `/calc` slash slots (SD-US-10). Clone of
/// `web/src/lib/chat/slash-calc.ts`. Pure picker state + insert strings;
/// resolve-on-send takes an injected search and never throws.
enum SlashCalc {
  enum Slot: String, Equatable, Sendable {
    case attacker
    case move
    case defender
  }

  struct PickerState: Equatable, Sendable {
    var slot: Slot
    var query: String
    var bind: CalcBind
    var vsPresent: Bool
  }

  struct RestSplit: Equatable, Sendable {
    var left: String
    var right: String?
    var vsPresent: Bool
  }

  static let captionAttacker = "Pick attacker · or Send to open empty"
  static let captionMove = "Pick move · or Send"
  static let captionDefender = "Pick defender · or Send"
  static let skipMove = "vs …"
  static let skipMoveHint = "Skip move"
  static let emptySpecies = "No Pokémon matches"
  static let emptyMove = "No move matches"

  static func emptyScenario() -> CalcScenario {
    CalcScenario(
      format: .champions,
      attacker: CalcSide(),
      defender: CalcSide(),
      move: CalcMove()
    )
  }

  static func caption(for slot: Slot) -> String {
    switch slot {
    case .attacker: return captionAttacker
    case .move: return captionMove
    case .defender: return captionDefender
    }
  }

  static func showSkipMove(slot: Slot, query: String) -> Bool {
    slot == .move && query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  static func splitRest(_ rest: String) -> RestSplit {
    let trimmed = rest.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return RestSplit(left: "", right: nil, vsPresent: false) }
    guard let match = trimmed.range(of: #"\s+(?:vs\.?|versus)(?:\s+|$)"#, options: [.regularExpression, .caseInsensitive]) else {
      return RestSplit(left: trimmed, right: nil, vsPresent: false)
    }
    let left = trimmed[..<match.lowerBound].trimmingCharacters(in: .whitespacesAndNewlines)
    let right = trimmed[match.upperBound...].trimmingCharacters(in: .whitespacesAndNewlines)
    return RestSplit(left: left, right: right, vsPresent: true)
  }

  static func insertAttacker(_ displayName: String) -> String { "/calc \(displayName) " }
  static func insertMove(attacker: String, move: String) -> String {
    "/calc \(attacker) \(move) vs "
  }
  static func insertSkipMove(attacker: String) -> String { "/calc \(attacker) vs " }
  static func insertDefender(attacker: String, move: String?, defender: String) -> String {
    if let move, !move.isEmpty {
      return "/calc \(attacker) \(move) vs \(defender)"
    }
    return "/calc \(attacker) vs \(defender)"
  }

  static func pickerState(rest: String, bind: CalcBind?) -> PickerState {
    let trimmed = rest.trimmingCharacters(in: .whitespacesAndNewlines)
    let stripped = stripBind(rest: trimmed, bind: bind)
    let split = splitRest(trimmed)
    guard let attacker = stripped.attacker else {
      return PickerState(
        slot: .attacker,
        query: split.vsPresent ? split.left : trimmed,
        bind: CalcBind(),
        vsPresent: split.vsPresent
      )
    }
    if !split.vsPresent {
      return PickerState(
        slot: .move,
        query: remainderAfterName(attacker.displayName, in: split.left),
        bind: stripped,
        vsPresent: false
      )
    }
    return PickerState(
      slot: .defender,
      query: split.right ?? "",
      bind: stripped,
      vsPresent: true
    )
  }

  static func scenario(from bind: CalcBind?) -> CalcScenario {
    scenario(attacker: bind?.attacker, move: bind?.move, defender: bind?.defender)
  }

  static func resolveScenario(
    rest: String,
    bind: CalcBind?,
    search: @Sendable @escaping (DexNameRow.Kind, String) async -> [DexNameRow]
  ) async -> CalcScenario {
    let trimmed = rest.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return emptyScenario() }
    let state = pickerState(rest: trimmed, bind: bind)
    let split = splitRest(trimmed)
    var attacker = state.bind.attacker
    var move = state.bind.move
    var defender = state.bind.defender

    if attacker == nil {
      if let hit = await longestPrefixMatch(split.left, kind: .pokemon, search: search) {
        attacker = hit.row
        let leftover = String(split.left.dropFirst(hit.consumed.count))
          .trimmingCharacters(in: .whitespacesAndNewlines)
        if move == nil, !leftover.isEmpty {
          if let moveHit = await longestPrefixMatch(leftover, kind: .move, search: search) {
            move = moveHit.row
          }
        }
      }
    } else if move == nil, let attacker {
      let leftover = remainderAfterName(attacker.displayName, in: split.left)
      if !leftover.isEmpty {
        if let moveHit = await longestPrefixMatch(leftover, kind: .move, search: search) {
          move = moveHit.row
        }
      }
    }

    if defender == nil, split.vsPresent, let right = split.right, !right.isEmpty {
      if let hit = await longestPrefixMatch(right, kind: .pokemon, search: search) {
        defender = hit.row
      }
    }

    return scenario(attacker: attacker, move: move, defender: defender)
  }

  private static func scenario(
    attacker: DexNameRow?,
    move: DexNameRow?,
    defender: DexNameRow?
  ) -> CalcScenario {
    CalcScenario(
      format: .champions,
      attacker: CalcSide(species: attacker?.slug),
      defender: CalcSide(species: defender?.slug),
      move: CalcMove(slug: move?.slug, name: move?.displayName)
    )
  }

  private static func stripBind(rest: String, bind: CalcBind?) -> CalcBind {
    guard let attacker = bind?.attacker, namePrefixesRest(attacker.displayName, rest: rest) else {
      return CalcBind()
    }
    let split = splitRest(rest)
    let afterAttacker = remainderAfterName(attacker.displayName, in: split.left)
    var move = bind?.move
    if let current = move {
      if afterAttacker.isEmpty || !namePrefixesRest(current.displayName, rest: afterAttacker) {
        move = nil
      }
    }
    var defender = bind?.defender
    if !split.vsPresent
      || (split.right ?? "").isEmpty
      || defender == nil
      || !namePrefixesRest(defender!.displayName, rest: split.right ?? "")
    {
      defender = nil
    }
    return CalcBind(attacker: attacker, move: move, defender: defender)
  }

  private static func namePrefixesRest(_ name: String, rest: String) -> Bool {
    let n = name.trimmingCharacters(in: .whitespacesAndNewlines)
    let r = rest.trimmingCharacters(in: .whitespaces)
    guard !n.isEmpty, r.lowercased().hasPrefix(n.lowercased()) else { return false }
    let after = r.dropFirst(n.count)
    return after.isEmpty || after.first?.isWhitespace == true
  }

  private static func remainderAfterName(_ name: String, in rest: String) -> String {
    let r = rest.trimmingCharacters(in: .whitespaces)
    guard namePrefixesRest(name, rest: r) else {
      return r.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    return String(r.dropFirst(name.count)).trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private static func exactRow(in rows: [DexNameRow], query: String) -> DexNameRow? {
    let needle = query.lowercased()
    if let byName = rows.first(where: { $0.displayName.lowercased() == needle }) {
      return byName
    }
    return rows.first(where: { $0.slug.lowercased() == needle })
  }

  private static func longestPrefixMatch(
    _ text: String,
    kind: DexNameRow.Kind,
    search: @Sendable @escaping (DexNameRow.Kind, String) async -> [DexNameRow]
  ) async -> (row: DexNameRow, consumed: String)? {
    let tokens = text.split(whereSeparator: \.isWhitespace).map(String.init)
    guard !tokens.isEmpty else { return nil }
    for n in stride(from: tokens.count, through: 1, by: -1) {
      let candidate = tokens.prefix(n).joined(separator: " ")
      let rows = await search(kind, candidate)
      if let row = exactRow(in: rows, query: candidate) {
        return (row, candidate)
      }
    }
    return nil
  }
}

struct CalcBind: Equatable, Sendable {
  var attacker: DexNameRow?
  var move: DexNameRow?
  var defender: DexNameRow?

  init(attacker: DexNameRow? = nil, move: DexNameRow? = nil, defender: DexNameRow? = nil) {
    self.attacker = attacker
    self.move = move
    self.defender = defender
  }

  var isEmpty: Bool { attacker == nil && move == nil && defender == nil }
}
