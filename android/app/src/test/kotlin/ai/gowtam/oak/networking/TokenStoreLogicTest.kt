package ai.gowtam.oak.networking

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Exercises [TokenStore]'s set/get/clear logic and its never-throws contract
 * against the [TokenPreferences] seam — the JVM-testable path that doesn't
 * touch the real Android Keystore (that path is `androidTest`'s
 * `TokenStoreTest`, which needs a device/emulator). Mirrors iOS
 * `TokenStoreTests`' round-trip coverage.
 */
class TokenStoreLogicTest {

    @Test
    fun setThenTokenRoundTrips() {
        val store = TokenStore(InMemoryTokenPreferences())
        assertNull(store.token())
        store.set("abc123")
        assertEquals("abc123", store.token())
        store.clear()
        assertNull(store.token())
    }

    @Test
    fun setOverwritesExistingToken() {
        val store = TokenStore(InMemoryTokenPreferences())
        store.set("first")
        store.set("second")
        assertEquals("second", store.token())
    }

    @Test
    fun clearIsIdempotent() {
        val store = TokenStore(InMemoryTokenPreferences())
        store.clear()
        store.clear()
        assertNull(store.token())
    }

    /** A [TokenPreferences] whose every operation throws, standing in for a
     * genuinely unavailable secure store. */
    private class ThrowingTokenPreferences : TokenPreferences {
        override fun read(): String? = throw IllegalStateException("boom")
        override fun write(token: String) = throw IllegalStateException("boom")
        override fun erase() = throw IllegalStateException("boom")
    }

    @Test
    fun readFailureDegradesToNullInsteadOfThrowing() {
        val store = TokenStore(ThrowingTokenPreferences())
        // Must not throw — a failed read degrades to "no token" (guest), never a crash.
        assertNull(store.token())
    }

    @Test
    fun writeFailureNeverThrows() {
        val store = TokenStore(ThrowingTokenPreferences())
        // Must not throw even though the underlying write always fails.
        store.set("token")
    }

    @Test
    fun clearFailureNeverThrows() {
        val store = TokenStore(ThrowingTokenPreferences())
        // Must not throw even though the underlying erase always fails.
        store.clear()
    }
}
