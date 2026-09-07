import Foundation
import SwiftUI
import Testing

@testable import OakApp

@MainActor
struct AppearanceStoreTests {
  @Test
  func fromStoredDefaultsToSystem() {
    #expect(AppearancePreference.fromStored(nil) == .system)
    #expect(AppearancePreference.fromStored("") == .system)
    #expect(AppearancePreference.fromStored("nope") == .system)
  }

  @Test
  func fromStoredRecognizesKnownValues() {
    #expect(AppearancePreference.fromStored("system") == .system)
    #expect(AppearancePreference.fromStored("light") == .light)
    #expect(AppearancePreference.fromStored("dark") == .dark)
  }

  @Test
  func colorSchemeMapping() {
    #expect(AppearancePreference.system.colorScheme == nil)
    #expect(AppearancePreference.light.colorScheme == .light)
    #expect(AppearancePreference.dark.colorScheme == .dark)
  }

  @Test
  func userDefaultsRoundTrip() {
    let suiteName = "oak.appearance.tests.\(UUID().uuidString)"
    guard let defaults = UserDefaults(suiteName: suiteName) else {
      Issue.record("could not create suite UserDefaults")
      return
    }
    defaults.removePersistentDomain(forName: suiteName)
    defer { defaults.removePersistentDomain(forName: suiteName) }

    let store = UserDefaultsAppearanceStore(defaults: defaults)
    #expect(store.preference == .system)

    store.preference = .dark
    #expect(store.preference == .dark)
    #expect(defaults.string(forKey: UserDefaultsAppearanceStore.key) == "dark")

    store.preference = .light
    #expect(store.preference == .light)

    store.preference = .system
    #expect(store.preference == .system)
  }

  @Test
  func appStateLoadsStoredPreferenceAndWritesThrough() {
    let store = InMemoryAppearanceStore(preference: .light)
    let state = AppState(appearanceStore: store)
    #expect(state.appearance == .light)

    state.appearance = .dark
    #expect(state.appearance == .dark)
    #expect(store.preference == .dark)
  }

  @Test
  func appStateDefaultsToSystem() {
    let state = AppState()
    #expect(state.appearance == .system)
  }
}
