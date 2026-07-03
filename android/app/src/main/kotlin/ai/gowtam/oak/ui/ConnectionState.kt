package ai.gowtam.oak.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Whether the client currently has a working connection to Oak. [Reconnecting] is the
 * transient state after a transport drop while auto-retrying; [Offline] is the settled
 * no-connection state. Finalized in P11.
 */
enum class ConnectionStatus { Online, Reconnecting, Offline }

/**
 * A slim status banner that appears only when the connection is degraded — a calm,
 * non-blocking surface so a dropped stream never reads as a crash. Color is paired
 * with an icon and text, so it is never the sole signal. The show/hide fade is gated
 * by [rememberReduceMotion] (animator duration scale 0 → the banner snaps in/out).
 * The row is a polite live region so a screen reader announces state changes.
 */
@Composable
fun ConnectionBanner(
    status: ConnectionStatus,
    modifier: Modifier = Modifier,
) {
    val reduceMotion = rememberReduceMotion()
    AnimatedVisibility(
        visible = status != ConnectionStatus.Online,
        enter = if (reduceMotion) EnterTransition.None else fadeIn(tween(OakMotion.FADE_MILLIS)),
        exit = if (reduceMotion) ExitTransition.None else fadeOut(tween(OakMotion.FADE_MILLIS)),
        modifier = modifier,
    ) {
        val oak = LocalOakColors.current
        val (icon, label, accent) = when (status) {
            ConnectionStatus.Reconnecting ->
                Triple<ImageVector, String, Color>(Icons.Filled.Sync, "Reconnecting…", oak.warning)
            else ->
                Triple<ImageVector, String, Color>(Icons.Filled.CloudOff, "You're offline", oak.danger)
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(lerp(oak.surfaceRaised, accent, 0.12f))
                .padding(horizontal = OakSpacing.lg, vertical = OakSpacing.sm)
                .semantics { liveRegion = LiveRegionMode.Polite },
            horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = accent,
                modifier = Modifier.size(16.dp),
            )
            Text(
                text = label,
                color = oak.textStrong,
                style = androidx.compose.material3.MaterialTheme.typography.labelMedium
                    .copy(fontWeight = FontWeight.Medium),
            )
        }
    }
}
