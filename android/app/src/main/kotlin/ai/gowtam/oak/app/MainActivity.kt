package ai.gowtam.oak.app

import ai.gowtam.oak.features.artifact.ArtifactViewModel
import ai.gowtam.oak.features.chat.ChatViewModel
import ai.gowtam.oak.ui.OakTheme
import ai.gowtam.oak.wire.Format
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider

/**
 * The single Activity hosting the whole Compose app (component-design.md "Navigation
 * graph"). [ServiceContainer] + [AppState] live on [OakApplication] (process-scoped);
 * [ChatViewModel] and [ArtifactViewModel] are resolved through this Activity's
 * [androidx.lifecycle.ViewModelStore] via [ViewModelProvider] rather than `remember`ed
 * in composition — the `ViewModelStore` is retained by the framework across a
 * configuration change (e.g. rotation), so both survive it. (A prior version built all
 * four with bare `remember {}` blocks inside `setContent`; those die with the Activity
 * on every recreation, which wiped the on-screen thread and reset the scope chip to its
 * Champions default on rotation.) Restores the session once at launch, and mirrors the
 * chat reducer's [ChatViewModel.keepScreenOn] flag onto `FLAG_KEEP_SCREEN_ON` (the
 * Android analog of iOS's `isIdleTimerDisabled`), released on every terminal/stop/cancel
 * path per the view model's own bookkeeping.
 */
class MainActivity : ComponentActivity() {
    private val oakApplication: OakApplication
        get() = application as OakApplication

    private val chatViewModel: ChatViewModel by lazy {
        ViewModelProvider(
            this,
            factoryOf {
                ChatViewModel(
                    chat = oakApplication.services.chat,
                    appState = oakApplication.appState,
                    history = oakApplication.services.history,
                    teams = oakApplication.services.teams,
                    scope = oakApplication.services.scope,
                    shares = oakApplication.services.shares,
                    calc = oakApplication.services.calc,
                    hydrate = oakApplication.services.hydrate,
                    pins = oakApplication.services.pins,
                )
            },
        )[ChatViewModel::class.java]
    }

    private val artifactViewModel: ArtifactViewModel by lazy {
        ViewModelProvider(
            this,
            factoryOf { ArtifactViewModel(oakApplication.services.artifact, Format.Champions) },
        )[ArtifactViewModel::class.java]
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val services = oakApplication.services
        val appState = oakApplication.appState

        handleShareIntent(intent, appState)

        setContent {
            LaunchedEffect(services) {
                appState.restoreSession(services.auth)
                appState.refreshRegulation(services.scope)
            }

            val keepScreenOn by chatViewModel.keepScreenOn.collectAsState()
            LaunchedEffect(keepScreenOn) {
                if (keepScreenOn) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                } else {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                }
            }

            val appearance by appState.appearance.collectAsState()
            val systemDark = isSystemInDarkTheme()
            OakTheme(darkTheme = appearance.resolveDark(systemDark)) {
                Surface(modifier = Modifier.fillMaxSize()) {
                    OakApp(services = services, appState = appState, chatViewModel = chatViewModel, artifactViewModel = artifactViewModel)
                }
            }
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        handleShareIntent(intent, oakApplication.appState)
    }
}

private fun handleShareIntent(intent: android.content.Intent, appState: AppState) {
    val data = intent.data ?: return
    val path = data.path ?: return
    val prefix = "/a/"
    if (!path.startsWith(prefix)) return
    val id = path.removePrefix(prefix).trim('/')
    if (id.isNotEmpty()) appState.requestShareSnapshot(id)
}

/** A minimal [ViewModelProvider.Factory] built from a plain constructor lambda, so
 * [ChatViewModel]/[ArtifactViewModel] can take their real (non-`SavedStateHandle`)
 * constructor args while still being stored in the Activity's `ViewModelStore`. */
private fun <T : ViewModel> factoryOf(build: () -> T): ViewModelProvider.Factory =
    object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <VM : ViewModel> create(modelClass: Class<VM>): VM = build() as VM
    }
