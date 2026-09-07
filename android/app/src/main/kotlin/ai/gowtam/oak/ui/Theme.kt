package ai.gowtam.oak.ui

import android.provider.Settings
import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
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
 * Colors are sourced from Enamel & Paper (`docs/design/enamel-paper.md`) and
 * re-expressed natively, mirroring the iOS `Theme` (`ios/OakApp/UI/Theme.swift`).
 * Material's [ColorScheme] carries the surface/text/primary ramp so components get
 * Material contrast + dark-mode behavior for free; the *extended* Oak tokens that
 * Material has no slot for (the accent hover/active variants, sunflower, azure, the
 * four semantic colors, the muted/faint text steps, `--on-red`) ride a companion
 * [OakColors] over [LocalOakColors].
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
    /** Text/icon on a solid enamel fill (`--on-red`). White in both themes. */
    val onRed: Color,
    val sunflower: Color,
    val sunflowerSoft: Color,
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
    /** Modal/overlay scrim — umber in light, black in dark. */
    val scrim: Color,
)

/** Light-mode extended tokens (Enamel & Paper `--*` ramp). */
val OakLightColors = OakColors(
    accent = Color(0xFFEE5A5A),
    accentHover = Color(0xFFE04545),
    accentActive = Color(0xFFC93B3B),
    accentSoft = Color(0xFFFCEBEB),
    onRed = Color(0xFFFFFFFF),
    sunflower = Color(0xFFF5A524),
    sunflowerSoft = Color(0xFFFDF1DC),
    azure = Color(0xFF3AA0E3),
    azureSoft = Color(0xFFE6F2FB),
    success = Color(0xFF2FB573),
    successSoft = Color(0xFFE3F6EC),
    warning = Color(0xFFF08C00),
    warningSoft = Color(0xFFFDEFD9),
    danger = Color(0xFFE0394A),
    dangerSoft = Color(0xFFFCE8EA),
    info = Color(0xFF3AA0E3),
    surfaceRaised = Color(0xFFFFFFFF),
    surfaceSunken = Color(0xFFF7F1EB),
    border = Color(0xFFE9E0D8),
    borderStrong = Color(0xFFD8CCC1),
    textStrong = Color(0xFF2A2521),
    text = Color(0xFF3D362F),
    textMuted = Color(0xFF6E625A),
    textFaint = Color(0xFF94867A),
    scrim = Color(0x734A352A),
)

/** Dark-mode extended tokens (Enamel & Paper `--*` ramp). */
val OakDarkColors = OakColors(
    accent = Color(0xFFC44545),
    accentHover = Color(0xFFD45656),
    accentActive = Color(0xFFB33A3A),
    accentSoft = Color(0xFF3A1E1E),
    onRed = Color(0xFFFFFFFF),
    sunflower = Color(0xFFF8B73E),
    sunflowerSoft = Color(0xFF3A2E14),
    azure = Color(0xFF5BB4EF),
    azureSoft = Color(0xFF16263A),
    success = Color(0xFF46C98A),
    successSoft = Color(0xFF10301F),
    warning = Color(0xFFFBA53B),
    warningSoft = Color(0xFF3A2A0F),
    danger = Color(0xFFFF5C6B),
    dangerSoft = Color(0xFF3A1518),
    info = Color(0xFF5BB4EF),
    surfaceRaised = Color(0xFF332D29),
    surfaceSunken = Color(0xFF1C1916),
    border = Color(0xFF3A332E),
    borderStrong = Color(0xFF4E453F),
    textStrong = Color(0xFFF5EFE9),
    text = Color(0xFFE4DAD0),
    textMuted = Color(0xFFB7A99C),
    textFaint = Color(0xFF8A7D72),
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
    surfaceContainerLow = Color(0xFFFFFFFF),
    surfaceContainer = Color(0xFFFBF7F4),
    surfaceContainerHigh = Color(0xFFF7F1EB),
    surfaceContainerHighest = Color(0xFFE9E0D8),
    outline = Color(0xFFD8CCC1),
    outlineVariant = Color(0xFFE9E0D8),
    error = Color(0xFFE0394A),
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFFCE8EA),
    onErrorContainer = Color(0xFF2A2521),
)

private val OakDarkColorScheme: ColorScheme = darkColorScheme(
    primary = Color(0xFFC44545),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFF3A1E1E),
    onPrimaryContainer = Color(0xFFF5EFE9),
    secondary = Color(0xFF5BB4EF),
    onSecondary = Color(0xFF161311),
    secondaryContainer = Color(0xFF16263A),
    onSecondaryContainer = Color(0xFFF5EFE9),
    tertiary = Color(0xFFF8B73E),
    onTertiary = Color(0xFF161311),
    tertiaryContainer = Color(0xFF3A2E14),
    onTertiaryContainer = Color(0xFFF5EFE9),
    background = Color(0xFF161311),
    onBackground = Color(0xFFE4DAD0),
    surface = Color(0xFF231F1C),
    onSurface = Color(0xFFE4DAD0),
    surfaceVariant = Color(0xFF1C1916),
    onSurfaceVariant = Color(0xFFB7A99C),
    surfaceContainerLowest = Color(0xFF1C1916),
    surfaceContainerLow = Color(0xFF161311),
    surfaceContainer = Color(0xFF231F1C),
    surfaceContainerHigh = Color(0xFF332D29),
    surfaceContainerHighest = Color(0xFF3A332E),
    outline = Color(0xFF4E453F),
    outlineVariant = Color(0xFF3A332E),
    error = Color(0xFFFF5C6B),
    onError = Color(0xFF161311),
    errorContainer = Color(0xFF3A1518),
    onErrorContainer = Color(0xFFF5EFE9),
)

// ---------------------------------------------------------------------------
// Corner radii + spacing tokens (brand favors generous rounding)
// ---------------------------------------------------------------------------

/** Corner radii, mirroring Enamel & Paper `--radius-*`. */
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
 * The shared animation vocabulary. [snappy] and [smooth] cover almost everything —
 * [snappy] for direct-manipulation feedback (presses, focus, toggles) and [smooth]
 * for content settling in (bubbles, cards, list reflow). Both are Enamel tweens
 * on [fastEasing] (cubic-bezier(0.2, 0.8, 0.2, 1)). [spring] is reserved for
 * chips / send pop / sprite hover. Callers gate every use behind
 * [rememberReduceMotion]; with reduce-motion on, movement collapses to an instant
 * change or an opacity crossfade. These tokens are the *what*; the *whether* stays
 * the calling view's decision.
 */
object OakMotion {
    /**
     * Enamel `--motion-fast` / `--motion-base` easing. Declared first:
     * [snappy]/[smooth] below capture it at initialization.
     */
    val fastEasing = CubicBezierEasing(0.2f, 0.8f, 0.2f, 1f)

    /** Fast tween duration (ms) — hover, press, lid pills, focus. */
    const val FAST_MILLIS = 140

    /** Base tween duration (ms) — content settling. */
    const val BASE_MILLIS = 220

    /** Entrance tween duration (ms) — maps to [BASE_MILLIS]. */
    const val ENTER_MILLIS = BASE_MILLIS

    /** Overshoot easing — chips, send pop, sprite hover only. */
    val springEasing = CubicBezierEasing(0.34f, 1.56f, 0.64f, 1f)

    /** Spring tween duration (ms) — chips / send / sprite hover only. */
    const val SPRING_MILLIS = 260

    /** Direct-feedback tween — hover/press (`--motion-fast`). */
    val snappy: AnimationSpec<Float> =
        tween(durationMillis = FAST_MILLIS, easing = fastEasing)

    /** Content-settling tween — same ease, [BASE_MILLIS]. */
    val smooth: AnimationSpec<Float> =
        tween(durationMillis = BASE_MILLIS, easing = fastEasing)

    /** Overshoot tween — chips / send pop / sprite hover only (`--motion-spring`). */
    val spring: AnimationSpec<Float> =
        tween(durationMillis = SPRING_MILLIS, easing = springEasing)

    /** Entrance/exit fade duration (ms) when motion is allowed. */
    const val FADE_MILLIS = 200

    /** Per-item cascade offset (ms) for staggered batch entrances (answer-card sections,
     * the instrument ticker's tool rows). */
    const val STAGGER_STEP_MILLIS = 60
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
     * Specimen-plate **type-light** from one primary type and an optional secondary
     * (soul.md "Type-light rules" — replaces the old plate-wash-percentage table). The
     * plate fill itself goes essentially neutral ([surface]); the type reads instead
     * as a saturated glow radiating from the sprite well ([wellGlow]/[wellGlowSecondary])
     * plus a solid leading-edge light ([edge]/[edgeSecondary]) the caller renders as a
     * thin strip along the plate's leading edge. Call [plateWashForTypes] when deriving
     * from an answer's subject list (handles multi-subject + mechanics).
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
        val wellMix = if (dark) 0.28f else 0.16f
        return PlateWash(
            fill = surface,
            fillSecondary = null,
            border = border,
            wellFill = lerp(surface, primarySolid, wellMix),
            wellBorder = lerp(border, primarySolid, if (dark) 0.28f else 0.22f),
            wellGlow = primarySolid.copy(alpha = if (dark) 0.40f else 0.30f),
            wellGlowSecondary = secondarySolid?.copy(alpha = if (dark) 0.28f else 0.20f),
            edge = primarySolid,
            edgeSecondary = secondarySolid,
            isMechanics = false,
            isMulti = false,
        )
    }

    /**
     * Derives a [PlateWash] from zero-or-more subjects' type lists:
     * - empty → mechanics ink plate (sunken inset, strong border, no type light)
     * - multiple subjects → neutral plate + one faint multi edge (don't fight dual glows)
     * - one subject → primary/secondary type-light
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
            return PlateWash(
                fill = surface,
                fillSecondary = null,
                border = border,
                wellFill = surfaceSunken,
                wellBorder = border,
                wellGlow = accent?.copy(alpha = if (dark) 0.18f else 0.12f),
                wellGlowSecondary = null,
                edge = accent?.copy(alpha = if (dark) 0.55f else 0.45f) ?: Color.Transparent,
                edgeSecondary = null,
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
            edge = Color.Transparent,
            edgeSecondary = null,
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
 * Produced by [OakType.plateWash] / [OakType.plateWashForTypes] per soul.md's
 * "Type-light rules" — the plate chrome ([fill]/[border]) stays essentially neutral;
 * the type reads through [wellGlow] (the light source, in the sprite well) and
 * [edge] (a solid leading-edge light strip the caller renders along the plate's
 * start edge).
 */
@Immutable
data class PlateWash(
    /** Plate fill — neutral (surfaceRaised) for typed/multi plates, sunken for mechanics. */
    val fill: Color,
    /** Deprecated blend slot, kept for the mechanics vertical-gradient callers; null for typed/multi. */
    val fillSecondary: Color?,
    /** Plate chrome border — neutral ([OakColors.border]/[OakColors.borderStrong]); the type never tints the frame. */
    val border: Color,
    /** Sprite-well base fill (still type-mixed — the well is the light source). */
    val wellFill: Color,
    /** Sprite-well border. */
    val wellBorder: Color,
    /** Saturated type glow for the sprite well / plate corner (null when mechanics). */
    val wellGlow: Color?,
    /** Optional secondary glow ring for dual-type wells. */
    val wellGlowSecondary: Color?,
    /** Solid leading-edge light in the primary type color; [Color.Transparent] for mechanics. */
    val edge: Color,
    /** Optional secondary edge segment for a dual-type leading-edge light. */
    val edgeSecondary: Color?,
    /** True when the answer has no subjects — ink / mechanics plate. */
    val isMechanics: Boolean,
    /** True when multiple subjects share one plate (neutral plate + one faint multi edge). */
    val isMulti: Boolean,
)
