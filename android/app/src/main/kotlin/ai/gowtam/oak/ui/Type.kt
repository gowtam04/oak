package ai.gowtam.oak.ui

import ai.gowtam.oak.R
import androidx.compose.material3.Typography
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * Oak's brand typefaces (mirrors the web design system's Space Grotesk / Inter /
 * JetBrains Mono trio in `web/src/app/globals.css`). The static TTFs live under
 * `res/font/` (OFL, license files bundled in `assets/fonts-licenses/`).
 *
 * "Instrument chrome, precise data": Space Grotesk (geometric, engraved) carries
 * display voice — the wordmark, screen titles, markdown headings, entity names; Inter
 * carries all prose/rows/buttons/chips; JetBrains Mono is the *instrument* face —
 * engraved caps labels, dex numbers, stat/damage numerals, code, the tool trail.
 *
 * Every role still sizes in `sp`, so the whole ramp scales with the user's system
 * font-size setting.
 */

/** Display face — the wordmark, screen/section titles, markdown headings, entity names. */
val SpaceGroteskFamily = FontFamily(
    Font(R.font.space_grotesk_medium, FontWeight.Medium),
    Font(R.font.space_grotesk_semibold, FontWeight.SemiBold),
    Font(R.font.space_grotesk_bold, FontWeight.Bold),
)

/** Body face — prose, rows, buttons, chips, the answer lead. */
val InterFamily = FontFamily(
    Font(R.font.inter_regular, FontWeight.Normal),
    Font(R.font.inter_medium, FontWeight.Medium),
    Font(R.font.inter_semibold, FontWeight.SemiBold),
    Font(R.font.inter_bold, FontWeight.Bold),
)

/** Instrument face — engraved labels, dex/stat/damage numerals, code, tool trail. */
val JetBrainsMonoFamily = FontFamily(
    Font(R.font.jetbrains_mono_medium, FontWeight.Medium),
    Font(R.font.jetbrains_mono_semibold, FontWeight.SemiBold),
)

/**
 * Oak's type ramp, keyed to the web `--text-*` scale (11 / 12 / 13 / 14 / 18 / 22 / 28)
 * and the role table in the theme-translation spec (§3.1). Roles fall into three voices:
 *
 * - **Space Grotesk (display):** `displaySmall` (wordmark/hero), `headlineSmall` /
 *   `titleLarge` (screen + section titles), and `headlineMedium` (the *answer lead* —
 *   the Instrument redesign makes the lead a display moment, not body prose).
 *   Rendered at SemiBold; display roles ≥18sp carry a tightened `-0.02em` tracking.
 * - **Inter (body):** the rest of the body/label roles carry prose (400),
 *   rows/secondary (600), and controls.
 * - **JetBrains Mono (instrument):** `labelSmall` is the engraved instrument label —
 *   11sp SemiBold, tracked; numerals are applied per call-site via [JetBrainsMonoFamily].
 */
private val displayTracking = (-0.02).em

val OakTypography: Typography = Typography().let { base ->
    base.copy(
        // Space Grotesk — display voice
        displaySmall = base.displaySmall.copy(
            fontFamily = SpaceGroteskFamily, fontWeight = FontWeight.SemiBold, fontSize = 28.sp,
            letterSpacing = displayTracking,
        ),
        headlineSmall = base.headlineSmall.copy(
            fontFamily = SpaceGroteskFamily, fontWeight = FontWeight.SemiBold, fontSize = 18.sp,
            letterSpacing = displayTracking,
        ),
        titleLarge = base.titleLarge.copy(
            fontFamily = SpaceGroteskFamily, fontWeight = FontWeight.SemiBold, fontSize = 18.sp,
            letterSpacing = displayTracking,
        ),
        // Space Grotesk — the answer lead is now a display moment
        headlineMedium = base.headlineMedium.copy(
            fontFamily = SpaceGroteskFamily, fontWeight = FontWeight.SemiBold, fontSize = 22.sp,
            letterSpacing = displayTracking,
        ),
        // Inter — body voice
        titleMedium = base.titleMedium.copy(
            fontFamily = InterFamily, fontWeight = FontWeight.SemiBold, fontSize = 16.sp,
        ),
        titleSmall = base.titleSmall.copy(
            fontFamily = InterFamily, fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
        ),
        bodyLarge = base.bodyLarge.copy(
            fontFamily = InterFamily, fontWeight = FontWeight.Normal, fontSize = 16.sp,
        ),
        bodyMedium = base.bodyMedium.copy(
            fontFamily = InterFamily, fontWeight = FontWeight.Normal, fontSize = 14.sp,
        ),
        bodySmall = base.bodySmall.copy(
            fontFamily = InterFamily, fontWeight = FontWeight.Normal, fontSize = 13.sp,
        ),
        labelLarge = base.labelLarge.copy(
            fontFamily = InterFamily, fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
        ),
        labelMedium = base.labelMedium.copy(
            fontFamily = InterFamily, fontWeight = FontWeight.SemiBold, fontSize = 12.sp,
        ),
        // JetBrains Mono — the engraved instrument label
        labelSmall = base.labelSmall.copy(
            fontFamily = JetBrainsMonoFamily, fontWeight = FontWeight.SemiBold,
            fontSize = 11.sp, letterSpacing = 0.88.sp,
        ),
    )
}
