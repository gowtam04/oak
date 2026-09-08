import Foundation

/// Persistence for the last-known ``RegulationMeta`` so the chip can paint on
/// the first frame before `GET /api/scope` returns. A protocol so unit tests
/// substitute an in-memory store without touching `UserDefaults.standard`.
protocol RegulationStoring: AnyObject {
  var snapshot: RegulationMeta? { get set }
}

/// `UserDefaults`-backed ``RegulationStoring``.
final class UserDefaultsRegulationStore: RegulationStoring {
  static let key = "oak-regulation-meta"

  private let defaults: UserDefaults

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  var snapshot: RegulationMeta? {
    get {
      guard let data = defaults.data(forKey: Self.key) else { return nil }
      return try? JSONDecoder().decode(RegulationMeta.self, from: data)
    }
    set {
      if let newValue, let data = try? JSONEncoder().encode(newValue) {
        defaults.set(data, forKey: Self.key)
      } else {
        defaults.removeObject(forKey: Self.key)
      }
    }
  }
}

/// In-memory store for unit tests and previews.
final class InMemoryRegulationStore: RegulationStoring {
  var snapshot: RegulationMeta?

  init(snapshot: RegulationMeta? = nil) {
    self.snapshot = snapshot
  }
}
