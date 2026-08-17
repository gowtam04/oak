package ai.gowtam.oak.ui

import ai.gowtam.oak.R
import androidx.compose.material3.Typography
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * Oak's brand typefaces (Signal: Figtree + IBM Plex Mono; `docs/design/signal.md`
 * §3.2). The static TTFs live under `res/font/` (OFL, license files bundled in
 * `assets/fonts-licenses/`).
 *
 * One sans, one mono. Figtree carries display, lead, prose, rows, buttons, and
 * chrome labels. IBM Plex Mono appears only in fact tables, damage breakdowns,
 * and source keys — applied per call-site via [PlexMonoFamily] (exported as
 * [JetBrainsMonoFamily] this phase so existing sites compile).
 *
 * Every role still sizes in `sp`, so the whole ramp scales with the user's system
 * font-size setting.
 */

/** Signal sans — wordmark, titles, lead, body, chips, chrome labels. */
val FigtreeFamily = FontFamily(
    Font(R.font.figtree_regular, FontWeight.Normal),
    Font(R.font.figtree_medium, FontWeight.Medium),
    Font(R.font.figtree_semibold, FontWeight.SemiBold),
)

/** Signal mono — fact tables, damage, source keys. */
val PlexMonoFamily = FontFamily(
    Font(R.font.ibm_plex_mono_regular, FontWeight.Normal),
    Font(R.font.ibm_plex_mono_medium, FontWeight.Medium),
)

/** Alias — Figtree this phase so existing display call-sites compile. */
val SpaceGroteskFamily = FigtreeFamily

/** Alias — Figtree this phase so existing body call-sites compile. */
val InterFamily = FigtreeFamily

/** Alias — Plex this phase so existing table/damage call-sites compile. */
val JetBrainsMonoFamily = PlexMonoFamily

/**
 * Oak's type ramp, keyed to the web `--text-*` scale (11 / 12 / 13 / 14 / 18 / 22 / 28)
 * and Signal §3.2. Roles fall into two voices:
 *
 * - **Figtree (sans):** `displaySmall` (wordmark/hero), `headlineSmall` /
 *   `titleLarge` (screen + section titles), `headlineMedium` (answer lead),
 *   and the rest of the body/label roles (prose, rows, controls). Display
 *   roles ≥18sp keep a tightened `-0.02em` tracking.
 * - **labelSmall** is Figtree Medium — Signal reserves mono for fact tables
 *   only; numerals still opt in per call-site via [JetBrainsMonoFamily].
 */
private val displayTracking = (-0.02).em

val OakTypography: Typography = Typography().let { base ->
    base.copy(
        // Figtree — display voice
        displaySmall = base.displaySmall.copy(
            fontFamily = FigtreeFamily, fontWeight = FontWeight.SemiBold, fontSize = 28.sp,
            letterSpacing = displayTracking,
        ),
        headlineSmall = base.headlineSmall.copy(
            fontFamily = FigtreeFamily, fontWeight = FontWeight.SemiBold, fontSize = 18.sp,
            letterSpacing = displayTracking,
        ),
        titleLarge = base.titleLarge.copy(
            fontFamily = FigtreeFamily, fontWeight = FontWeight.SemiBold, fontSize = 18.sp,
            letterSpacing = displayTracking,
        ),
        // Figtree — the answer lead
        headlineMedium = base.headlineMedium.copy(
            fontFamily = FigtreeFamily, fontWeight = FontWeight.SemiBold, fontSize = 22.sp,
            letterSpacing = displayTracking,
        ),
        // Figtree — body voice
        titleMedium = base.titleMedium.copy(
            fontFamily = FigtreeFamily, fontWeight = FontWeight.SemiBold, fontSize = 16.sp,
        ),
        titleSmall = base.titleSmall.copy(
            fontFamily = FigtreeFamily, fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
        ),
        bodyLarge = base.bodyLarge.copy(
            fontFamily = FigtreeFamily, fontWeight = FontWeight.Normal, fontSize = 16.sp,
        ),
        bodyMedium = base.bodyMedium.copy(
            fontFamily = FigtreeFamily, fontWeight = FontWeight.Normal, fontSize = 14.sp,
        ),
        bodySmall = base.bodySmall.copy(
            fontFamily = FigtreeFamily, fontWeight = FontWeight.Normal, fontSize = 13.sp,
        ),
        labelLarge = base.labelLarge.copy(
            fontFamily = FigtreeFamily, fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
        ),
        labelMedium = base.labelMedium.copy(
            fontFamily = FigtreeFamily, fontWeight = FontWeight.SemiBold, fontSize = 12.sp,
        ),
        // Figtree Medium — chrome/meta labels; mono is call-site only
        labelSmall = base.labelSmall.copy(
            fontFamily = FigtreeFamily, fontWeight = FontWeight.Medium,
            fontSize = 11.sp, letterSpacing = 0.88.sp,
        ),
    )
}
