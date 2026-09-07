package ai.gowtam.oak.ui

import android.animation.ValueAnimator
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.SubcomposeAsyncImage
import coil3.decode.BitmapFactoryDecoder
import coil3.request.ImageRequest

/**
 * A Pokémon sprite loaded from a remote URL, with loading, failure, and missing-URL
 * states.
 *
 * Backend sprites are Showdown `ani` GIFs served through Oak
 * `/api/media/sprite/{id}` (absolute URLs on the answer payload and the dex list).
 * This wraps Coil's [SubcomposeAsyncImage] so answer cards, detail, and teams can
 * drop sprites inline with a graceful placeholder while loading and a calm fallback
 * when the URL is absent or the fetch fails. Animated GIFs play automatically —
 * [ai.gowtam.oak.app.OakApplication] registers Coil's GIF decoder on the process-wide
 * `ImageLoader` — except when [animated] is `false` (dex list thumbs) or the system's
 * "remove animations" accessibility setting is on, in which case this pins the
 * request to a static first-frame decode instead of GIF playback. Rendering uses
 * [FilterQuality.None] so the pixel art stays crisp when scaled instead of blurring.
 * Ports `ios/OakApp/UI/SpriteImage.swift`.
 *
 * List thumbs pass `animated = false, decorative = true` so the row stays a still
 * first frame (no GIF playback, no loading spinner, no error glyph) and TalkBack
 * does not announce the picture — the parent Dex row remains the a11y element.
 * Defaults keep answer cards / detail / teams on the current animated, labeled
 * behavior.
 *
 * Accessibility: when [decorative] is `false` the box is one element labeled with
 * the entity [name], so a screen reader announces the subject even when only the
 * placeholder shows — the picture is never the sole carrier of meaning.
 */
@Composable
fun SpriteImage(
    url: String?,
    name: String,
    modifier: Modifier = Modifier,
    size: Dp = 56.dp,
    animated: Boolean = true,
    decorative: Boolean = false,
) {
    val cleaned = url?.trim()?.takeIf { it.isNotEmpty() }
    val boxModifier = modifier.size(size).let { sized ->
        if (decorative) sized else sized.semantics { contentDescription = name }
    }

    if (cleaned == null) {
        if (animated) Placeholder(boxModifier, size) else EmptyWell(boxModifier)
        return
    }

    val context = LocalContext.current
    // System-wide "remove animations" (animator duration scale 0×) — honor it the same
    // way a Reduce Motion setting would, by forcing a genuinely static decode rather than
    // letting an animated GIF play once and freeze on its last frame. List thumbs also
    // pin a still first frame even when animators are enabled.
    val animatorsEnabled = remember { ValueAnimator.areAnimatorsEnabled() }
    val playGif = animated && animatorsEnabled
    val model = remember(cleaned, animated, animatorsEnabled) {
        ImageRequest.Builder(context)
            .data(cleaned)
            .apply {
                if (!playGif) {
                    // Pinned first so it wins over the registered animated-GIF decoder
                    // (Coil prepends per-request decoderFactory overrides), and
                    // BitmapFactory itself only ever reads a GIF's first frame.
                    decoderFactory(BitmapFactoryDecoder.Factory())
                }
            }
            .build()
    }

    SubcomposeAsyncImage(
        model = model,
        contentDescription = if (decorative) null else name,
        modifier = boxModifier,
        contentScale = ContentScale.Fit,
        filterQuality = FilterQuality.None,
        loading = {
            if (animated) {
                Box(Modifier.size(size), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(strokeWidth = 2.dp)
                }
            } else {
                EmptyWell(Modifier.size(size))
            }
        },
        error = {
            if (animated) Placeholder(Modifier.size(size), size) else EmptyWell(Modifier.size(size))
        },
    )
}

/**
 * The quiet no-image surface — a rounded sunken tile with no glyph, used by still
 * list thumbs so a missing/loading sprite is a blank well rather than a noisy icon.
 */
@Composable
private fun EmptyWell(
    modifier: Modifier,
    content: @Composable BoxScope.() -> Unit = {},
) {
    val oak = LocalOakColors.current
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(OakRadius.sm))
            .background(oak.surfaceSunken),
        contentAlignment = Alignment.Center,
        content = content,
    )
}

/**
 * The no-image surface — a rounded tile carrying an image glyph so the empty state
 * reads as "image unavailable" rather than a blank gap.
 */
@Composable
private fun Placeholder(modifier: Modifier, size: Dp) {
    val oak = LocalOakColors.current
    EmptyWell(modifier) {
        Icon(
            imageVector = Icons.Outlined.Image,
            contentDescription = null,
            tint = oak.textFaint,
            modifier = Modifier.size(size * 0.4f),
        )
    }
}
