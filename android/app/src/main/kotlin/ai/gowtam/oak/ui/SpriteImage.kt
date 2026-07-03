package ai.gowtam.oak.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.SubcomposeAsyncImage

/**
 * A Pokémon sprite loaded from a remote URL, with loading, failure, and missing-URL
 * states.
 *
 * Sprite art arrives from the backend as absolute URLs on the answer payload — small
 * pixel-art images. This wraps Coil's [SubcomposeAsyncImage] so the answer card can
 * drop sprites inline with a graceful placeholder while loading and a calm fallback
 * when the URL is absent or the fetch fails. Rendering uses [FilterQuality.None] so the
 * pixel art stays crisp when scaled instead of blurring. Ports
 * `ios/OakApp/UI/SpriteImage.swift`.
 *
 * Accessibility: the box is one element labeled with the entity [name], so a screen
 * reader announces the subject even when only the placeholder shows — the picture is
 * never the sole carrier of meaning.
 */
@Composable
fun SpriteImage(
    url: String?,
    name: String,
    modifier: Modifier = Modifier,
    size: Dp = 56.dp,
) {
    val cleaned = url?.trim()?.takeIf { it.isNotEmpty() }
    val boxModifier = modifier
        .size(size)
        .semantics { contentDescription = name }

    if (cleaned == null) {
        Placeholder(boxModifier, size)
        return
    }

    SubcomposeAsyncImage(
        model = cleaned,
        contentDescription = name,
        modifier = boxModifier,
        contentScale = ContentScale.Fit,
        filterQuality = FilterQuality.None,
        loading = {
            Box(Modifier.size(size), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(strokeWidth = 2.dp)
            }
        },
        error = { Placeholder(Modifier.size(size), size) },
    )
}

/**
 * The no-image surface — a rounded tile carrying an image glyph so the empty state
 * reads as "image unavailable" rather than a blank gap.
 */
@Composable
private fun Placeholder(modifier: Modifier, size: Dp) {
    val oak = LocalOakColors.current
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(OakRadius.sm))
            .background(oak.surfaceSunken),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Outlined.Image,
            contentDescription = null,
            tint = oak.textFaint,
            modifier = Modifier.size(size * 0.4f),
        )
    }
}
