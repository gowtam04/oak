package ai.gowtam.oak.features.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Phase 5/7 lockstep oracle — leading-token slash parse on send.
 *
 * Clones `web/src/lib/chat/slash-commands.test.ts`. The parser only classifies;
 * it does not POST `/api/chat`. No palette / shortcut coverage (web-only NAV).
 *
 * Expected production API (`features/chat/SlashCommands.kt`):
 *
 *   parseSlashCommand(text: String, hasUsagePage: Boolean = false): SlashCommand
 *     | SlashCommand.Navigate(target: New | Team | Dex | Usage)
 *     | SlashCommand.Calc(rest: String)
 *     | SlashCommand.Message
 *
 * `/calc` is a handled slash in this pack (CALC-AC-3.4 / ADR-4). [Calc.rest] is
 * the substring after `/calc`, trimmed. Empty rest → open overlay, current
 * scope. Non-empty rest is still [SlashCommand.Calc] (unresolved tokens are a
 * UI concern, CALC-AC-3.3). `/compare` stays a normal message (CMP-BR-3).
 *
 * Fails to compile until `SlashCommand` grows `Calc(rest)`.
 *
 * Android has **no** usage surface in this pack — [parseSlashCommand] must
 * default `hasUsagePage` to false, so `/usage` is an ordinary message
 * (SLASH-AC-1.4 / SLASH-AC-1.5). Cases that pass `hasUsagePage = true` lockstep
 * the parser with web; they are not the Android product default.
 *
 * Known leading tokens: `/new`, `/team`, `/dex`, `/calc`, and `/usage` only
 * when `hasUsagePage == true`. First whitespace-delimited token wins; args stay
 * on the navigate result (client routes `/team {name}` / `/dex {name}`).
 * Unknown slashes — including `/compare` and `/usage` when the client has no
 * usage page — are ordinary messages.
 *
 * Requirement refs: SLASH-US-1, SLASH-AC-1.1..1.6, SLASH-BR-1, SLASH-BR-2,
 * CALC-US-3, CALC-AC-3.1..3.4, CALC-BR-4. ADR-4, ADR-10.
 */
class SlashCommandsTest {

    /** Android product default — no usage page until a usage surface ships. */
    private val native = false

    /** Lockstep-only: web has `/meta`. Not the Android default. */
    private val web = true

    @Test
    fun `navigates slash-new to a new empty chat (SLASH-AC-1_1)`() {
        assertEquals(
            SlashCommand.Navigate(SlashCommand.Target.New),
            parseSlashCommand("/new", native),
        )
    }

    @Test
    fun `treats slash-new with args as navigate new (SLASH-AC-1_1, leading token)`() {
        assertEquals(
            SlashCommand.Navigate(SlashCommand.Target.New),
            parseSlashCommand("/new rain team", native),
        )
    }

    @Test
    fun `navigates slash-team and slash-team name (SLASH-AC-1_2)`() {
        assertEquals(
            SlashCommand.Navigate(SlashCommand.Target.Team),
            parseSlashCommand("/team", native),
        )
        assertEquals(
            SlashCommand.Navigate(SlashCommand.Target.Team),
            parseSlashCommand("/team Rain Offense", native),
        )
    }

    @Test
    fun `navigates slash-dex and slash-dex name (SLASH-AC-1_3)`() {
        assertEquals(
            SlashCommand.Navigate(SlashCommand.Target.Dex),
            parseSlashCommand("/dex", native),
        )
        assertEquals(
            SlashCommand.Navigate(SlashCommand.Target.Dex),
            parseSlashCommand("/dex garchomp", native),
        )
    }

    @Test
    fun `navigates slash-usage only when the client has a usage page (SLASH-AC-1_4)`() {
        assertEquals(
            SlashCommand.Navigate(SlashCommand.Target.Usage),
            parseSlashCommand("/usage", web),
        )
        assertEquals(
            SlashCommand.Navigate(SlashCommand.Target.Usage),
            parseSlashCommand("/usage ou", web),
        )
    }

    @Test
    fun `treats slash-usage as a normal message when hasUsagePage is false (SLASH-AC-1_4 _ SLASH-AC-1_5)`() {
        assertEquals(SlashCommand.Message, parseSlashCommand("/usage", native))
        assertEquals(SlashCommand.Message, parseSlashCommand("/usage ou", native))
    }

    @Test
    fun `Android default treats slash-usage as a message (hasUsagePage=false)`() {
        assertEquals(SlashCommand.Message, parseSlashCommand("/usage"))
        assertEquals(SlashCommand.Message, parseSlashCommand("/usage ou"))
    }

    @Test
    fun `treats bare slash-calc as handled calc with empty rest (CALC-AC-3_1)`() {
        assertEquals(SlashCommand.Calc(rest = ""), parseSlashCommand("/calc", web))
        assertEquals(SlashCommand.Calc(rest = ""), parseSlashCommand("/calc", native))
    }

    @Test
    fun `treats slash-calc with args as handled calc carrying trimmed rest (CALC-AC-3_2)`() {
        assertEquals(
            SlashCommand.Calc(rest = "garchomp earthquake vs farigiraf"),
            parseSlashCommand("/calc garchomp earthquake vs farigiraf", web),
        )
        assertEquals(
            SlashCommand.Calc(rest = "garchomp earthquake vs farigiraf"),
            parseSlashCommand("/calc garchomp earthquake vs farigiraf", native),
        )
        assertEquals(
            SlashCommand.Calc(rest = "garchomp earthquake vs gholdengo"),
            parseSlashCommand("/calc garchomp earthquake vs gholdengo", native),
        )
    }

    @Test
    fun `trims whitespace around slash-calc rest`() {
        assertEquals(
            SlashCommand.Calc(rest = "garchomp earthquake vs farigiraf"),
            parseSlashCommand("  /calc   garchomp earthquake vs farigiraf  ", native),
        )
        assertEquals(SlashCommand.Calc(rest = ""), parseSlashCommand("/calc   ", native))
        assertEquals(
            SlashCommand.Calc(rest = "garchomp earthquake"),
            parseSlashCommand("/calc\tgarchomp earthquake", native),
        )
    }

    @Test
    fun `treats handled slash-calc as not a chat turn (CALC-BR-4)`() {
        val result = parseSlashCommand("/calc garchomp earthquake vs farigiraf", native)
        assertEquals(SlashCommand.Calc(rest = "garchomp earthquake vs farigiraf"), result)
        assertFalse(result is SlashCommand.Message)
        assertFalse(result is SlashCommand.Navigate)
        assertTrue(result is SlashCommand.Calc)
        val fields = result::class.java.declaredFields.map { it.name }
        assertFalse("post" in fields)
    }

    @Test
    fun `treats unknown slashes including slash-compare as messages (SLASH-AC-1_5 _ SLASH-BR-1)`() {
        assertEquals(SlashCommand.Message, parseSlashCommand("/compare", native))
        assertEquals(SlashCommand.Message, parseSlashCommand("/compare garchomp dragonite", native))
        assertEquals(SlashCommand.Message, parseSlashCommand("/foo", native))
        assertEquals(SlashCommand.Message, parseSlashCommand("/teams", native))
        assertEquals(SlashCommand.Message, parseSlashCommand("/", native))
        assertEquals(SlashCommand.Message, parseSlashCommand("/newish", native))
        assertEquals(SlashCommand.Message, parseSlashCommand("/calcish", native))
    }

    @Test
    fun `treats a mid-sentence slash as a normal message (SLASH-AC-1_6)`() {
        assertEquals(SlashCommand.Message, parseSlashCommand("please open /new", native))
        assertEquals(SlashCommand.Message, parseSlashCommand("what about /team later", native))
        assertEquals(SlashCommand.Message, parseSlashCommand("see /dex garchomp", native))
        assertEquals(SlashCommand.Message, parseSlashCommand("check /usage", native))
        assertEquals(SlashCommand.Message, parseSlashCommand("please open /calc", native))
        assertEquals(SlashCommand.Message, parseSlashCommand("run /calc garchomp later", native))
    }

    @Test
    fun `treats text without a leading slash as a message (SLASH-AC-1_6 _ SLASH-BR-1)`() {
        assertEquals(SlashCommand.Message, parseSlashCommand("new", native))
        assertEquals(SlashCommand.Message, parseSlashCommand("team Rain Offense", native))
        assertEquals(SlashCommand.Message, parseSlashCommand("", native))
        assertEquals(SlashCommand.Message, parseSlashCommand("   ", native))
    }

    @Test
    fun `uses the first whitespace-delimited token, including after leading space (ADR-10)`() {
        assertEquals(
            SlashCommand.Navigate(SlashCommand.Target.New),
            parseSlashCommand("  /new", native),
        )
        assertEquals(
            SlashCommand.Navigate(SlashCommand.Target.Dex),
            parseSlashCommand("\t/dex garchomp", native),
        )
        assertEquals(
            SlashCommand.Navigate(SlashCommand.Target.New),
            parseSlashCommand("/new\tmore", native),
        )
    }

    @Test
    fun `classifies only — a handled slash is not a chat turn (SLASH-BR-2)`() {
        val result = parseSlashCommand("/new", native)
        assertEquals(SlashCommand.Navigate(SlashCommand.Target.New), result)
        assertFalse(result is SlashCommand.Message)
        assertTrue(result is SlashCommand.Navigate)
        val fields = result::class.java.declaredFields.map { it.name }
        assertFalse("post" in fields)
        assertFalse("message" in fields)
    }
}
