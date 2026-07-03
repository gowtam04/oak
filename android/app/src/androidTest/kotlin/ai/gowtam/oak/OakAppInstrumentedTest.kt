package ai.gowtam.oak

import ai.gowtam.oak.app.AppState
import ai.gowtam.oak.app.OakApp
import ai.gowtam.oak.app.ServiceContainer
import ai.gowtam.oak.features.chat.ChatViewModel
import ai.gowtam.oak.ui.OakTheme
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Rule
import org.junit.Test

/**
 * Not run in this phase (no emulator/device wired up yet) — kept here so it compiles as part of
 * androidTest source set validation.
 */
class OakAppInstrumentedTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun chatTabIsSelectedByDefault() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val services = ServiceContainer.live(context)
        val appState = AppState()
        val chatViewModel = ChatViewModel(services.chat, appState)

        composeTestRule.setContent {
            OakTheme {
                OakApp(services = services, appState = appState, chatViewModel = chatViewModel)
            }
        }

        composeTestRule.onNodeWithText("Chat").assertExists()
    }
}
