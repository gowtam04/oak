package ai.gowtam.oak.features.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Slash-discovery P1 lockstep oracle — leading-token slash parse on send.
 *
 * Clones `web/src/lib/chat/slash-commands.test.ts`. The parser only classifies;
 * it does not POST `/api/chat`. No palette / shortcut coverage (web-only NAV).
 *
 * Expected production API (`features/chat/SlashCommands.kt`):
 *
 *   parseSlashCommand(text: String, hasUsagePage: Boolean = true): SlashCommand
 *     | SlashCommand.Navigate(target: New | Team | Dex | Usage)
 *     | SlashCommand.Calc(rest: String)
 *     | SlashCommand.Help
 *     | SlashCommand.Bare
 *     | SlashCommand.Message
 *
 *   slashArgs(text): remainder after the first token, trimmed; "" if none.
 *   (Web oracle name is `slashArg`; Android already exports `slashArgs`.)
 *
 *   DexBind(kind: DexNameKind, slug, displayName) — composer-local pick bind
 *   (web `slash-commands.ts`; bindStillValid lives in SlashPicker).
 *
 * Known leading tokens (case-insensitive exact match): `/new`, `/team`,
 * `/dex`, `/calc`, `/help`, and `/usage` only when `hasUsagePage == true`.
 * First whitespace-delimited token wins. Extra words stay off the
 * navigate/help result (clients read them via slashArgs). `/calc` rest is the
 * substring after the token, trimmed (empty rest is ok). After trim, text
 * `=== "/"` is `Bare` (SD-AC-7.1) — not a message. `/compare` stays an
 * ordinary message (CMP-BR-3). Unknown slashes (`/foo`, `/newish`) — and
 * `/usage` when the client has no usage page — are ordinary messages.
 * Production clients pass hasUsagePage true; WEB/NATIVE fixtures keep the gate.
 *
 * Android Usage is a Dex section (ADR-6) — [parseSlashCommand] defaults
 * `hasUsagePage` to true, so `/usage` navigates. Cases that pass
 * `hasUsagePage = false` keep the parser's gated path.
 *
 * Requirement refs: SD-BR-1, SD-BR-4, SD-AC-4.3, SD-AC-7.1; also Chat QoL
 * SLASH-AC-1.1..1.6, SLASH-BR-1, SLASH-BR-2, CALC-US-3, CALC-AC-3.1–3.4,
 * CALC-BR-4. Chat QoL ADR-10; slash-discovery ADR-1 (client classifier).
 */
class SlashCommandsTest {

    /** Android product default — Usage is a Dex section (ADR-6). */
    private val native = true

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
        assertEquals(SlashCommand.Message, parseSlashCommand("/usage", hasUsagePage = false))
        assertEquals(SlashCommand.Message, parseSlashCommand("/usage ou", hasUsagePage = false))
        assertEquals(SlashCommand.Message, parseSlashCommand("/USAGE", hasUsagePage = false))
    }

    @Test
    fun `Android default navigates slash-usage because Usage is a Dex section (ADR-6)`() {
        assertEquals(SlashCommand.Navigate(SlashCommand.Target.Usage), parseSlashCommand("/usage"))
        assertEquals(SlashCommand.Navigate(SlashCommand.Target.Usage), parseSlashCommand("/usage ou"))
        assertEquals(SlashCommand.Navigate(SlashCommand.Target.Usage), parseSlashCommand("/usage", native))
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
    fun `does not treat slash-calcish or a mid-sentence slash-calc as handled (CALC-AC-3_4)`() {
        assertEquals(SlashCommand.Message, parseSlashCommand("/calcish", web))
        assertEquals(SlashCommand.Message, parseSlashCommand("please /calc", web))
        assertEquals(SlashCommand.Message, parseSlashCommand("open /calc garchomp", web))
    }

    @Test
    fun `classifies slash-help as help; extra words are ignored (SD-AC-4_3, SD-BR-18)`() {
        assertEquals(SlashCommand.Help, parseSlashCommand("/help", web))
        assertEquals(SlashCommand.Help, parseSlashCommand("/help", native))
        assertEquals(SlashCommand.Help, parseSlashCommand("/help extra words", web))
        assertEquals(SlashCommand.Help, parseSlashCommand("  /help extra  ", web))
    }

    @Test
    fun `classifies a composer that trims to exactly slash as bare (SD-AC-7_1)`() {
        assertEquals(SlashCommand.Bare, parseSlashCommand("/", web))
        assertEquals(SlashCommand.Bare, parseSlashCommand("/", native))
        assertEquals(SlashCommand.Bare, parseSlashCommand(" / ", web))
        assertEquals(SlashCommand.Bare, parseSlashCommand("  /  ", web))
        assertEquals(SlashCommand.Bare, parseSlashCommand("\t/\t", web))
    }

    @Test
    fun `matches command tokens case-insensitively (SD-BR-4)`() {
        assertEquals(
            SlashCommand.Navigate(SlashCommand.Target.Dex),
            parseSlashCommand("/DEX", web),
        )
        assertEquals(
            SlashCommand.Navigate(SlashCommand.Target.Dex),
            parseSlashCommand("/Dex", web),
        )
        assertEquals(SlashCommand.Help, parseSlashCommand("/HELP", web))
        assertEquals(
            SlashCommand.Navigate(SlashCommand.Target.Usage),
            parseSlashCommand("/USAGE", web),
        )
        assertEquals(
            SlashCommand.Navigate(SlashCommand.Target.New),
            parseSlashCommand("/NEW", web),
        )
        assertEquals(
            SlashCommand.Navigate(SlashCommand.Target.Team),
            parseSlashCommand("/TEAM Rain", web),
        )
        assertEquals(
            SlashCommand.Calc(rest = "foo vs bar"),
            parseSlashCommand("/CALC foo vs bar", web),
        )
    }

    @Test
    fun `treats slash-newish as a message — token is not exactly slash-new (SD-BR-1)`() {
        assertEquals(SlashCommand.Message, parseSlashCommand("/newish", web))
        assertEquals(SlashCommand.Message, parseSlashCommand("/NEWISH", web))
    }

    @Test
    fun `treats unknown slashes including slash-compare as messages (SLASH-AC-1_5 _ SLASH-BR-1 _ SD-BR-1)`() {
        assertEquals(SlashCommand.Message, parseSlashCommand("/compare", native))
        assertEquals(SlashCommand.Message, parseSlashCommand("/compare garchomp dragonite", native))
        assertEquals(SlashCommand.Message, parseSlashCommand("/foo", native))
        assertEquals(SlashCommand.Message, parseSlashCommand("/teams", native))
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
    fun `uses the first whitespace-delimited token, including after leading space (ADR-10, SD-BR-1)`() {
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
    fun `classifies only — a handled slash is not a chat turn (SLASH-BR-2, CALC-BR-4, SD-AC-4_3, SD-AC-7_1)`() {
        val nav = parseSlashCommand("/new", native)
        assertEquals(SlashCommand.Navigate(SlashCommand.Target.New), nav)
        assertFalse(nav is SlashCommand.Message)
        assertTrue(nav is SlashCommand.Navigate)
        val navFields = nav::class.java.declaredFields.map { it.name }
        assertFalse("post" in navFields)
        assertFalse("message" in navFields)

        val calc = parseSlashCommand("/calc foo vs bar", native)
        assertEquals(SlashCommand.Calc(rest = "foo vs bar"), calc)
        assertFalse(calc is SlashCommand.Message)
        val calcFields = calc::class.java.declaredFields.map { it.name }
        assertFalse("post" in calcFields)

        val help = parseSlashCommand("/help extra words", native)
        assertEquals(SlashCommand.Help, help)
        assertFalse(help is SlashCommand.Message)
        val helpFields = help::class.java.declaredFields.map { it.name }
        assertFalse("post" in helpFields)
        assertFalse("message" in helpFields)

        val bare = parseSlashCommand("/", native)
        assertEquals(SlashCommand.Bare, bare)
        assertFalse(bare is SlashCommand.Message)
        val bareFields = bare::class.java.declaredFields.map { it.name }
        assertFalse("post" in bareFields)
        assertFalse("message" in bareFields)
    }

    @Test
    fun `slashArgs returns the trimmed remainder after the first token (SD-BR-1)`() {
        assertEquals("Garchomp", slashArgs("/dex Garchomp"))
        assertEquals("", slashArgs("/dex"))
        assertEquals("extra", slashArgs("  /help extra "))
        assertEquals("foo vs bar", slashArgs("/calc foo vs bar"))
        assertEquals("rain team", slashArgs("/new rain team"))
        assertEquals("garchomp", slashArgs("\t/dex garchomp"))
        assertEquals("", slashArgs("/"))
        assertEquals("", slashArgs(""))
    }
}
