package ai.gowtam.oak.features.chat.answercard

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.GenerationBasis
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Sell
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * The always-on **scope tag** at the top of an answer card — the native mirror of the
 * web masthead scope tag + `scope-tag.ts`. Every [OakAnswer][ai.gowtam.oak.wire.OakAnswer]
 * carries `generation_basis`, and its `generation` shows as a small NEUTRAL tag
 * regardless of fallback (the fallback caution lives in [CaveatStrip] below). The tag
 * text runs the raw basis code through [scopeTagLabel] so it reads the same as web's tag.
 *
 * Renders nothing when the generation string is blank (the caller gates it via
 * [answerSections]); it is drawn here only when present.
 */
@Composable
fun ScopeTag(generationBasis: GenerationBasis, modifier: Modifier = Modifier) {
    val oak = LocalOakColors.current
    val display = scopeTagLabel(generationBasis.generation.trim())
    Row(
        modifier = modifier
            .wrapContentWidth(Alignment.Start)
            .background(oak.surfaceRaised, RoundedCornerShape(OakRadius.sm))
            .border(1.dp, oak.border, RoundedCornerShape(OakRadius.sm))
            .padding(horizontal = OakSpacing.sm, vertical = OakSpacing.xs)
            .semantics { contentDescription = "Answer scope: $display" },
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.Sell,
            contentDescription = null,
            tint = oak.textMuted,
            modifier = Modifier.size(14.dp),
        )
        Text(
            text = display,
            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
            color = oak.textMuted,
        )
    }
}

/** Champions regulation, duplicated from web's `CHAMPIONS_REGULATION` (`formats.ts`). */
private const val CHAMPIONS_REGULATION = "Regulation M-B"

/**
 * Maps a raw `generation_basis.generation` code to its display tag — mirrors web's
 * `formatScopeTag`:
 *  - `"national-dex"` → `"National Dex"`,
 *  - `"champions"` → `"Champions · Reg M-B"` (`Regulation ` shortened to `Reg `),
 *  - `"gen-N"` → `"Gen N"`,
 *  - anything else → returned unchanged (an already-display-form string passes through).
 */
fun scopeTagLabel(generation: String): String = when {
    generation == "national-dex" -> "National Dex"
    generation == "champions" -> "Champions · " + CHAMPIONS_REGULATION.replaceFirst(Regex("^Regulation\\s+", RegexOption.IGNORE_CASE), "Reg ")
    generation.startsWith("gen-") -> "Gen " + generation.removePrefix("gen-")
    else -> generation
}
