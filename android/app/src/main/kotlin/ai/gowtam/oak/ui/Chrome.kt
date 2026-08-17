package ai.gowtam.oak.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * Signal wordmark — `Oak` plus a red period. Figtree 18sp SemiBold, −0.03em
 * tracking. No tile, no ring. Used as the Chat / Teams / Account header title
 * wherever a brand mark currently lives.
 */
@Composable
fun OakWordmark(modifier: Modifier = Modifier) {
    val oak = LocalOakColors.current
    val style = MaterialTheme.typography.titleLarge.copy(
        fontFamily = FigtreeFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 18.sp,
        letterSpacing = (-0.03).em,
    )
    Text(
        text = buildAnnotatedString {
            withStyle(SpanStyle(color = oak.textStrong)) { append("Oak") }
            withStyle(SpanStyle(color = oak.accent)) { append(".") }
        },
        style = style,
        modifier = modifier.semantics {
            heading()
            contentDescription = "Oak"
        },
    )
}

/**
 * Oak's header band — the branded replacement for a stock Material `TopAppBar`
 * (Signal §5). Instead of Material's tonal surface it paints the **canvas**
 * (background) edge-to-edge, reserves the status-bar strip in the same color,
 * and closes with a hairline `border` rule at the bottom. No red header slab.
 *
 * Slots pass straight through to [TopAppBar], so existing `semantics { heading() }`
 * titles, navigation icons, and action rows (with their `contentDescription`s) are
 * preserved — only the chrome changes.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OakTopBar(
    title: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    navigationIcon: @Composable () -> Unit = {},
    actions: @Composable RowScope.() -> Unit = {},
) {
    val oak = LocalOakColors.current
    val canvas = MaterialTheme.colorScheme.background
    Column(modifier = modifier.fillMaxWidth().background(canvas)) {
        // The canvas reaches behind the status bar; the header band begins just below it.
        Spacer(Modifier.fillMaxWidth().windowInsetsTopHeight(WindowInsets.statusBars))
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
