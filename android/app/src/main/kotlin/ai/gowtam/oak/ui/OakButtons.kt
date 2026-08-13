package ai.gowtam.oak.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * The Oak button family (theme-translation spec §4.5), mirroring the web `.tm-btn`
 * system so a control reads as Oak, not Material:
 *
 * - [OakButtonStyle.Primary]   — accent fill, white Inter 700, [OakRadius.md] rounding.
 * - [OakButtonStyle.Secondary] — `surface` fill + `borderStrong` hairline; press tints azure.
 * - [OakButtonStyle.Ghost]     — text-only `textMuted`.
 * - [OakButtonStyle.Danger]    — `dangerSoft` fill + danger ink.
 *
 * All are [OakRadius.md]-rounded (pill remains reserved for chips/composer), ≥44dp
 * tall, and dip to 0.97 on press (snappy spring; collapses to an instant snap under
 * reduce-motion). Color is never the only signal — the label always carries the
 * meaning.
 */
enum class OakButtonStyle { Primary, Secondary, Ghost, Danger }

@Composable
fun OakButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    style: OakButtonStyle = OakButtonStyle.Primary,
    enabled: Boolean = true,
    content: @Composable RowScope.() -> Unit,
) {
    val oak = LocalOakColors.current
    val reduceMotion = rememberReduceMotion()
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed && enabled) 0.97f else 1f,
        animationSpec = if (reduceMotion) snap() else OakMotion.snappy,
        label = "oakButtonScale",
    )

    val surface = MaterialTheme.colorScheme.surface
    val baseContainer: Color
    val contentColor: Color
    val borderColor: Color?
    when (style) {
        OakButtonStyle.Primary -> {
            baseContainer = oak.accent; contentColor = Color.White; borderColor = null
        }
        OakButtonStyle.Secondary -> {
            baseContainer = surface; contentColor = oak.textStrong; borderColor = oak.borderStrong
        }
        OakButtonStyle.Ghost -> {
            baseContainer = Color.Transparent; contentColor = oak.textMuted; borderColor = null
        }
        OakButtonStyle.Danger -> {
            baseContainer = oak.dangerSoft; contentColor = oak.danger; borderColor = null
        }
    }

    // Secondary presses tint azure (interaction color); primary/danger deepen slightly.
    val container = when {
        style == OakButtonStyle.Secondary && pressed -> oak.azureSoft
        else -> baseContainer
    }
    val effectiveBorder = when {
        borderColor == null -> null
        pressed -> oak.azure
        else -> borderColor
    }
    val shape = RoundedCornerShape(OakRadius.md)
    val alpha = if (enabled) 1f else 0.5f

    Row(
        modifier = modifier
            .graphicsLayer { scaleX = scale; scaleY = scale; this.alpha = alpha }
            .clip(shape)
            .background(container, shape)
            .then(if (effectiveBorder != null) Modifier.border(1.dp, effectiveBorder, shape) else Modifier)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                enabled = enabled,
                onClick = onClick,
            )
            .heightIn(min = 44.dp)
            .padding(horizontal = OakSpacing.lg, vertical = OakSpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CompositionLocalProvider(LocalContentColor provides contentColor) {
            ProvideTextStyle(MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold)) {
                content()
            }
        }
    }
}
