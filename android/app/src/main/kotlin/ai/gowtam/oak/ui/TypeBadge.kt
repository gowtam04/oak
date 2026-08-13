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

/**
 * A labeled Pokémon type chip — color **and** text, never color-only.
 *
 * Instrument redesign: a **solid, full-chroma** type fill (the web/iOS "signature
 * recipe" of a faint tint + soft border is retired in favor of the type solid itself,
 * per [OakType.color]) with fixed WHITE/DARK ink from [OakType.ink] so every one of
 * the 18 types stays legible without per-type tuning. A thin low-alpha black hairline
 * keeps the raw solid edge from looking unfinished against similarly-toned surfaces.
 * Ports `ios/OakApp/UI/TypeBadge.swift`.
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

    Text(
        text = label,
        color = ink,
        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
        textAlign = TextAlign.Center,
        maxLines = 1,
        modifier = modifier
            .background(color, RoundedCornerShape(OakRadius.pill))
            .border(width = 1.dp, color = Color.Black.copy(alpha = 0.12f), shape = RoundedCornerShape(OakRadius.pill))
            .padding(horizontal = 10.dp, vertical = 3.dp)
            .semantics { contentDescription = "$label type" },
    )
}
