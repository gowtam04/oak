import Foundation

@testable import OakApp

/// In-memory ``CalcService`` test double. Never throws — a transport miss is
/// `nil`; an in-domain miss is a `.failure` result (CALC-BR-8).
///
/// `@unchecked Sendable`: tests drive it serially from the main actor.
final class FakeCalcService: CalcService, @unchecked Sendable {
  /// Next `estimate` result. `nil` models a transport / non-2xx fold.
  var nextResult: CalcResult?
  /// When set, computes the result FROM the request (incomplete → `.failure`).
  var handler: (@Sendable (CalcScenario) -> CalcResult?)?

  private(set) var estimateCount = 0
  private(set) var lastScenario: CalcScenario?

  init(nextResult: CalcResult? = nil) {
    self.nextResult = nextResult
  }

  func estimate(_ scenario: CalcScenario) async -> CalcResult? {
    estimateCount += 1
    lastScenario = scenario
    if let handler { return handler(scenario) }
    return nextResult
  }
}
