package ai.gowtam.oak.features.usage

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Locale
import java.util.TimeZone

class UsageFormatTest {

    @Test
    fun formatsInTheGivenTimeZoneWithoutISOOrZ() {
        // 2023-11-14 22:13:20 UTC → 2:13 PM in America/Los_Angeles (PST).
        val formatted = formatUsageFetchedAt(
            1_700_000_000_000L,
            TimeZone.getTimeZone("America/Los_Angeles"),
            Locale.US,
        )
        assertFalse(formatted.contains("Z"))
        assertFalse(formatted.contains("T"))
        assertFalse(formatted.contains("2023-11-14"))
        assertFalse(formatted.contains("UTC"))
        assertTrue(formatted.contains("2023"))
        assertTrue(formatted.contains("Nov"))
        assertTrue(formatted.contains("2:13"))
    }

    @Test
    fun utcZoneStillOmitsTheZSuffix() {
        val formatted = formatUsageFetchedAt(
            1_700_000_000_000L,
            TimeZone.getTimeZone("UTC"),
            Locale.US,
        )
        assertFalse(formatted.contains("Z"))
        assertFalse(formatted.contains("2023-11-14"))
        assertTrue(formatted.contains("2023"))
    }

    @Test
    fun splitsEmDashAttributionIntoSourceAndLegal() {
        val parts = parseUsageAttribution(
            "championsbattledata.com — a community-maintained Pokémon Champions project (not affiliated with Nintendo / Game Freak / The Pokémon Company).",
        )
        assertEquals("championsbattledata.com", parts.source)
        assertTrue(parts.legal!!.contains("not affiliated"))
        assertTrue(parts.legal.contains("Nintendo"))
    }

    @Test
    fun domainOnlyAttributionHasNoLegalLine() {
        val parts = parseUsageAttribution("championsbattledata.com")
        assertEquals("championsbattledata.com", parts.source)
        assertNull(parts.legal)
    }
}
