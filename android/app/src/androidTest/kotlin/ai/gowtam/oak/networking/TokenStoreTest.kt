package ai.gowtam.oak.networking

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

/**
 * Exercises [TokenStore] against the real Android Keystore-backed
 * `EncryptedSharedPreferences` (mirrors iOS `TokenStoreTests`, which runs
 * against the real Keychain rather than a fake). Each test uses a unique
 * prefs file name so it never collides with the production `session-token`
 * store, and the store used in each test is self-contained (no shared
 * fixture state). Covers the CRUD round-trip, overwrite, and idempotent
 * clear.
 *
 * Not exercised this phase (P2) — `:app:connectedDebugAndroidTest` needs a
 * booted emulator/device, which the CP-A integration checkpoint (after P6)
 * is the first point this suite actually runs; this file only needs to
 * *compile* for the P2 gate.
 */
@RunWith(AndroidJUnit4::class)
class TokenStoreTest {

    private fun freshStore(): TokenStore {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val prefsFileName = "test-secure-prefs-${UUID.randomUUID()}"
        return TokenStore(context, prefsFileName)
    }

    @Test
    fun setThenTokenRoundTrips() {
        val store = freshStore()

        assertNull(store.token())
        store.set("abc123")
        assertEquals("abc123", store.token())

        store.clear()
        assertNull(store.token())
    }

    @Test
    fun setOverwritesExistingToken() {
        val store = freshStore()

        store.set("first")
        store.set("second")
        assertEquals("second", store.token())

        store.clear()
    }

    @Test
    fun clearIsIdempotent() {
        val store = freshStore()

        // Clearing an absent item must not crash or error.
        store.clear()
        store.clear()
        assertNull(store.token())
    }

    @Test
    fun tokenSurvivesAcrossInstances() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val prefsFileName = "test-secure-prefs-${UUID.randomUUID()}"
        val writer = TokenStore(context, prefsFileName)
        writer.set("persisted-token")

        // A new instance over the same prefs file models a relaunch reading the Keystore.
        val reader = TokenStore(context, prefsFileName)
        assertEquals("persisted-token", reader.token())

        writer.clear()
        assertNull(reader.token())
    }
}
