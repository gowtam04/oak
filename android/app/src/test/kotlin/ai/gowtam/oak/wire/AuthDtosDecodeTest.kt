package ai.gowtam.oak.wire

import kotlinx.serialization.decodeFromString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Decode coverage for the already-camelCase `/api/auth` endpoint envelopes. */
class AuthDtosDecodeTest {

    @Test
    fun authVerifyDecodesTokenAndExpiry() {
        val response = OakJson.decodeFromString<AuthVerifyResponse>(Fixtures.string("auth_verify.json"))
        assertTrue(response.ok)
        assertEquals("trainer@example.com", response.email)
        assertFalse(response.created)
        assertEquals(1722192000000L, response.expiresAt)
    }

    @Test
    fun meDecodesSignedInWithEmail() {
        val me = OakJson.decodeFromString<MeResponse>(Fixtures.string("me.json"))
        assertTrue(me.signedIn)
        assertEquals("trainer@example.com", me.email)
    }

    @Test
    fun meGuestDecodesWithNoEmail() {
        val me = OakJson.decodeFromString<MeResponse>(Fixtures.string("me_guest.json"))
        assertFalse(me.signedIn)
        assertNull(me.email)
    }

    @Test
    fun apiErrorDecodesWithoutAStatusField() {
        val error = OakJson.decodeFromString<ApiErrorBody>(Fixtures.string("api_error.json"))
        assertEquals("rate_limited", error.code)
        assertNull(error.status)
    }
}
