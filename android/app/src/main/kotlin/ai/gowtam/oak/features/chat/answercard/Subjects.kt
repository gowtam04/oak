package ai.gowtam.oak.features.chat.answercard

import ai.gowtam.oak.ui.JetBrainsMonoFamily
import ai.gowtam.oak.ui.OakButton
import ai.gowtam.oak.ui.OakButtonStyle
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.OakType
import ai.gowtam.oak.ui.SpriteImage
import ai.gowtam.oak.ui.TypeBadge
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Subject
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.HistoryToggleOff
import androidx.compose.material.icons.filled.ViewColumn
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Renders an answer's `subjects` — the primary entities the answer is about — as a
 * stack of tappable sprite cards (type-glow sprite well, display name, optional Dex
 * number, type badges, and a fallback pill when the data is pre-Gen-9). Tapping a card
 * opens that Pokémon's profile; with ≥ 2 subjects a "Compare in viewer" button opens a
 * side-by-side comparison. The caller gates it on non-empty subjects.
 *
 * Each card derives its well glow from that subject's own types so dual-subject
 * answers keep per-specimen color (soul.md "type-glow sprite well").
 */
@Composable
fun Subjects(
    subjects: List<Subject>,
    onOpenEntity: (EntityKind, String) -> Unit,
    onOpenComparison: (List<Subject>) -> Unit,
    modifier: Modifier = Modifier,
) {
    val oak = LocalOakColors.current
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
        for (subject in subjects) {
            SubjectCard(
                subject = subject,
                onClick = { onOpenEntity(EntityKind.POKEMON, subject.name) },
            )
        }
        if (subjects.size >= 2) {
            OakButton(onClick = { onOpenComparison(subjects) }, style = OakButtonStyle.Secondary) {
                Icon(Icons.Filled.ViewColumn, contentDescription = null, modifier = Modifier.size(18.dp), tint = oak.accent)
                Text(text = "Compare in viewer", color = oak.accent)
            }
        }
    }
}

/**
 * The tappable sprite/name/type-badge card for one [Subject]. `internal` (not
 * `private`) so the artifact viewer's comparison artifact (P7) can reuse the exact
 * same card rather than duplicating its layout.
 */
@Composable
internal fun SubjectCard(subject: Subject, onClick: () -> Unit) {
    val oak = LocalOakColors.current
    val dark = isSystemInDarkTheme()
    val well = OakType.plateWash(
        primary = subject.types.firstOrNull(),
        secondary = subject.types.getOrNull(1),
        surface = oak.surfaceRaised,
        surfaceSunken = oak.surfaceSunken,
        border = oak.border,
        borderStrong = oak.borderStrong,
        dark = dark,
    )
    val cardShape = RoundedCornerShape(OakRadius.lg)
    // Inset well (soul.md "Type-lit answer plate"): a sunken base with the type glow as
    // the light source radiating out of it, not a type-mixed fill — OakRadius-derived
    // (was a hardcoded 22.dp).
    val wellShape = RoundedCornerShape(OakRadius.lg)
    val glowColors = buildList {
        well.wellGlow?.let { add(it) }
        well.wellGlowSecondary?.let { add(it) }
        add(Color.Transparent)
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(cardShape)
            .background(oak.surfaceRaised.copy(alpha = 0.55f), cardShape)
            .border(1.dp, oak.border.copy(alpha = 0.85f), cardShape)
            .clickable(onClick = onClick)
            .padding(OakSpacing.md),
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.md),
        verticalAlignment = Alignment.Top,
    ) {
        // Type-glow specimen well (soul.md / prototype .specimen__well) — sunken fill,
        // the type glow as the light source, 1dp type-tinted border.
        Box(
            modifier = Modifier
                .size(72.dp)
                .clip(wellShape)
                .background(oak.surfaceSunken, wellShape)
                .background(Brush.radialGradient(glowColors), wellShape)
                .border(1.dp, well.wellBorder, wellShape),
            contentAlignment = Alignment.Center,
        ) {
            SpriteImage(url = subject.spriteUrl, name = subject.name, size = 56.dp)
        }
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(OakSpacing.xs)) {
            Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = subject.name,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = oak.textStrong,
                )
                subject.dexNumber?.let { dex ->
                    Text(
                        text = dexLabel(dex),
                        style = MaterialTheme.typography.bodySmall,
                        color = oak.textMuted,
                        fontFamily = JetBrainsMonoFamily,
                    )
                }
            }
            if (subject.isFallback) {
                Row(
                    modifier = Modifier
                        .background(oak.warning.copy(alpha = 0.14f), RoundedCornerShape(OakRadius.pill))
                        .padding(horizontal = OakSpacing.sm, vertical = 3.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.HistoryToggleOff, contentDescription = null, tint = oak.warning, modifier = Modifier.size(12.dp))
                    Text(
                        text = subject.sourceGeneration ?: "Fallback",
                        style = MaterialTheme.typography.labelSmall,
                        color = oak.warning,
                    )
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for (type in subject.types) {
                    TypeBadge(type = type)
                }
            }
        }
    }
}

/** National Dex number, zero-padded to four digits (e.g. `#0006`). */
internal fun dexLabel(number: Int): String {
    val digits = number.toString()
    return "#" + "0".repeat(maxOf(0, 4 - digits.length)) + digits
}
