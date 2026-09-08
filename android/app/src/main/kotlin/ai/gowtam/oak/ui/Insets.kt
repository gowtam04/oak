package ai.gowtam.oak.ui

import androidx.compose.ui.unit.Dp

/**
 * Bottom padding for tab content when a bottom nav bar and the IME share the
 * same edge: the IME **replaces** the nav reservation (it covers the bar), it
 * does not stack on top of it. Using `nav + ime` would leave a nav-sized gap
 * between the composer and the keyboard.
 */
fun imeAwareBottomPadding(nav: Dp, ime: Dp): Dp = maxOf(nav, ime)
