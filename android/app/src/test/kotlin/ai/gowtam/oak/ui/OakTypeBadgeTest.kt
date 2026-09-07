package ai.gowtam.oak.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import org.junit.Assert.assertEquals
import org.junit.Test

/** Pins the Enamel 16/72/30 type-badge mix (Key Decision 9). */
class OakTypeBadgeTest {

    @Test
    fun `light fill is type 16 percent into surface`() {
        val surface = Color.White
        val fire = OakType.color("fire")
        assertEquals(lerp(surface, fire, 0.16f), OakType.badgeFill("fire", surface, dark = false))
    }

    @Test
    fun `dark fill is type 26 percent into surface`() {
        val surface = Color(0xFF231F1C)
        val water = OakType.color("water")
        assertEquals(lerp(surface, water, 0.26f), OakType.badgeFill("water", surface, dark = true))
    }

    @Test
    fun `light ink is type 72 percent into textStrong`() {
        val textStrong = Color(0xFF2A2521)
        val grass = OakType.color("grass")
        assertEquals(lerp(textStrong, grass, 0.72f), OakType.badgeInk("grass", textStrong, dark = false))
    }

    @Test
    fun `dark ink is type 45 percent into white`() {
        val dragon = OakType.color("dragon")
        assertEquals(lerp(Color.White, dragon, 0.45f), OakType.badgeInk("dragon", Color.White, dark = true))
    }

    @Test
    fun `light palette is not dark and dark palette is`() {
        assertEquals(false, OakLightColors.isDark)
        assertEquals(true, OakDarkColors.isDark)
    }

    @Test
    fun `border is type at 30 percent alpha`() {
        val electric = OakType.color("electric")
        assertEquals(electric.copy(alpha = 0.30f), OakType.badgeBorder("electric"))
    }
}
