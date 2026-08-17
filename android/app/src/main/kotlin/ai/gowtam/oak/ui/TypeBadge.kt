package ai.gowtam.oak.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * A labeled Pokémon type chip — color **and** text, never color-only.
 *
 * Signal §5.1: solid type fill, contrast ink from [OakType.ink], Figtree SemiBold
 * 11sp, 8dp radius. A thin low-alpha black hairline keeps the raw solid edge from
 * looking unfinished against similarly-toned surfaces.
 *
 * The type's name is always shown as text, so color is not the sole carrier of
 * meaning; the label also scales with the user's font-size setting (`sp`) instead of
 * clipping.
 */
@Composable
fun TypeBadge(
    type: String,
    modifier: Modifier = Modifier,
) {
    val color = OakType.color(type)
    val ink = OakType.ink(type)
    val label = type.trim().replaceFirstChar { it.uppercase() }
    val chipShape = RoundedCornerShape(OakRadius.sm)

    Text(
        text = label,
        color = ink,
        style = MaterialTheme.typography.labelSmall.copy(
            fontFamily = FigtreeFamily,
            fontWeight = FontWeight.SemiBold,
            fontSize = 11.sp,
            letterSpacing = 0.sp,
        ),
        textAlign = TextAlign.Center,
        maxLines = 1,
        modifier = modifier
            .background(color, chipShape)
            .border(width = 1.dp, color = Color.Black.copy(alpha = 0.12f), shape = chipShape)
            .padding(horizontal = 8.dp, vertical = 2.dp)
            .semantics { contentDescription = "$label type" },
    )
}
