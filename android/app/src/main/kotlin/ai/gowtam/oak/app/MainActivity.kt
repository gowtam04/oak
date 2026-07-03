package ai.gowtam.oak.app

import ai.gowtam.oak.features.chat.ChatViewModel
import ai.gowtam.oak.ui.OakTheme
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext

/**
 * The single Activity hosting the whole Compose app (component-design.md "Navigation
 * graph"). Builds the composition root — one [ServiceContainer] + [AppState] shared by
 * every screen, and the [ChatViewModel] the Chat tab uses (constructed here, not inside
 * [OakApp], so it survives a tab switch away from Chat and back) — restores the session
 * once at launch, and mirrors the chat reducer's [ChatViewModel.keepScreenOn] flag onto
 * `FLAG_KEEP_SCREEN_ON` (the Android analog of iOS's `isIdleTimerDisabled`), released on
 * every terminal/stop/cancel path per the view model's own bookkeeping.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val context = LocalContext.current
            val services = remember { ServiceContainer.live(context) }
            val appState = remember { AppState() }
            val chatViewModel = remember { ChatViewModel(services.chat, appState) }

            LaunchedEffect(services) { appState.restoreSession(services.auth) }

            val keepScreenOn by chatViewModel.keepScreenOn.collectAsState()
            LaunchedEffect(keepScreenOn) {
                if (keepScreenOn) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                } else {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                }
            }

            OakTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    OakApp(services = services, appState = appState, chatViewModel = chatViewModel)
                }
            }
        }
    }
}
