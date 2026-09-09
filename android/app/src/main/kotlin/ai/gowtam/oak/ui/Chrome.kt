package ai.gowtam.oak.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

/** `--neutral-900` mixed into the lid's bottom edge (12% into `--poke-red-active`). */
private val LidEdgeUmber = Color(0xFF231F1C)

/**
 * Enamel lid wordmark — 32.dp coral tile with a white O ring, plus Fredoka "Oak"
 * in `--on-red`. Not `Oak.` + a red period. VoiceOver stays "Oak". Used as the
 * Chat / Teams / Account header title on [OakTopBar].
 */
@Composable
fun OakWordmark(modifier: Modifier = Modifier) {
    val oak = LocalOakColors.current
    Row(
        modifier = modifier.semantics(mergeDescendants = true) {
            heading()
            contentDescription = "Oak"
        },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.md),
    ) {
        OakBrandMark()
        Text(
            text = "Oak",
            style = MaterialTheme.typography.displaySmall,
            color = oak.onRed,
            maxLines = 1,
        )
    }
}

/** 32.dp in-app tile (rounded square + white ring). Not the home-screen glyph. */
@Composable
private fun OakBrandMark(modifier: Modifier = Modifier) {
    val oak = LocalOakColors.current
    val tile = RoundedCornerShape(8.dp)
    Box(
        modifier = modifier
            .size(32.dp)
            .shadow(
                elevation = 1.dp,
                shape = tile,
                ambientColor = Color.Black.copy(alpha = 0.24f),
                spotColor = Color.Black.copy(alpha = 0.24f),
            )
            .background(oak.accent, tile)
            .border(2.dp, Color.White.copy(alpha = 0.62f), tile),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.size(32.dp)) {
            drawCircle(
                color = Color.White,
                radius = 7.7.dp.toPx(),
                style = Stroke(width = 4.6.dp.toPx(), cap = StrokeCap.Butt),
            )
        }
    }
}

/**
 * Oak's header band — opaque enamel lid through the status bar (Enamel & Paper).
 * Status-bar strip + [TopAppBar] paint `--poke-red` as one block; icons and titles
 * are `--on-red`. Closes with a 2.dp umber-into-active hairline. No canvas header,
 * no Material tonal frost.
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
    val enamel = oak.accent
    val lidEdge = lerp(oak.accentActive, LidEdgeUmber, 0.12f)
    Column(modifier = modifier.fillMaxWidth().background(enamel)) {
        // The lid reaches behind the status bar so lid + status bar read as one block.
        Spacer(Modifier.fillMaxWidth().windowInsetsTopHeight(WindowInsets.statusBars))
        TopAppBar(
            title = title,
            navigationIcon = navigationIcon,
            actions = actions,
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = enamel,
                scrolledContainerColor = enamel,
                titleContentColor = oak.onRed,
                navigationIconContentColor = oak.onRed,
                actionIconContentColor = oak.onRed,
            ),
            // The status-bar strip is reserved above by the Spacer, so the bar itself
            // adds no top inset (avoids double-padding).
            windowInsets = WindowInsets(0, 0, 0, 0),
        )
        HorizontalDivider(color = lidEdge, thickness = 2.dp)
    }
}
