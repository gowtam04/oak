package ai.gowtam.oak.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Oak's header band — the branded replacement for a stock Material `TopAppBar`
 * (theme-translation spec §4.1). Instead of Material's tonal surface it paints the
 * **canvas** (background) edge-to-edge, reserves the status-bar strip in the same
 * warm color, pins the 2dp **red thread** accent rule at the top of the content
 * band on root screens, renders the title in Space Grotesk (via the rewired `titleLarge`),
 * and closes with a hairline `border` rule at the bottom.
 *
 * Slots pass straight through to [TopAppBar], so existing `semantics { heading() }`
 * titles, navigation icons, and action rows (with their `contentDescription`s) are
 * preserved byte-for-byte — only the chrome changes.
 *
 * @param redThread draw the accent top rule (root screens only; pushed detail
 *   screens pass `false`).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OakTopBar(
    title: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    navigationIcon: @Composable () -> Unit = {},
    actions: @Composable RowScope.() -> Unit = {},
    redThread: Boolean = true,
) {
    val oak = LocalOakColors.current
    val canvas = MaterialTheme.colorScheme.background
    Column(modifier = modifier.fillMaxWidth().background(canvas)) {
        // The canvas reaches behind the status bar; the header band (and the red
        // thread) begin just below it.
        Spacer(Modifier.fillMaxWidth().windowInsetsTopHeight(WindowInsets.statusBars))
        if (redThread) {
            Box(Modifier.fillMaxWidth().height(2.dp).background(oak.accent))
        }
        TopAppBar(
            title = title,
            navigationIcon = navigationIcon,
            actions = actions,
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = canvas,
                scrolledContainerColor = canvas,
                titleContentColor = oak.textStrong,
                navigationIconContentColor = oak.textMuted,
                actionIconContentColor = oak.textMuted,
            ),
            // The status-bar strip is reserved above by the Spacer, so the bar itself
            // adds no top inset (avoids double-padding).
            windowInsets = WindowInsets(0, 0, 0, 0),
        )
        HorizontalDivider(color = oak.border, thickness = 1.dp)
    }
}
