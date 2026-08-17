import Foundation

/// Outcome of an App Store version check (P0 soft-update).
///
/// - ``upToDate`` — store version is not newer than the installed marketing version.
/// - ``available`` — store has a strictly newer marketing version; open `storeURL`.
/// - ``unavailable`` — network/decode/empty lookup; auto-check is silent, manual
///   check surfaces a recoverable message.
enum UpdateCheckResult: Equatable, Sendable {
  case upToDate
  case available(latest: String, storeURL: URL)
  case unavailable
}

/// App Store soft-update seam. View models depend on this protocol (never
/// ``LiveUpdateService``) so unit tests substitute ``FakeUpdateService``.
///
/// Fail-soft by design: transport/decode problems return ``unavailable`` rather
/// than throwing — auto-check must never break launch.
protocol UpdateService: Sendable {
  /// Compares `localVersion` to the App Store marketing version for this app.
  func checkForUpdate(localVersion: String) async -> UpdateCheckResult
}

/// Live App Store Lookup implementation (no third-party deps, ADR-5).
///
/// Hits `https://itunes.apple.com/lookup?bundleId=ai.gowtam.oak` and decodes the
/// first result's `version` + `trackViewUrl`. Does **not** go through
/// ``OakAPIClient`` — a different host and no Bearer token.
struct LiveUpdateService: UpdateService {
  /// Public App Store product page (fallback when Lookup omits `trackViewUrl`).
  static let fallbackStoreURL = URL(string: "https://apps.apple.com/app/id6786014161")!

  private let session: URLSession
  private let lookupURL: URL
  private let fallbackStoreURL: URL

  init(
    session: URLSession = .shared,
    lookupURL: URL = URL(string: "https://itunes.apple.com/lookup?bundleId=ai.gowtam.oak")!,
    fallbackStoreURL: URL = LiveUpdateService.fallbackStoreURL
  ) {
    self.session = session
    self.lookupURL = lookupURL
    self.fallbackStoreURL = fallbackStoreURL
  }

  func checkForUpdate(localVersion: String) async -> UpdateCheckResult {
    do {
      let (data, response) = try await session.data(from: lookupURL)
      guard let http = response as? HTTPURLResponse else {
        Log.update.error("lookup non-http response")
        return .unavailable
      }
      guard (200..<300).contains(http.statusCode) else {
        Log.update.error("lookup status \(http.statusCode)")
        return .unavailable
      }

      let payload = try JSONDecoder().decode(ITunesLookupResponse.self, from: data)
      guard let app = payload.results.first, let storeVersion = app.version, !storeVersion.isEmpty else {
        Log.update.error("lookup empty results")
        return .unavailable
      }

      if AppVersion.isNewer(storeVersion, than: localVersion) {
        let storeURL = app.trackViewUrl.flatMap(URL.init(string:)) ?? fallbackStoreURL
        Log.update.info("update available store=\(storeVersion, privacy: .public) local=\(localVersion, privacy: .public)")
        return .available(latest: storeVersion, storeURL: storeURL)
      }

      Log.update.info("up to date local=\(localVersion, privacy: .public) store=\(storeVersion, privacy: .public)")
      return .upToDate
    } catch {
      Log.update.error("lookup failed")
      return .unavailable
    }
  }
}

// MARK: - Lookup wire DTO

/// Minimal iTunes Search API lookup envelope. Only the fields we need for soft
/// update; unknown keys are ignored.
private struct ITunesLookupResponse: Decodable, Sendable {
  let results: [ITunesLookupResult]
}

private struct ITunesLookupResult: Decodable, Sendable {
  let version: String?
  let trackViewUrl: String?
}
