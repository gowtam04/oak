import Foundation

/// `POST /api/calc` — never throws. A transport / non-2xx / decode miss folds
/// to `nil`; an in-domain miss (`incomplete`, `status_move`, …) is a
/// `.failure` result (CALC-BR-1 / CALC-BR-8).
protocol CalcService: Sendable {
  func estimate(_ scenario: CalcScenario) async -> CalcResult?
}

struct LiveCalcService: CalcService {
  private let apiClient: OakAPIClient

  init(apiClient: OakAPIClient) {
    self.apiClient = apiClient
  }

  func estimate(_ scenario: CalcScenario) async -> CalcResult? {
    do {
      return try await apiClient.send(CalcEndpoints.estimate(scenario), as: CalcResult.self)
    } catch {
      Log.network.error("calc estimate failed")
      return nil
    }
  }
}
