import Foundation
import SwiftUI

/// Device-local Light / Dark / System appearance. Default is System so a fresh
/// install keeps following the iPhone setting. Not synced to the account —
/// theme is a device preference (unlike answer-card density).
enum AppearancePreference: String, CaseIterable, Sendable {
  case system
  case light
  case dark

  /// `nil` means follow the system trait collection.
  var colorScheme: ColorScheme? {
    switch self {
    case .system: nil
    case .light: .light
    case .dark: .dark
    }
  }

  var title: String {
    switch self {
    case .system: "System"
    case .light: "Light"
    case .dark: "Dark"
    }
  }

  static func fromStored(_ raw: String?) -> AppearancePreference {
    guard let raw, let value = AppearancePreference(rawValue: raw) else { return .system }
    return value
  }
}

/// Persistence for ``AppearancePreference``. A protocol so unit tests substitute
/// an in-memory store without touching `UserDefaults.standard`.
protocol AppearanceStoring: AnyObject {
  var preference: AppearancePreference { get set }
}

/// `UserDefaults`-backed ``AppearanceStoring``.
final class UserDefaultsAppearanceStore: AppearanceStoring {
  static let key = "oak-appearance"

  private let defaults: UserDefaults

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  var preference: AppearancePreference {
    get { AppearancePreference.fromStored(defaults.string(forKey: Self.key)) }
    set { defaults.set(newValue.rawValue, forKey: Self.key) }
  }
}

/// In-memory store for unit tests and previews.
final class InMemoryAppearanceStore: AppearanceStoring {
  var preference: AppearancePreference

  init(preference: AppearancePreference = .system) {
    self.preference = preference
  }
}
