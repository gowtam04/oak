import Foundation

/// Public current-regulation facts (`GET /api/scope`). Never throws — a
/// transport / HTTP / decode miss folds to `nil` so the chip can keep last-known
/// or the generic `"Champions"` fallback (never a stale letter).
protocol RegulationService: Sendable {
  func current() async -> RegulationMeta?
}

struct LiveRegulationService: RegulationService {
  private let apiClient: OakAPIClient

  init(apiClient: OakAPIClient) {
    self.apiClient = apiClient
  }

  func current() async -> RegulationMeta? {
    let endpoint = Endpoint(
      method: .get,
      path: "/api/scope",
      requiresAuth: false
    )
    do {
      let meta = try await apiClient.send(endpoint, as: RegulationMeta.self)
      return meta.isUsable ? meta : nil
    } catch {
      Log.network.error("regulation fetch failed")
      return nil
    }
  }
}
