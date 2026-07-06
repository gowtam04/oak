import SwiftUI

/// Application entry point.
///
/// Constructs the shared `AppState` and the `ServiceContainer`, injects both into
/// the environment, and shows `RootView` (the four-tab shell). The app holds no
/// LLM keys and no database — it talks only to the Oak backend over HTTP/SSE.
@main
struct OakApp: App {
  @State private var appState = AppState()
  private let services = ServiceContainer.live()

  init() {
    // Paint the nav/tab bars onto Oak's canvas paper (not Apple's system
    // material) before the first frame renders.
    OakChrome.applyBarAppearance()
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
      .oakServices(services)
  }
}
