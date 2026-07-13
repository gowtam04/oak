package ai.gowtam.oak.features.teams

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.OakType
import ai.gowtam.oak.ui.SpriteImage
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * A slim, dismissible error surface shared by the Teams list/editor/import screens —
 * an icon **and** the message text (never color alone), plus a Dismiss action.
 */
@Composable
internal fun TeamsErrorBanner(message: String, onDismiss: () -> Unit, modifier: Modifier = Modifier) {
    val oak = LocalOakColors.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(oak.surfaceRaised, RoundedCornerShape(OakRadius.md))
            .padding(OakSpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        Icon(Icons.Filled.WarningAmber, contentDescription = null, tint = oak.warning)
        Text(message, style = MaterialTheme.typography.bodySmall, color = oak.textStrong, modifier = Modifier.weight(1f))
        TextButton(onClick = onDismiss) { Text("Dismiss") }
    }
}

/**
 * Party-slot specimen well: type edge + soft glow when [types] are known
 * (`docs/design/soul.md` Phase 2 — team party type edges). Empty / unknown types
 * fall back to a quiet raised well (no false type color).
 */
@Composable
internal fun TypeEdgeSlot(
    spriteUrl: String?,
    name: String,
    types: List<String>,
    size: Dp,
    modifier: Modifier = Modifier,
) {
    val oak = LocalOakColors.current
    val dark = isSystemInDarkTheme()
    val primary = types.firstOrNull()
    val secondary = types.getOrNull(1)
    val wash = if (primary != null) {
        OakType.plateWash(
            primary = primary,
            secondary = secondary,
            surface = oak.surfaceRaised,
            surfaceSunken = oak.surfaceSunken,
            border = oak.border,
            borderStrong = oak.borderStrong,
            dark = dark,
        )
    } else {
        null
    }
    val shape = RoundedCornerShape(OakRadius.md)
    val glowColors = if (wash != null) {
        buildList {
            wash.wellGlow?.let { add(it) }
            wash.wellGlowSecondary?.let { add(it) }
            add(wash.wellFill)
            add(wash.wellFill.copy(alpha = 0f))
        }
    } else {
        listOf(oak.surfaceSunken, oak.surfaceSunken.copy(alpha = 0f))
    }
    val edge = wash?.wellBorder ?: oak.border
    Box(
        modifier = modifier
            .size(size)
            .clip(shape)
            .background(Brush.radialGradient(glowColors), shape)
            .border(1.5.dp, edge, shape),
        contentAlignment = Alignment.Center,
    ) {
        SpriteImage(url = spriteUrl, name = name, size = size * 0.78f)
    }
}
