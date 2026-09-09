package ai.gowtam.oak.ui

import ai.gowtam.oak.R
import androidx.compose.material3.Typography
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * Oak's brand typefaces (Enamel & Paper: Fredoka + Nunito Sans + JetBrains Mono;
 * `docs/design/enamel-paper.md` Typefaces / Native packaging). The static TTFs live
 * under `res/font/` (OFL, license files bundled in `assets/fonts-licenses/`).
 *
 * Display (wordmark, empty-landing title, section chrome) is Fredoka. Body / UI is
 * Nunito Sans. JetBrains Mono appears only in fact tables, damage breakdowns, OTP
 * digits, and source keys — applied per call-site via [JetBrainsMonoFamily].
 *
 * Every role still sizes in `sp`, so the whole ramp scales with the user's system
 * font-size setting.
 */

/** Display — wordmark, empty-landing title, disclosure / auth titles. */
val FredokaFamily = FontFamily(
    Font(R.font.fredoka_medium, FontWeight.Medium),
    Font(R.font.fredoka_semibold, FontWeight.SemiBold),
)

/** Body / UI — prose, composer, chips, buttons, chrome labels. */
val NunitoSansFamily = FontFamily(
    Font(R.font.nunito_sans_regular, FontWeight.Normal),
    Font(R.font.nunito_sans_medium, FontWeight.Medium),
    Font(R.font.nunito_sans_semibold, FontWeight.SemiBold),
    Font(R.font.nunito_sans_bold, FontWeight.Bold),
)

/** Mono — fact tables, damage, OTP, dex numbers. */
val JetBrainsMonoFamily = FontFamily(
    Font(R.font.jetbrains_mono_medium, FontWeight.Medium),
    Font(R.font.jetbrains_mono_semibold, FontWeight.SemiBold),
)

/**
 * Oak's type ramp, keyed to the web `--text-*` scale (11 / 12 / 13 / 14 / 18 / 22 / 28)
 * and Enamel & Paper typefaces:
 *
 * - **Fredoka (display):** `displaySmall` (wordmark/hero), `headlineSmall` /
 *   `titleLarge` (screen + section titles), `headlineMedium` (answer lead).
 *   Display roles ≥18sp keep a slight `0.01em` tracking.
 * - **Nunito Sans (body):** the rest of the body/label roles (prose, rows, controls).
 * - **labelSmall** is Nunito Sans Medium — Enamel reserves mono for fact tables
 *   only; numerals still opt in per call-site via [JetBrainsMonoFamily].
 */
private val displayTracking = 0.01.em

val OakTypography: Typography = Typography().let { base ->
    base.copy(
        // Fredoka — display voice
        displaySmall = base.displaySmall.copy(
            fontFamily = FredokaFamily, fontWeight = FontWeight.SemiBold, fontSize = 28.sp,
            letterSpacing = displayTracking,
        ),
        headlineSmall = base.headlineSmall.copy(
            fontFamily = FredokaFamily, fontWeight = FontWeight.SemiBold, fontSize = 18.sp,
            letterSpacing = displayTracking,
        ),
        titleLarge = base.titleLarge.copy(
            fontFamily = FredokaFamily, fontWeight = FontWeight.SemiBold, fontSize = 18.sp,
            letterSpacing = displayTracking,
        ),
        // Fredoka — the answer lead
        headlineMedium = base.headlineMedium.copy(
            fontFamily = FredokaFamily, fontWeight = FontWeight.SemiBold, fontSize = 22.sp,
            letterSpacing = displayTracking,
        ),
        // Nunito Sans — body voice
        titleMedium = base.titleMedium.copy(
            fontFamily = NunitoSansFamily, fontWeight = FontWeight.SemiBold, fontSize = 16.sp,
        ),
        titleSmall = base.titleSmall.copy(
            fontFamily = NunitoSansFamily, fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
        ),
        bodyLarge = base.bodyLarge.copy(
            fontFamily = NunitoSansFamily, fontWeight = FontWeight.Normal, fontSize = 16.sp,
        ),
        bodyMedium = base.bodyMedium.copy(
            fontFamily = NunitoSansFamily, fontWeight = FontWeight.Normal, fontSize = 14.sp,
        ),
        bodySmall = base.bodySmall.copy(
            fontFamily = NunitoSansFamily, fontWeight = FontWeight.Normal, fontSize = 13.sp,
        ),
        labelLarge = base.labelLarge.copy(
            fontFamily = NunitoSansFamily, fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
        ),
        labelMedium = base.labelMedium.copy(
            fontFamily = NunitoSansFamily, fontWeight = FontWeight.SemiBold, fontSize = 12.sp,
        ),
        // Nunito Sans Medium — chrome/meta labels; mono is call-site only
        labelSmall = base.labelSmall.copy(
            fontFamily = NunitoSansFamily, fontWeight = FontWeight.Medium,
            fontSize = 11.sp, letterSpacing = 0.88.sp,
        ),
    )
}

/**
 * Enamel type-badge mix (`docs/design/enamel-paper.md` Key Decision 9).
 * Approximates CSS `color-mix(in srgb, type N%, surface|ink)`:
 * - fill: type 16% into [surface] (dark: 26%)
 * - ink: type 72% into [textStrong] (dark: type 45% into white)
 * - border: type 30% into transparent
 *
 * [TypeBadge] is the only consumer — do not hand-roll a second mix.
 */
fun OakType.badgeFill(type: String, surface: Color, dark: Boolean): Color =
    lerp(surface, color(type), if (dark) 0.26f else 0.16f)

fun OakType.badgeInk(type: String, textStrong: Color, dark: Boolean): Color =
    if (dark) lerp(Color.White, color(type), 0.45f) else lerp(textStrong, color(type), 0.72f)

fun OakType.badgeBorder(type: String): Color = color(type).copy(alpha = 0.30f)
