package ai.gowtam.oak.app

import android.app.Application

/**
 * Owns the app-wide composition root — [ServiceContainer] + [AppState] — for the
 * lifetime of the process (component-design.md "App / session state"). Application-
 * scoped (not Activity- or composition-scoped) so a config change such as rotation
 * never resets them: [MainActivity] reads these off [OakApplication] instead of
 * `remember`-ing a fresh instance per Activity recreation, which previously wiped the
 * on-screen guest thread and the resolved scope chip on every rotation. This app is
 * online-only with process-death restoration explicitly deferred (platform-and-
 * operational.md), so process-lifetime scoping — no `SavedStateHandle` — is sufficient.
 */
class OakApplication : Application() {
    val services: ServiceContainer by lazy { ServiceContainer.live(this) }
    val appState: AppState by lazy { AppState() }
}
