package ai.gowtam.oak.features.teams

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.SpriteImage
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
 * Party-slot paper well. Selected slots get a 2.dp poke-red ring (Enamel & Paper
 * teams hero). Empty / unknown types stay a quiet sunken well — no type glow.
 */
@Composable
internal fun TypeEdgeSlot(
    spriteUrl: String?,
    name: String,
    types: List<String>,
    size: Dp,
    modifier: Modifier = Modifier,
    selected: Boolean = false,
) {
    val oak = LocalOakColors.current
    val shape = RoundedCornerShape(OakRadius.md)
    val filled = types.isNotEmpty() || !spriteUrl.isNullOrBlank()
    val fill = if (filled) MaterialTheme.colorScheme.surface else oak.surfaceSunken
    val strokeWidth = if (selected) 2.dp else 1.dp
    val stroke = if (selected) oak.accent else oak.border
    Box(
        modifier = modifier
            .size(size)
            .clip(shape)
            .background(fill, shape)
            .border(strokeWidth, stroke, shape),
        contentAlignment = Alignment.Center,
    ) {
        SpriteImage(url = spriteUrl, name = name, size = size * 0.78f)
    }
}
