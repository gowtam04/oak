package ai.gowtam.oak.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

/**
 * Not run in this phase (no emulator wired up yet) — kept here so it compiles as part
 * of androidTest source-set validation. Verifies the badge carries the type NAME as
 * text (color is never the sole signal): the label renders and the type is announced
 * to accessibility services.
 */
class TypeBadgeTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun labelTextIsVisibleAlongsideColor() {
        composeTestRule.setContent {
            OakTheme {
                Row {
                    TypeBadge(type = "fire")
                    TypeBadge(type = "water")
                }
            }
        }

        // The human-readable name is present as on-screen text, not color alone.
        composeTestRule.onNodeWithText("Fire").assertIsDisplayed()
        composeTestRule.onNodeWithText("Water").assertIsDisplayed()
        // And it is announced to a screen reader.
        composeTestRule.onNodeWithContentDescription("Fire type").assertExists()
    }
}
