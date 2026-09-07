package ai.gowtam.oak.app

import android.app.Application
import android.os.Build
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.gif.AnimatedImageDecoder
import coil3.gif.GifDecoder

/**
 * Owns the app-wide composition root — [ServiceContainer] + [AppState] — for the
 * lifetime of the process (component-design.md "App / session state"). Application-
 * scoped (not Activity- or composition-scoped) so a config change such as rotation
 * never resets them: [MainActivity] reads these off [OakApplication] instead of
 * `remember`-ing a fresh instance per Activity recreation, which previously wiped the
 * on-screen guest thread and the resolved scope chip on every rotation. This app is
 * online-only with process-death restoration explicitly deferred (platform-and-
 * operational.md), so process-lifetime scoping — no `SavedStateHandle` — is sufficient.
 *
 * Also implements Coil 3's [SingletonImageLoader.Factory]: Coil resolves its process-wide
 * [ImageLoader] by checking whether `applicationContext` implements this interface the
 * first time any composable asks for one, so registering the GIF decoder here (rather
 * than per call site) is what makes the animated Showdown sprite GIFs the backend serves
 * for Megas/alternate formes (see [ai.gowtam.oak.ui.SpriteImage]) play instead of
 * rendering as a static first frame — Coil has no GIF decoder registered by default.
 * `AnimatedImageDecoder` wraps the platform `ImageDecoder`, available from API 28; below
 * that (minSdk is 26) it falls back to the `Movie`-based `GifDecoder`.
 */
class OakApplication : Application(), SingletonImageLoader.Factory {
    val services: ServiceContainer by lazy { ServiceContainer.live(this) }
    val appState: AppState by lazy { AppState(SharedPreferencesAppearanceStore(this)) }

    override fun newImageLoader(context: PlatformContext): ImageLoader {
        return ImageLoader.Builder(context)
            .components {
                if (Build.VERSION.SDK_INT >= 28) {
                    add(AnimatedImageDecoder.Factory())
                } else {
                    add(GifDecoder.Factory())
                }
            }
            .build()
    }
}
