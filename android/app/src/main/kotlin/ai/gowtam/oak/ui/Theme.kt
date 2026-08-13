package ai.gowtam.oak.ui

import android.provider.Settings
import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp

/**
 * Oak's brand expression over Android / Material 3.
 *
 * Colors are sourced from the web design system (`web/src/app/globals.css`) and
 * re-expressed natively, mirroring the iOS `Theme` (`ios/OakApp/UI/Theme.swift`).
 * Material's [ColorScheme] carries the surface/text/primary ramp so components get
 * Material contrast + dark-mode behavior for free; the *extended* Oak tokens that
 * Material has no slot for (the accent hover/active variants, azure, the four
 * semantic colors, the muted/faint text steps) ride a companion [OakColors] over
 * [LocalOakColors].
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
            shapes = OakShapes,
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
    val azure: Color,
    val azureSoft: Color,
    val success: Color,
    val successSoft: Color,
    val warning: Color,
    val warningSoft: Color,
    val danger: Color,
    val dangerSoft: Color,
    val info: Color,
    val surfaceRaised: Color,
    val surfaceSunken: Color,
    val border: Color,
    val borderStrong: Color,
    val textStrong: Color,
    val text: Color,
    val textMuted: Color,
    val textFaint: Color,
    /** Modal/overlay scrim — warm-tinted, unlike Material's neutral black. */
    val scrim: Color,
)

/** Light-mode extended tokens (`:root` in globals.css). */
val OakLightColors = OakColors(
    accent = Color(0xFFE3350D),
    accentHover = Color(0xFFC92E0B),
    accentActive = Color(0xFFB02A0A),
    accentSoft = Color(0xFFFBE9E4),
    azure = Color(0xFF2B7DD1),
    azureSoft = Color(0xFFE5F0FA),
    success = Color(0xFF1F9D61),
    successSoft = Color(0xFFE4F4EC),
    warning = Color(0xFFE08700),
    warningSoft = Color(0xFFFBF0DC),
    danger = Color(0xFFD6303F),
    dangerSoft = Color(0xFFFAE7E9),
    info = Color(0xFF2B7DD1),
    surfaceRaised = Color(0xFFFFFFFF),
    surfaceSunken = Color(0xFFE3E6E8),
    border = Color(0xFFD3D7DA),
    borderStrong = Color(0xFFB9BEC3),
    textStrong = Color(0xFF131517),
    text = Color(0xFF24282B),
    textMuted = Color(0xFF5F656C),
    textFaint = Color(0xFF8A9096),
    scrim = Color(0x66131517),
)

/** Dark-mode extended tokens (`[data-theme="dark"]` in globals.css). */
val OakDarkColors = OakColors(
    accent = Color(0xFFFF4A22),
    accentHover = Color(0xFFFF5F3C),
    accentActive = Color(0xFFE8431E),
    accentSoft = Color(0xFF33170F),
    azure = Color(0xFF55A0E8),
    azureSoft = Color(0xFF142433),
    success = Color(0xFF34C27F),
    successSoft = Color(0xFF0E2B1D),
    warning = Color(0xFFF0A030),
    warningSoft = Color(0xFF33260F),
    danger = Color(0xFFF04A58),
    dangerSoft = Color(0xFF331417),
    info = Color(0xFF55A0E8),
    surfaceRaised = Color(0xFF1D2124),
    surfaceSunken = Color(0xFF0B0D0E),
    border = Color(0xFF2A2E32),
    borderStrong = Color(0xFF3A3F44),
    textStrong = Color(0xFFF2F4F5),
    text = Color(0xFFDDE1E3),
    textMuted = Color(0xFF9BA1A7),
    textFaint = Color(0xFF6E747A),
    scrim = Color(0x99000000),
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
    primary = Color(0xFFE3350D),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFFBE9E4),
    onPrimaryContainer = Color(0xFF131517),
    secondary = Color(0xFF2B7DD1),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFE5F0FA),
    onSecondaryContainer = Color(0xFF131517),
    tertiary = Color(0xFFE08700),
    onTertiary = Color(0xFF131517),
    tertiaryContainer = Color(0xFFFBF0DC),
    onTertiaryContainer = Color(0xFF131517),
    background = Color(0xFFEEF0F1),
    onBackground = Color(0xFF24282B),
    surface = Color(0xFFF9FAFA),
    onSurface = Color(0xFF24282B),
    surfaceVariant = Color(0xFFE3E6E8),
    onSurfaceVariant = Color(0xFF5F656C),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFF9FAFA),
    surfaceContainer = Color(0xFFEEF0F1),
    surfaceContainerHigh = Color(0xFFE3E6E8),
    surfaceContainerHighest = Color(0xFFD3D7DA),
    outline = Color(0xFFB9BEC3),
    outlineVariant = Color(0xFFD3D7DA),
    error = Color(0xFFD6303F),
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFFAE7E9),
    onErrorContainer = Color(0xFF131517),
)

private val OakDarkColorScheme: ColorScheme = darkColorScheme(
    primary = Color(0xFFFF4A22),
    onPrimary = Color(0xFF2B0D05),
    primaryContainer = Color(0xFF33170F),
    onPrimaryContainer = Color(0xFFF2F4F5),
    secondary = Color(0xFF55A0E8),
    onSecondary = Color(0xFF0C1620),
    secondaryContainer = Color(0xFF142433),
    onSecondaryContainer = Color(0xFFF2F4F5),
    tertiary = Color(0xFFF0A030),
    onTertiary = Color(0xFF2B1D05),
    tertiaryContainer = Color(0xFF33260F),
    onTertiaryContainer = Color(0xFFF2F4F5),
    background = Color(0xFF101214),
    onBackground = Color(0xFFDDE1E3),
    surface = Color(0xFF16191B),
    onSurface = Color(0xFFDDE1E3),
    surfaceVariant = Color(0xFF0B0D0E),
    onSurfaceVariant = Color(0xFF9BA1A7),
    surfaceContainerLowest = Color(0xFF0B0D0E),
    surfaceContainerLow = Color(0xFF141719),
    surfaceContainer = Color(0xFF16191B),
    surfaceContainerHigh = Color(0xFF1D2124),
    surfaceContainerHighest = Color(0xFF23272B),
    outline = Color(0xFF3A3F44),
    outlineVariant = Color(0xFF2A2E32),
    error = Color(0xFFF04A58),
    onError = Color(0xFF2E0D10),
    errorContainer = Color(0xFF331417),
    onErrorContainer = Color(0xFFF2F4F5),
)

// ---------------------------------------------------------------------------
// Corner radii + spacing tokens (brand favors generous rounding)
// ---------------------------------------------------------------------------

/** Corner radii, mirroring `--radius-*` in globals.css. */
object OakRadius {
    val sm = 5.dp
    val md = 9.dp
    val lg = 12.dp
    val xl = 16.dp
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

/**
 * Material's [Shapes] mapped onto [OakRadius] so every un-parameterized Material
 * component (menus, dialogs, sheets, chips, buttons that don't pass an explicit
 * `shape=`) inherits Oak's rounding instead of Material's default corner family.
 * `extraLarge` collapses to 24.dp (Oak has no larger step) so bottom sheets round
 * at the brand's top radius.
 */
val OakShapes: Shapes = Shapes(
    extraSmall = RoundedCornerShape(OakRadius.sm),
    small = RoundedCornerShape(OakRadius.md),
    medium = RoundedCornerShape(OakRadius.lg),
    large = RoundedCornerShape(OakRadius.xl),
    extraLarge = RoundedCornerShape(OakRadius.xl),
)

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

    /**
     * Instrument-precise easing (Phase 2 wires call sites onto this + [FAST_MILLIS] /
     * [BASE_MILLIS]) — a fast-out, near-linear-in curve for tween-driven transitions
     * that need a deliberate, mechanical feel rather than a spring's overshoot.
     */
    val fastEasing = CubicBezierEasing(0.2f, 0f, 0f, 1f)

    /** Fast tween duration (ms) — direct-feedback transitions (Phase 2). */
    const val FAST_MILLIS = 120

    /** Base tween duration (ms) — standard content transitions (Phase 2). */
    const val BASE_MILLIS = 180

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
 *
 * Also owns specimen-plate wash helpers ([plateWash] / [plateWashForTypes]) per
 * `docs/design/soul.md` — type atmosphere for answer shells and sprite wells.
 */
object OakType {
    /** The brand color for a type name (e.g. `"fire"`); unknown falls back to Normal. */
    fun color(name: String): Color = solids[name.trim().lowercase()] ?: solids.getValue("normal")

    /**
     * The fixed ink (text/icon) color for a full-chroma type solid — WHITE for the
     * five dark solids ([darkInkTypes]) and DARK ([INK_DARK]) for the other thirteen,
     * so a solid-fill [TypeBadge] always meets contrast without per-type tuning.
     * Unknown type names fall back to the dark ink (matches [color]'s Normal fallback).
     */
    fun ink(name: String): Color =
        if (name.trim().lowercase() in darkInkTypes) Color.White else INK_DARK

    /** Sort index for a type slug in Champions display order; unknown sorts last. */
    fun displayIndex(name: String): Int = displayRank[name.trim().lowercase()] ?: Int.MAX_VALUE

    /**
     * Specimen-plate atmosphere from one primary type and an optional secondary
     * (soul.md "Plate wash rules"). Light mixes ~8–14% type into [surface]; dark
     * ~18–28% so the wash still reads. Call [plateWashForTypes] when deriving from
     * an answer's subject list (handles multi-subject + mechanics).
     */
    fun plateWash(
        primary: String?,
        secondary: String? = null,
        surface: Color,
        surfaceSunken: Color,
        border: Color,
        borderStrong: Color,
        dark: Boolean,
    ): PlateWash {
        val primaryName = primary?.trim()?.takeIf { it.isNotEmpty() }
        if (primaryName == null) {
            return mechanicsPlate(surfaceSunken, borderStrong)
        }
        val primarySolid = color(primaryName)
        val secondarySolid = secondary?.trim()?.takeIf { it.isNotEmpty() }?.let { color(it) }
        val primaryMix = if (dark) 0.22f else 0.11f
        val secondaryMix = if (dark) 0.18f else 0.08f
        val borderMix = if (dark) 0.32f else 0.28f
        val wellMix = if (dark) 0.28f else 0.16f
        val fill = lerp(surface, primarySolid, primaryMix)
        val fillSecondary = secondarySolid?.let { lerp(surface, it, secondaryMix) }
        return PlateWash(
            fill = fill,
            fillSecondary = fillSecondary,
            border = lerp(border, primarySolid, borderMix),
            wellFill = lerp(surface, primarySolid, wellMix),
            wellBorder = lerp(border, primarySolid, if (dark) 0.28f else 0.22f),
            wellGlow = primarySolid.copy(alpha = if (dark) 0.32f else 0.28f),
            wellGlowSecondary = secondarySolid?.copy(alpha = if (dark) 0.18f else 0.15f),
            isMechanics = false,
            isMulti = false,
        )
    }

    /**
     * Derives a [PlateWash] from zero-or-more subjects' type lists:
     * - empty → mechanics ink plate (sunken paper, strong border)
     * - multiple subjects → neutral-ish multi plate (light first-type accent only)
     * - one subject → primary/secondary type wash
     */
    fun plateWashForTypes(
        subjectTypes: List<List<String>>,
        surface: Color,
        surfaceSunken: Color,
        border: Color,
        borderStrong: Color,
        dark: Boolean,
    ): PlateWash {
        if (subjectTypes.isEmpty()) {
            return mechanicsPlate(surfaceSunken, borderStrong)
        }
        if (subjectTypes.size > 1) {
            val first = subjectTypes.firstOrNull()?.firstOrNull()
            val accent = first?.let { color(it) }
            val multiMix = if (dark) 0.12f else 0.05f
            return PlateWash(
                fill = if (accent != null) lerp(surface, accent, multiMix) else surface,
                fillSecondary = null,
                border = if (accent != null) lerp(border, accent, if (dark) 0.18f else 0.12f) else border,
                wellFill = surfaceSunken,
                wellBorder = border,
                wellGlow = accent?.copy(alpha = if (dark) 0.18f else 0.12f),
                wellGlowSecondary = null,
                isMechanics = false,
                isMulti = true,
            )
        }
        val types = subjectTypes.first()
        return plateWash(
            primary = types.getOrNull(0),
            secondary = types.getOrNull(1),
            surface = surface,
            surfaceSunken = surfaceSunken,
            border = border,
            borderStrong = borderStrong,
            dark = dark,
        )
    }

    private fun mechanicsPlate(surfaceSunken: Color, borderStrong: Color): PlateWash =
        PlateWash(
            fill = surfaceSunken,
            fillSecondary = null,
            border = borderStrong,
            wellFill = surfaceSunken,
            wellBorder = borderStrong,
            wellGlow = null,
            wellGlowSecondary = null,
            isMechanics = true,
            isMulti = false,
        )

    /** Dark ink color for [ink]'s 13-type majority (fallback included). */
    private val INK_DARK = Color(0xFF16181A)

    /** The five type solids dark/saturated enough to need white ink instead. */
    private val darkInkTypes: Set<String> =
        setOf("fighting", "poison", "ghost", "dragon", "dark")

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

/**
 * Colors for a type-reactive specimen plate (answer card shell + sprite well).
 * Produced by [OakType.plateWash] / [OakType.plateWashForTypes] per soul.md.
 */
@Immutable
data class PlateWash(
    /** Primary plate fill (type-mixed surface, or sunken for mechanics). */
    val fill: Color,
    /** Optional secondary fill for dual-type radial/linear blend. */
    val fillSecondary: Color?,
    /** Plate edge color (type-mixed border, or [OakColors.borderStrong] for mechanics). */
    val border: Color,
    /** Sprite-well base fill. */
    val wellFill: Color,
    /** Sprite-well border. */
    val wellBorder: Color,
    /** Soft type glow for the sprite well center (null when mechanics). */
    val wellGlow: Color?,
    /** Optional secondary glow ring for dual-type wells. */
    val wellGlowSecondary: Color?,
    /** True when the answer has no subjects — ink / mechanics plate. */
    val isMechanics: Boolean,
    /** True when multiple subjects share one plate (neutral multi accent). */
    val isMulti: Boolean,
)
