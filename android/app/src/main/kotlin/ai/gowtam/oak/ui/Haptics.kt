package ai.gowtam.oak.ui

import android.os.Build
import android.view.HapticFeedbackConstants
import android.view.View
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalView

/**
 * Oak's single entry point for tactile feedback (`ui-and-experience.md` polish notes;
 * mirrors iOS `Haptics.swift`). Haptics are a **redundant** channel — every call site
 * that fires one (answer arrival, apply-patch, an error banner appearing) also has a
 * visible cue, so a device with haptics disabled loses nothing but the buzz.
 *
 * Android has no direct equivalent of iOS's notification-style generators before API
 * 30 ([HapticFeedbackConstants.CONFIRM]/[HapticFeedbackConstants.REJECT]), so older
 * devices fall back to the nearest general-purpose constant available since API 1.
 * [View.performHapticFeedback] already no-ops quietly when the system setting for
 * haptic feedback is off, so no separate enabled-check is needed here.
 */
@Immutable
class OakHaptics internal constructor(private val view: View) {
    /** A light confirmation tap — not currently wired to a call site, kept for parity
     * with iOS's `tap()` if a future polish pass wants it. */
    fun tap() = view.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK)

    /** A positive "it worked" pattern — an answer arrived, a patch was applied. */
    fun success() = view.performHapticFeedback(
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            HapticFeedbackConstants.CONFIRM
        } else {
            HapticFeedbackConstants.VIRTUAL_KEY
        },
    )

    /** A failure pattern — an error banner appeared. */
    fun error() = view.performHapticFeedback(
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            HapticFeedbackConstants.REJECT
        } else {
            HapticFeedbackConstants.LONG_PRESS
        },
    )
}

/** Remembers an [OakHaptics] bound to the current composition's host [View]. */
@Composable
fun rememberHaptics(): OakHaptics {
    val view = LocalView.current
    return remember(view) { OakHaptics(view) }
}
