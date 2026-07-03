package ai.gowtam.oak.ui

import android.provider.Settings
import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Oak's brand expression over Android / Material 3.
 *
 * Colors are sourced from the web design system (`web/src/app/globals.css`) and
 * re-expressed natively, mirroring the iOS `Theme` (`ios/OakApp/UI/Theme.swift`).
 * Material's [ColorScheme] carries the surface/text/primary ramp so components get
 * Material contrast + dark-mode behavior for free; the *extended* Oak tokens that
 * Material has no slot for (the accent hover/active variants, sunflower, azure, the
 * four semantic colors, the muted/faint text steps) ride a companion [OakColors]
 * over [LocalOakColors].
 *
 * Color is never the sole carrier of meaning — that pairing with text/icon is the
 * calling view's responsibility; the theme only supplies the palette and ramp.
 *
 * Typography uses `sp` everywhere (never fixed `dp` text), so every label scales with
 * the user's system font-size setting.
 */
@Composable
fun OakTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) OakDarkColorScheme else OakLightColorScheme
    val oakColors = if (darkTheme) OakDarkColors else OakLightColors
    CompositionLocalProvider(LocalOakColors provides oakColors) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = OakTypography,
            content = content,
        )
    }
}

// ---------------------------------------------------------------------------
// Extended Oak tokens (the colors Material's ColorScheme has no slot for)
// ---------------------------------------------------------------------------

/**
 * Brand + semantic tokens beyond Material's [ColorScheme]. Reach them from a
 * composable via `LocalOakColors.current`. Pair any color that conveys state
 * (danger/success/warning) with text or an icon — color alone is never the signal.
 */
@Immutable
data class OakColors(
    val accent: Color,
    val accentHover: Color,
    val accentActive: Color,
    val accentSoft: Color,
    val sunflower: Color,
    val azure: Color,
    val success: Color,
    val warning: Color,
    val danger: Color,
    val info: Color,
    val surfaceRaised: Color,
    val surfaceSunken: Color,
    val border: Color,
    val borderStrong: Color,
    val textStrong: Color,
    val text: Color,
    val textMuted: Color,
    val textFaint: Color,
)

/** Light-mode extended tokens (`:root` in globals.css). */
val OakLightColors = OakColors(
    accent = Color(0xFFEE5A5A),
    accentHover = Color(0xFFE04545),
    accentActive = Color(0xFFC93B3B),
    accentSoft = Color(0xFFFCEBEB),
    sunflower = Color(0xFFF5A524),
    azure = Color(0xFF3AA0E3),
    success = Color(0xFF2FB573),
    warning = Color(0xFFF08C00),
    danger = Color(0xFFE0394A),
    info = Color(0xFF3AA0E3),
    surfaceRaised = Color(0xFFFFFFFF),
    surfaceSunken = Color(0xFFF7F1EB),
    border = Color(0xFFE9E0D8),
    borderStrong = Color(0xFFD8CCC1),
    textStrong = Color(0xFF2A2521),
    text = Color(0xFF3D362F),
    textMuted = Color(0xFF6E625A),
    textFaint = Color(0xFF94867A),
)

/** Dark-mode extended tokens (`[data-theme="dark"]` in globals.css). */
val OakDarkColors = OakColors(
    accent = Color(0xFFFF6B6B),
    accentHover = Color(0xFFFF7E7E),
    accentActive = Color(0xFFF25C5C),
    accentSoft = Color(0xFF3A1E1E),
    sunflower = Color(0xFFF8B73E),
    azure = Color(0xFF5BB4EF),
    success = Color(0xFF46C98A),
    warning = Color(0xFFFBA53B),
    danger = Color(0xFFFF5C6B),
    info = Color(0xFF5BB4EF),
    surfaceRaised = Color(0xFF2A2420),
    surfaceSunken = Color(0xFF12100E),
    border = Color(0xFF3A332E),
    borderStrong = Color(0xFF4E453F),
    textStrong = Color(0xFFF5EFE9),
    text = Color(0xFFE4DAD0),
    textMuted = Color(0xFFB7A99C),
    textFaint = Color(0xFF8A7D72),
)

/**
 * The extended Oak palette for the active theme. `noLocalProvidedFor` never fires in
 * practice because [OakTheme] always provides it; the light default keeps previews
 * that forget the theme from crashing.
 */
val LocalOakColors = staticCompositionLocalOf { OakLightColors }

// ---------------------------------------------------------------------------
// Material 3 ColorScheme (Oak tokens mapped onto Material slots)
// ---------------------------------------------------------------------------

private val OakLightColorScheme: ColorScheme = lightColorScheme(
    primary = Color(0xFFEE5A5A),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFFCEBEB),
    onPrimaryContainer = Color(0xFF2A2521),
    secondary = Color(0xFF3AA0E3),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFE6F2FB),
    onSecondaryContainer = Color(0xFF2A2521),
    tertiary = Color(0xFFF5A524),
    onTertiary = Color(0xFF2A2521),
    tertiaryContainer = Color(0xFFFDF1DC),
    onTertiaryContainer = Color(0xFF2A2521),
    background = Color(0xFFFBF7F4),
    onBackground = Color(0xFF3D362F),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF3D362F),
    surfaceVariant = Color(0xFFF7F1EB),
    onSurfaceVariant = Color(0xFF6E625A),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFFBF7F4),
    surfaceContainer = Color(0xFFF7F1EB),
    surfaceContainerHigh = Color(0xFFF3ECE6),
    surfaceContainerHighest = Color(0xFFE9E0D8),
    outline = Color(0xFFD8CCC1),
    outlineVariant = Color(0xFFE9E0D8),
    error = Color(0xFFE0394A),
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFFCE8EA),
    onErrorContainer = Color(0xFF2A2521),
)

private val OakDarkColorScheme: ColorScheme = darkColorScheme(
    primary = Color(0xFFFF6B6B),
    onPrimary = Color(0xFF2A1010),
    primaryContainer = Color(0xFF3A1E1E),
    onPrimaryContainer = Color(0xFFF5EFE9),
    secondary = Color(0xFF5BB4EF),
    onSecondary = Color(0xFF0C1620),
    secondaryContainer = Color(0xFF16263A),
    onSecondaryContainer = Color(0xFFF5EFE9),
    tertiary = Color(0xFFF8B73E),
    onTertiary = Color(0xFF2A1E0A),
    tertiaryContainer = Color(0xFF3A2E14),
    onTertiaryContainer = Color(0xFFF5EFE9),
    background = Color(0xFF161311),
    onBackground = Color(0xFFE4DAD0),
    surface = Color(0xFF211C19),
    onSurface = Color(0xFFE4DAD0),
    surfaceVariant = Color(0xFF12100E),
    onSurfaceVariant = Color(0xFFB7A99C),
    surfaceContainerLowest = Color(0xFF12100E),
    surfaceContainerLow = Color(0xFF1B1714),
    surfaceContainer = Color(0xFF211C19),
    surfaceContainerHigh = Color(0xFF2A2420),
    surfaceContainerHighest = Color(0xFF332D29),
    outline = Color(0xFF4E453F),
    outlineVariant = Color(0xFF3A332E),
    error = Color(0xFFFF5C6B),
    onError = Color(0xFF2A1010),
    errorContainer = Color(0xFF3A1518),
    onErrorContainer = Color(0xFFF5EFE9),
)

// ---------------------------------------------------------------------------
// Corner radii + spacing tokens (brand favors generous rounding)
// ---------------------------------------------------------------------------

/** Corner radii, mirroring `--radius-*` in globals.css. */
object OakRadius {
    val sm = 6.dp
    val md = 10.dp
    val lg = 16.dp
    val xl = 24.dp
    val pill = 999.dp
}

/** The base spacing scale (4pt grid). */
object OakSpacing {
    val xs = 4.dp
    val sm = 8.dp
    val md = 12.dp
    val lg = 16.dp
    val xl = 24.dp
    val xxl = 32.dp
}

// ---------------------------------------------------------------------------
// Typography — sp everywhere, honoring the system font scale
// ---------------------------------------------------------------------------

/**
 * Oak's type ramp. Built on the default (system) font family so it scales with the
 * user's font-size setting; every size is `sp`, so nothing is pinned to a physical
 * `dp` that would clip when the user enlarges text. The scale mirrors `--text-*` in
 * globals.css (11 / 12 / 13 / 14 / 18 / 22 / 28).
 */
val OakTypography: Typography = Typography().let { base ->
    base.copy(
        displaySmall = base.displaySmall.copy(fontSize = 28.sp),
        headlineMedium = base.headlineMedium.copy(fontSize = 22.sp),
        headlineSmall = base.headlineSmall.copy(fontSize = 18.sp),
        titleLarge = base.titleLarge.copy(fontSize = 18.sp),
        titleMedium = base.titleMedium.copy(fontSize = 16.sp),
        titleSmall = base.titleSmall.copy(fontSize = 14.sp),
        bodyLarge = base.bodyLarge.copy(fontSize = 16.sp),
        bodyMedium = base.bodyMedium.copy(fontSize = 14.sp),
        bodySmall = base.bodySmall.copy(fontSize = 13.sp),
        labelLarge = base.labelLarge.copy(fontSize = 14.sp),
        labelMedium = base.labelMedium.copy(fontSize = 12.sp),
        labelSmall = base.labelSmall.copy(fontSize = 11.sp),
    )
}

// ---------------------------------------------------------------------------
// Motion tokens + reduce-motion gate
// ---------------------------------------------------------------------------

/**
 * The shared animation vocabulary. Two springs cover almost everything — [snappy]
 * for direct-manipulation feedback (presses, focus, toggles) and [smooth] for
 * content settling in (bubbles, cards, list reflow). Callers gate every use behind
 * [rememberReduceMotion]; with reduce-motion on, movement collapses to an instant
 * change or an opacity crossfade. These tokens are the *what*; the *whether* stays
 * the calling view's decision.
 */
object OakMotion {
    /** Direct-feedback spring — fast, lightly damped. */
    val snappy: AnimationSpec<Float> =
        spring(dampingRatio = 0.8f, stiffness = Spring.StiffnessMedium)

    /** Content-settling spring — slower, well damped. */
    val smooth: AnimationSpec<Float> =
        spring(dampingRatio = 0.85f, stiffness = Spring.StiffnessMediumLow)

    /** Entrance/exit fade duration (ms) when motion is allowed. */
    const val FADE_MILLIS = 200

    /** Per-item cascade offset (ms) for staggered batch entrances. */
    const val STAGGER_STEP_MILLIS = 40
}

/**
 * `true` when the user (or the OS, in battery-saver) has disabled animations —
 * signalled by `Settings.Global.ANIMATOR_DURATION_SCALE == 0`. Mirrors iOS's
 * `accessibilityReduceMotion`. Read once per composition; a live toggle during a
 * session is rare and does not need to recompose, so this is not observed.
 */
@Composable
fun rememberReduceMotion(): Boolean {
    val context = LocalContext.current
    return remember(context) {
        Settings.Global.getFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            1f,
        ) == 0f
    }
}

// ---------------------------------------------------------------------------
// Pokémon type colors (theme-stable; mirrors the 18 web type solids)
// ---------------------------------------------------------------------------

/**
 * The 18 Pokémon type brand colors + their Champions display order. Theme-stable
 * (the same solid in light and dark — the badge recipe, not the solid, adapts).
 * Pair every use with the type's text label; the color is never the sole signal.
 */
object OakType {
    /** The brand color for a type name (e.g. `"fire"`); unknown falls back to Normal. */
    fun color(name: String): Color = solids[name.trim().lowercase()] ?: solids.getValue("normal")

    /** Sort index for a type slug in Champions display order; unknown sorts last. */
    fun displayIndex(name: String): Int = displayRank[name.trim().lowercase()] ?: Int.MAX_VALUE

    private val solids: Map<String, Color> = mapOf(
        "normal" to Color(0xFFA8A77A),
        "fire" to Color(0xFFEE8130),
        "water" to Color(0xFF6390F0),
        "electric" to Color(0xFFF7D02C),
        "grass" to Color(0xFF7AC74C),
        "ice" to Color(0xFF96D9D6),
        "fighting" to Color(0xFFC22E28),
        "poison" to Color(0xFFA33EA1),
        "ground" to Color(0xFFE2BF65),
        "flying" to Color(0xFFA98FF3),
        "psychic" to Color(0xFFF95587),
        "bug" to Color(0xFFA6B91A),
        "rock" to Color(0xFFB6A136),
        "ghost" to Color(0xFF735797),
        "dragon" to Color(0xFF6F35FC),
        "dark" to Color(0xFF705746),
        "steel" to Color(0xFFB7B7CE),
        "fairy" to Color(0xFFD685AD),
    )

    /** Champions display order (mirrors web `TYPE_DISPLAY_ORDER` in schemas.ts). */
    val displayOrder: List<String> = listOf(
        "normal", "grass", "fire", "water", "electric", "bug", "flying", "rock",
        "poison", "ground", "ice", "fighting", "psychic", "ghost", "dragon", "dark",
        "steel", "fairy",
    )

    private val displayRank: Map<String, Int> =
        displayOrder.withIndex().associate { (index, name) -> name to index }
}
