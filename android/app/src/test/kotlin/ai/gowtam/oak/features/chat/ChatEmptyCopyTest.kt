package ai.gowtam.oak.features.chat

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Champions-first P8 — empty-desk copy is a Champions coach, not “any Pokémon
 * question” (CF-UI-AC-3.1, CF-UI-BR-1).
 *
 * Fails to compile until P8 adds `features/chat/ChatEmptyCopy.kt`:
 *
 *   object ChatEmptyCopy {
 *     val headline: String
 *     val supporting: String
 *   }
 *
 * Web's plate: headline “What do you want to know?”; supporting
 * “Teams, calcs, and live usage for Pokémon Champions. Oak will show its work.”
 */
class ChatEmptyCopyTest {

    @Test
    fun emptyCopyIsChampionsOrientedAndDoesNotMentionOtherGames() {
        val blob = "${ChatEmptyCopy.headline} ${ChatEmptyCopy.supporting}"
        assertTrue(blob.contains("Champions", ignoreCase = true))
        assertTrue(Regex("team|calc|usage|coach", RegexOption.IGNORE_CASE).containsMatchIn(blob))
        assertFalse(blob.contains("locations", ignoreCase = true))
        assertFalse(blob.contains("every generation", ignoreCase = true))
        assertFalse(blob.contains("Mystery Dungeon", ignoreCase = true))
        assertFalse(blob.contains("National Dex", ignoreCase = true))
        assertFalse(blob.contains("Smogon", ignoreCase = true))
    }
}
