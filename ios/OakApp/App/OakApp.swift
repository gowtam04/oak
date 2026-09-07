import SwiftUI

/// Application entry point.
///
/// Constructs the shared `AppState`, soft-update view model, and the
/// `ServiceContainer`, injects them into the environment, and shows `RootView`
/// (the four-tab shell). The app holds no LLM keys and no database — it talks
/// only to the Oak backend over HTTP/SSE (plus App Store Lookup for soft-update).
@main
struct OakApp: App {
  @State private var appState = AppState()
  @State private var updateModel: UpdateViewModel
  private let services: ServiceContainer

  init() {
    // Dex list + other sprite traffic; media responses are
    // `Cache-Control: public, max-age=604800, immutable`.
    URLCache.shared = URLCache(
      memoryCapacity: 16 * 1024 * 1024,
      diskCapacity: 80 * 1024 * 1024,
      directory: nil
    )
    // Paint the enamel nav lid + paper tab dock (not Apple's system
    // material / Liquid Glass) before the first frame renders.
    OakChrome.applyBarAppearance()
    let services = ServiceContainer.live()
    self.services = services
    _updateModel = State(initialValue: UpdateViewModel(service: services.updates))
  }

  var body: some Scene {
    WindowGroup {
      #if DEBUG
      if ProcessInfo.processInfo.arguments.contains(EntityPickerHarness.launchFlag) {
        EntityPickerHarness()
      } else {
        rootView
      }
      #else
      rootView
      #endif
    }
  }

  private var rootView: some View {
    RootView()
      .environment(appState)
      .environment(updateModel)
      .oakServices(services)
  }
}
