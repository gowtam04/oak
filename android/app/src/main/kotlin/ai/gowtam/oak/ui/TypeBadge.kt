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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * A labeled Pokémon type chip — color **and** text, never color-only.
 *
 * Enamel & Paper: tinted pill (16/72/30 mix via [OakType.badgeFill] /
 * [OakType.badgeInk] / [OakType.badgeBorder]), not a Signal solid. Nunito Sans
 * 600 / 11sp, pill radius. The type name is always shown, so color is never the
 * sole carrier of meaning; the label scales with the user's font-size (`sp`).
 */
@Composable
fun TypeBadge(
    type: String,
    modifier: Modifier = Modifier,
) {
    val oak = LocalOakColors.current
    val dark = isSystemInDarkTheme()
    val surface = MaterialTheme.colorScheme.surface
    val fill = OakType.badgeFill(type, surface, dark)
    val ink = OakType.badgeInk(type, oak.textStrong, dark)
    val stroke = OakType.badgeBorder(type)
    val label = type.trim().replaceFirstChar { it.uppercase() }
    val chipShape = RoundedCornerShape(OakRadius.pill)

    Text(
        text = label,
        color = ink,
        style = MaterialTheme.typography.labelSmall.copy(
            fontFamily = NunitoSansFamily,
            fontWeight = FontWeight.SemiBold,
            fontSize = 11.sp,
            letterSpacing = 0.03.em,
        ),
        textAlign = TextAlign.Center,
        maxLines = 1,
        modifier = modifier
            .background(fill, chipShape)
            .border(width = 1.dp, color = stroke, shape = chipShape)
            .padding(horizontal = 10.dp, vertical = 2.dp)
            .semantics { contentDescription = "$label type" },
    )
}
