package ai.gowtam.oak.ui

import ai.gowtam.oak.R
import androidx.compose.material3.Typography
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Oak's brand typefaces (mirrors the web design system's Fredoka / Nunito Sans /
 * JetBrains Mono trio in `web/src/app/globals.css`). The static TTFs live under
 * `res/font/` (OFL, license files bundled in `assets/fonts-licenses/`).
 *
 * "Playful chrome, precise data": Fredoka (rounded, friendly) carries display
 * voice — the wordmark, screen titles, markdown headings, entity names; Nunito Sans
 * carries all prose/rows/buttons/chips; JetBrains Mono is the *instrument* face —
 * engraved caps labels, dex numbers, stat/damage numerals, code, the tool trail.
 *
 * Every role still sizes in `sp`, so the whole ramp scales with the user's system
 * font-size setting.
 */

/** Display face — the wordmark, screen/section titles, markdown headings, entity names. */
val FredokaFamily = FontFamily(
    Font(R.font.fredoka_medium, FontWeight.Medium),
    Font(R.font.fredoka_semibold, FontWeight.SemiBold),
)

/** Body face — prose, rows, buttons, chips, the answer lead (Bold). */
val NunitoSansFamily = FontFamily(
    Font(R.font.nunito_sans_regular, FontWeight.Normal),
    Font(R.font.nunito_sans_medium, FontWeight.Medium),
    Font(R.font.nunito_sans_semibold, FontWeight.SemiBold),
    Font(R.font.nunito_sans_bold, FontWeight.Bold),
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
 * - **Fredoka (display):** `displaySmall` (wordmark/hero), `headlineSmall` / `titleLarge`
 *   (screen + section titles). Rendered at SemiBold.
 * - **Nunito Sans (body):** `headlineMedium` is the *answer lead* (Bold 22); the rest of
 *   the body/label roles carry prose (400), rows/secondary (600), and controls.
 * - **JetBrains Mono (instrument):** `labelSmall` is the engraved instrument label —
 *   11sp SemiBold, tracked; numerals are applied per call-site via [JetBrainsMonoFamily].
 */
val OakTypography: Typography = Typography().let { base ->
    base.copy(
        // Fredoka — display voice
        displaySmall = base.displaySmall.copy(
            fontFamily = FredokaFamily, fontWeight = FontWeight.SemiBold, fontSize = 28.sp,
        ),
        headlineSmall = base.headlineSmall.copy(
            fontFamily = FredokaFamily, fontWeight = FontWeight.SemiBold, fontSize = 18.sp,
        ),
        titleLarge = base.titleLarge.copy(
            fontFamily = FredokaFamily, fontWeight = FontWeight.SemiBold, fontSize = 18.sp,
        ),
        // Nunito Sans — answer lead + body voice
        headlineMedium = base.headlineMedium.copy(
            fontFamily = NunitoSansFamily, fontWeight = FontWeight.Bold, fontSize = 22.sp,
        ),
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
        // JetBrains Mono — the engraved instrument label
        labelSmall = base.labelSmall.copy(
            fontFamily = JetBrainsMonoFamily, fontWeight = FontWeight.SemiBold,
            fontSize = 11.sp, letterSpacing = 0.88.sp,
        ),
    )
}
