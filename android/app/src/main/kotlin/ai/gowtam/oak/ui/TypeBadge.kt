package ai.gowtam.oak.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/**
 * A labeled Pokémon type chip — color **and** text, never color-only.
 *
 * Mirrors the web "signature recipe" (`web/src/app/globals.css` `.type-badge`): a
 * faint type-tinted pill, strong type-colored text, a soft type-colored border. The
 * palette is sourced from [OakType.color] (the single source of the 18 type solids).
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
    val oak = LocalOakColors.current
    val dark = isSystemInDarkTheme()
    val color = OakType.color(type)
    val label = type.trim().replaceFirstChar { it.uppercase() }

    // color-mix(in srgb, type X%, base) → lerp(base, type, X).
    val textColor = lerp(oak.textStrong, color, if (dark) 0.45f else 0.72f)
    val background = lerp(MaterialTheme.colorScheme.surface, color, if (dark) 0.26f else 0.16f)

    Text(
        text = label,
        color = textColor,
        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
        textAlign = TextAlign.Center,
        maxLines = 1,
        modifier = modifier
            .background(background, RoundedCornerShape(OakRadius.pill))
            .border(width = 1.dp, color = color.copy(alpha = 0.30f), shape = RoundedCornerShape(OakRadius.pill))
            .padding(horizontal = 10.dp, vertical = 3.dp)
            .semantics { contentDescription = "$label type" },
    )
}
