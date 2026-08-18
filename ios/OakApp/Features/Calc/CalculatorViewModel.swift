import Foundation
import Observation

/// Chat overlay hop from `/calc` or a damage-block Open.
struct CalculatorHop: Equatable, Sendable {
  enum Kind: Equatable, Sendable {
    case overlay
    case fullScreen
  }

  var kind: Kind
  var rest: String
  var format: Format
  /// Prefill from a damage block (CALC-AC-2.1). When set, the overlay applies
  /// this scenario instead of parsing `rest`.
  var scenario: CalcScenario? = nil
}

/// Overlay + first-class calculator (CALC-US-1/2/5/8). Opening / editing /
/// displaying rolls never calls the agent (CALC-BR-1). Incomplete input never
/// invents a 0 roll (CALC-BR-8).
@MainActor
@Observable
final class CalculatorViewModel {
  enum Presentation: Equatable, Sendable {
    case overlay
    case fullScreen
  }

  private(set) var presentation: Presentation
  var scenario: CalcScenario
  private(set) var result: CalcResult?
  private(set) var isPresented: Bool
  private(set) var slashRest: String = ""
  private(set) var errorMessage: String?

  private let calc: any CalcService

  init(
    calc: any CalcService,
    format: Format,
    presentation: Presentation
  ) {
    self.calc = calc
    self.presentation = presentation
    self.scenario = CalcScenario(
      format: format,
      attacker: CalcSide(),
      defender: CalcSide(),
      move: CalcMove()
    )
    self.isPresented = presentation == .fullScreen
  }

  var isIncomplete: Bool {
    if scenario.isIncomplete { return true }
    return result?.isIncomplete == true
  }

  var displaysDamageRange: Bool {
    if case .success = result { return true }
    return false
  }

  var displayedMinDamage: Int? {
    guard case .success(let ok) = result else { return nil }
    return ok.estimate.minDamage
  }

  var displayedMaxDamage: Int? {
    guard case .success(let ok) = result else { return nil }
    return ok.estimate.maxDamage
  }

  func applyPrefill(_ hop: CalcScenario) {
    scenario = hop
    result = nil
    errorMessage = nil
    isPresented = true
  }

  func applySlashRest(_ rest: String) {
    slashRest = rest
    errorMessage = nil
    isPresented = true
    if let parsed = parseCalcSlashRest(rest, format: scenario.format) {
      scenario = parsed
    }
  }

  func expandToFullScreen() {
    presentation = .fullScreen
    isPresented = true
  }

  func dismiss() {
    isPresented = false
  }

  /// Builds the deterministic Explain message. Does not dismiss or reset.
  func explainPrompt() -> String? {
    let resolved = result ?? .failure(CalcFailure(error: .incomplete))
    return explainCalcPrompt(scenario: scenario, result: resolved)
  }

  func recompute() async {
    let next = await calc.estimate(scenario)
    result = next
    if next == nil {
      errorMessage = "Couldn't reach the calculator. Try again."
    } else {
      errorMessage = nil
    }
  }
}

/// Best-effort `A [move] vs B` parse for `/calc` rest. Unresolved tokens still
/// open the overlay (CALC-AC-3.3) — this never errors.
/// Prefill from an answer `damage_calc` assumptions map (CALC-AC-2.1).
func scenarioFromDamageCalc(_ calc: DamageCalc, format: Format) -> CalcScenario {
  let a = calc.assumptions
  func species(_ key: String) -> String? {
    switch a[key] {
    case .string(let value):
      let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
      return trimmed.isEmpty ? nil : trimmed
    default:
      return nil
    }
  }
  func level() -> Int? {
    switch a["level"] {
    case .int(let value): return value
    case .double(let value): return Int(value)
    default: return nil
    }
  }
  let move = species("move")
  let lvl = level()
  return CalcScenario(
    format: format,
    attacker: CalcSide(species: species("attacker"), nature: species("nature"), level: lvl),
    defender: CalcSide(species: species("defender"), level: lvl),
    move: CalcMove(slug: move, name: move)
  )
}

func parseCalcSlashRest(_ rest: String, format: Format) -> CalcScenario? {
  let trimmed = rest.trimmingCharacters(in: .whitespacesAndNewlines)
  guard !trimmed.isEmpty else { return nil }
  let parts = trimmed.split(separator: " vs ", maxSplits: 1, omittingEmptySubsequences: false)
  let left = parts[0].trimmingCharacters(in: .whitespacesAndNewlines)
  let right = parts.count > 1 ? parts[1].trimmingCharacters(in: .whitespacesAndNewlines) : ""
  let leftTokens = left.split(whereSeparator: \.isWhitespace).map(String.init)
  let attacker = leftTokens.first
  let move = leftTokens.dropFirst().joined(separator: "-").lowercased()
  return CalcScenario(
    format: format,
    attacker: CalcSide(species: attacker?.isEmpty == false ? attacker : nil),
    defender: CalcSide(species: right.isEmpty ? nil : right),
    move: CalcMove(slug: move.isEmpty ? nil : move)
  )
}
