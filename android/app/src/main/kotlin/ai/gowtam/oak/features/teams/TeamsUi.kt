package ai.gowtam.oak.features.teams

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
