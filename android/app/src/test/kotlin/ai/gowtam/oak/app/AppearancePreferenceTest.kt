package ai.gowtam.oak.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppearancePreferenceTest {
    @Test
    fun fromStoredDefaultsToSystem() {
        assertEquals(AppearancePreference.System, AppearancePreference.fromStored(null))
        assertEquals(AppearancePreference.System, AppearancePreference.fromStored(""))
        assertEquals(AppearancePreference.System, AppearancePreference.fromStored("nope"))
    }

    @Test
    fun fromStoredRecognizesKnownValues() {
        assertEquals(AppearancePreference.System, AppearancePreference.fromStored("system"))
        assertEquals(AppearancePreference.Light, AppearancePreference.fromStored("light"))
        assertEquals(AppearancePreference.Dark, AppearancePreference.fromStored("dark"))
    }

    @Test
    fun resolveDarkMatrix() {
        assertTrue(AppearancePreference.System.resolveDark(true))
        assertFalse(AppearancePreference.System.resolveDark(false))
        assertFalse(AppearancePreference.Light.resolveDark(true))
        assertFalse(AppearancePreference.Light.resolveDark(false))
        assertTrue(AppearancePreference.Dark.resolveDark(true))
        assertTrue(AppearancePreference.Dark.resolveDark(false))
    }

    @Test
    fun inMemoryRoundTrip() {
        val store = InMemoryAppearanceStore()
        assertEquals(AppearancePreference.System, store.load())
        store.save(AppearancePreference.Dark)
        assertEquals(AppearancePreference.Dark, store.load())
    }

    @Test
    fun appStateLoadsStoredPreferenceAndWritesThrough() {
        val store = InMemoryAppearanceStore(AppearancePreference.Light)
        val state = AppState(store)
        assertEquals(AppearancePreference.Light, state.appearance.value)

        state.setAppearance(AppearancePreference.Dark)
        assertEquals(AppearancePreference.Dark, state.appearance.value)
        assertEquals(AppearancePreference.Dark, store.load())
    }

    @Test
    fun appStateDefaultsToSystem() {
        assertEquals(AppearancePreference.System, AppState().appearance.value)
    }
}
