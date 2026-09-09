package ai.gowtam.oak.features.artifact

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.PinnedArtifactSummary
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun PinnedArtifactStrip(
    pins: List<PinnedArtifactSummary>,
    onOpen: (PinnedArtifactSummary) -> Unit,
    onUnpin: (PinnedArtifactSummary) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (pins.isEmpty()) return
    val oak = LocalOakColors.current
    LazyRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        items(pins, key = { it.id }) { pin ->
            Surface(shape = MaterialTheme.shapes.small, color = oak.surfaceRaised) {
                Row(
                    modifier = Modifier.padding(start = OakSpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = pin.title,
                        style = MaterialTheme.typography.labelMedium,
                        color = oak.textStrong,
                        modifier = Modifier
                            .clickable { onOpen(pin) }
                            .padding(vertical = 8.dp),
                    )
                    IconButton(onClick = { onUnpin(pin) }) {
                        Icon(Icons.Filled.Close, contentDescription = "Unpin ${pin.title}")
                    }
                }
            }
        }
    }
}
