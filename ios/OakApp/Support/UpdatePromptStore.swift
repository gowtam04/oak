import Foundation

/// Persistence for soft-update throttle + snooze (P0).
///
/// - **Throttle:** at most one automatic App Store lookup per 24 hours.
/// - **Snooze:** after "Not now", suppress auto-prompts for the same store
///   version for 7 days. Manual "Check for updates" always re-queries and can
///   re-show even while snoozed.
///
/// A protocol so unit tests substitute an in-memory store without touching
/// `UserDefaults.standard`.
protocol UpdatePromptStoring: AnyObject {
  var lastCheckAt: Date? { get set }
  var dismissedVersion: String? { get set }
  var dismissedAt: Date? { get set }
}

/// `UserDefaults`-backed ``UpdatePromptStoring``.
final class UserDefaultsUpdatePromptStore: UpdatePromptStoring {
  private enum Key {
    static let lastCheckAt = "oak.update.lastCheckAt"
    static let dismissedVersion = "oak.update.dismissedVersion"
    static let dismissedAt = "oak.update.dismissedAt"
  }

  private let defaults: UserDefaults

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  var lastCheckAt: Date? {
    get { defaults.object(forKey: Key.lastCheckAt) as? Date }
    set {
      if let newValue {
        defaults.set(newValue, forKey: Key.lastCheckAt)
      } else {
        defaults.removeObject(forKey: Key.lastCheckAt)
      }
    }
  }

  var dismissedVersion: String? {
    get { defaults.string(forKey: Key.dismissedVersion) }
    set {
      if let newValue {
        defaults.set(newValue, forKey: Key.dismissedVersion)
      } else {
        defaults.removeObject(forKey: Key.dismissedVersion)
      }
    }
  }

  var dismissedAt: Date? {
    get { defaults.object(forKey: Key.dismissedAt) as? Date }
    set {
      if let newValue {
        defaults.set(newValue, forKey: Key.dismissedAt)
      } else {
        defaults.removeObject(forKey: Key.dismissedAt)
      }
    }
  }
}

/// In-memory store for unit tests and previews.
final class InMemoryUpdatePromptStore: UpdatePromptStoring {
  var lastCheckAt: Date?
  var dismissedVersion: String?
  var dismissedAt: Date?
}
