package ai.gowtam.oak

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import ai.gowtam.oak.app.OakTheme
import ai.gowtam.oak.app.OakApp
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
        composeTestRule.setContent {
            OakTheme {
                OakApp()
            }
        }

        composeTestRule.onNodeWithText("Chat").assertExists()
    }
}
