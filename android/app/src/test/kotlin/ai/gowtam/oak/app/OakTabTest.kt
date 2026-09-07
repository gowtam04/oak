package ai.gowtam.oak.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Champions-first P8 — Android Usage is a **Dex section** (ADR-6), not a sixth
 * bottom tab. The bar stays Chat / Teams / Dex / Calc / Settings. Do **not**
 * add Voice as a tab or mic session (CF-UI-BR-5).
 *
 * Pins the existing `OakTab` enum in [OakApp] via reflection so this file
 * compiles today; adding `Usage` or `Voice` as a sixth/seventh tab fails it.
 *
 * Requirement refs: CF-UI-AC-6.4, CF-UI-BR-5, CF-OPS-BR-4, ADR-6.
 */
class OakTabTest {

    @Test
    fun bottomBarStaysFiveTabsAndDoesNotGainUsageOrVoice() {
        val clazz = Class.forName("ai.gowtam.oak.app.OakTab")
        assertTrue(clazz.isEnum)
        val constants = clazz.enumConstants ?: emptyArray()
        assertEquals("ADR-6: do not add a sixth bottom tab", 5, constants.size)

        val names = constants.map { (it as Enum<*>).name }
        assertEquals(listOf("Chat", "Teams", "Dex", "Calculator", "Settings"), names)
        assertFalse("Usage must live in Dex, not the tab bar", "Usage" in names)
        assertFalse("CF-UI-BR-5: do not add a Voice tab", "Voice" in names)

        val getLabel = clazz.getMethod("getLabel")
        val labels = constants.map { getLabel.invoke(it) as String }
        assertEquals(listOf("Chat", "Teams", "Dex", "Calc", "Settings"), labels)
        assertTrue(labels.none { it.equals("Usage", ignoreCase = true) })
        assertTrue(labels.none { it.equals("Voice", ignoreCase = true) })
    }
}
