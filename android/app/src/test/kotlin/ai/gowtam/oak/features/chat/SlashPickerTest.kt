package ai.gowtam.oak.features.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Slash-discovery P1 lockstep oracle — composer `/` picker model.
 *
 * Clones `web/src/lib/chat/slash-picker.test.ts`. Pure catalog/phase/filter/
 * insert/merge/bind — no I/O, no POST.
 *
 * Expected production API (`features/chat/SlashPicker.kt`):
 *
 *   slashPickerPhase(text):
 *     | SlashPickerPhase.Hidden
 *     | SlashPickerPhase.Commands(prefix, rows)
 *     | SlashPickerPhase.Args(command: "dex" | "team" | "usage", query)
 *     | SlashPickerPhase.Rest(command: "calc" | "new" | "help")
 *
 * Hidden unless the first non-space char is `/`. Empty / whitespace /
 * mid-sentence (`please /dex`) → Hidden (SD-AC-1.4). No space after first
 * token → Commands with that token as prefix (including `/`); `/` lists
 * all six (SD-AC-1.2). `/DEX` with no space stays command phase (SD-AC-3.1).
 * Unknown first token (`/foo`, `/newish`) → Hidden, not an empty command
 * list (SD-AC-1.3) — even though filterCommands("/newish") is [].
 * Space after dex|team|usage → Args. Space after /calc|/new|/help →
 * Rest (no name rows) (SD-BR-6).
 *
 * filterCommands: commandToken.lowercase().startsWith(prefix.lowercase()).
 * prefix "/" → all six. "/newish" → [].
 * insertCommand: trailing space iff catalog trailingSpace.
 * insertName("/dex", "Garchomp") === "/dex Garchomp" (single spaces).
 * mergeDexNameRows: Pokémon, then move, then ability, then item; within a
 * kind keep input order; dedupe kind+slug; cap `limit` default 8 (SD-BR-10,
 * SD-BR-17). Pass already-sliced-per-kind arrays; merge still caps.
 * bindStillValid(bind, composerText): parse is dex navigate AND slashArgs
 * equals bind.displayName (case-insensitive).
 *
 * DexBind / DexNameRow kinds: DexNameKind.Pokemon | Move | Ability | Item.
 *
 * Requirement refs: SD-BR-1, SD-BR-4, SD-BR-5, SD-BR-6, SD-BR-10, SD-BR-17,
 * SD-BR-18, SD-AC-1.2, SD-AC-1.3, SD-AC-1.4, SD-AC-3.1, SD-AC-4.3, SD-AC-7.1.
 */
class SlashPickerTest {

    @Test
    fun `lists exactly the six handled tokens with architecture hints and flags (SD-AC-1_2)`() {
        assertEquals(
            listOf(
                SlashCommandRow(
                    token = "/new",
                    hint = "New empty chat",
                    trailingSpace = false,
                    arg = "none",
                ),
                SlashCommandRow(
                    token = "/team",
                    hint = "Open Teams",
                    hintGuest = "Open Teams · sign in to save",
                    trailingSpace = true,
                    arg = "team",
                ),
                SlashCommandRow(
                    token = "/dex",
                    hint = "Open Dex",
                    trailingSpace = true,
                    arg = "dex",
                ),
                SlashCommandRow(
                    token = "/usage",
                    hint = "Open live usage",
                    trailingSpace = true,
                    arg = "usage",
                ),
                SlashCommandRow(
                    token = "/calc",
                    hint = "Open calculator",
                    trailingSpace = true,
                    arg = "none",
                ),
                SlashCommandRow(
                    token = "/help",
                    hint = "Show these commands",
                    trailingSpace = false,
                    arg = "none",
                ),
            ),
            SLASH_COMMANDS,
        )
        assertEquals(
            listOf("/new", "/team", "/dex", "/usage", "/calc", "/help"),
            SLASH_COMMANDS.map { it.token },
        )
    }

    @Test
    fun `exports the picker caption and arg-phase empty lines`() {
        assertEquals("Insert, then send", PICKER_CAPTION)
        assertEquals("No Dex matches", EMPTY_DEX)
        assertEquals("No usage matches", EMPTY_USAGE)
        assertEquals("No saved teams match", EMPTY_TEAMS)
        assertEquals("Sign in to save teams", EMPTY_TEAMS_GUEST)
    }

    @Test
    fun `keeps commands whose token starts with the prefix, case-insensitive (SD-AC-1_2, SD-BR-5)`() {
        assertEquals(
            listOf("/new", "/team", "/dex", "/usage", "/calc", "/help"),
            filterCommands("/").map { it.token },
        )
        assertEquals(SLASH_COMMANDS, filterCommands("/"))
        assertEquals(listOf("/dex"), filterCommands("/de").map { it.token })
        assertEquals(listOf("/dex"), filterCommands("/DEX").map { it.token })
        assertEquals(listOf("/new"), filterCommands("/n").map { it.token })
        assertEquals(listOf("/new"), filterCommands("/new").map { it.token })
        assertEquals(listOf("/help"), filterCommands("/h").map { it.token })
    }

    @Test
    fun `returns no rows for slash-newish — slash-new does not start with slash-newish (SD-AC-1_2, SD-AC-1_3)`() {
        assertEquals(emptyList<SlashCommandRow>(), filterCommands("/newish"))
        assertEquals(emptyList<SlashCommandRow>(), filterCommands("/foo"))
    }

    @Test
    fun `is hidden when the first non-space char is not slash (SD-AC-1_4)`() {
        assertEquals(SlashPickerPhase.Hidden, slashPickerPhase(""))
        assertEquals(SlashPickerPhase.Hidden, slashPickerPhase("   "))
        assertEquals(SlashPickerPhase.Hidden, slashPickerPhase("please /dex"))
        assertEquals(SlashPickerPhase.Hidden, slashPickerPhase("what about /team later"))
    }

    @Test
    fun `opens commands for a leading slash prefix and lists all six (SD-AC-1_2)`() {
        assertEquals(
            SlashPickerPhase.Commands(prefix = "/", rows = SLASH_COMMANDS),
            slashPickerPhase("/"),
        )
        assertEquals(
            SlashPickerPhase.Commands(prefix = "/", rows = SLASH_COMMANDS),
            slashPickerPhase("  /"),
        )
    }

    @Test
    fun `filters command rows by the first token while there is no space (SD-AC-1_2, SD-AC-3_1)`() {
        assertEquals(
            SlashPickerPhase.Commands(
                prefix = "/de",
                rows = SLASH_COMMANDS.filter { it.token == "/dex" },
            ),
            slashPickerPhase("/de"),
        )
        assertEquals(
            SlashPickerPhase.Commands(
                prefix = "/DEX",
                rows = SLASH_COMMANDS.filter { it.token == "/dex" },
            ),
            slashPickerPhase("/DEX"),
        )
        assertEquals(
            SlashPickerPhase.Commands(
                prefix = "/dex",
                rows = SLASH_COMMANDS.filter { it.token == "/dex" },
            ),
            slashPickerPhase("/dex"),
        )
        assertEquals(
            SlashPickerPhase.Commands(
                prefix = "/calc",
                rows = SLASH_COMMANDS.filter { it.token == "/calc" },
            ),
            slashPickerPhase("/calc"),
        )
        assertEquals(
            SlashPickerPhase.Commands(
                prefix = "/new",
                rows = SLASH_COMMANDS.filter { it.token == "/new" },
            ),
            slashPickerPhase("/new"),
        )
        assertEquals(
            SlashPickerPhase.Commands(
                prefix = "/help",
                rows = SLASH_COMMANDS.filter { it.token == "/help" },
            ),
            slashPickerPhase("/help"),
        )
    }

    @Test
    fun `hides for an unknown first token, not an empty command list (SD-AC-1_3)`() {
        assertEquals(SlashPickerPhase.Hidden, slashPickerPhase("/newish"))
        assertEquals(SlashPickerPhase.Hidden, slashPickerPhase("/foo"))
        assertEquals(emptyList<SlashCommandRow>(), filterCommands("/newish"))
    }

    @Test
    fun `enters args after a space on slash-dex slash-team slash-usage (SD-BR-6)`() {
        assertEquals(
            SlashPickerPhase.Args(command = "dex", query = ""),
            slashPickerPhase("/dex "),
        )
        assertEquals(
            SlashPickerPhase.Args(command = "dex", query = "gar"),
            slashPickerPhase("/dex gar"),
        )
        assertEquals(
            SlashPickerPhase.Args(command = "dex", query = "gar"),
            slashPickerPhase("  /dex gar"),
        )
        assertEquals(
            SlashPickerPhase.Args(command = "dex", query = "Garchomp"),
            slashPickerPhase("/DEX Garchomp"),
        )
        assertEquals(
            SlashPickerPhase.Args(command = "team", query = ""),
            slashPickerPhase("/team "),
        )
        assertEquals(
            SlashPickerPhase.Args(command = "team", query = "Rain Offense"),
            slashPickerPhase("/team Rain Offense"),
        )
        assertEquals(
            SlashPickerPhase.Args(command = "usage", query = ""),
            slashPickerPhase("/usage "),
        )
        assertEquals(
            SlashPickerPhase.Args(command = "usage", query = "garchomp"),
            slashPickerPhase("/usage garchomp"),
        )
    }

    @Test
    fun `enters rest after a space on slash-calc slash-new slash-help — no name rows (SD-BR-6)`() {
        assertEquals(SlashPickerPhase.Rest(command = "calc"), slashPickerPhase("/calc "))
        assertEquals(SlashPickerPhase.Rest(command = "calc"), slashPickerPhase("/calc foo vs bar"))
        assertEquals(SlashPickerPhase.Rest(command = "new"), slashPickerPhase("/new "))
        assertEquals(SlashPickerPhase.Rest(command = "new"), slashPickerPhase("/new rain team"))
        assertEquals(SlashPickerPhase.Rest(command = "help"), slashPickerPhase("/help "))
        assertEquals(SlashPickerPhase.Rest(command = "help"), slashPickerPhase("/help extra words"))
        val calcRest = slashPickerPhase("/calc foo")
        assertTrue(calcRest is SlashPickerPhase.Rest)
        assertFalse(calcRest is SlashPickerPhase.Commands)
        assertFalse(calcRest is SlashPickerPhase.Args)
    }

    @Test
    fun `appends a trailing space iff the catalog trailingSpace flag is true (SD-AC-2_1, SD-AC-2_2)`() {
        assertEquals("/dex ", insertCommand("/dex"))
        assertEquals("/team ", insertCommand("/team"))
        assertEquals("/usage ", insertCommand("/usage"))
        assertEquals("/calc ", insertCommand("/calc"))
        assertEquals("/new", insertCommand("/new"))
        assertEquals("/help", insertCommand("/help"))
    }

    @Test
    fun `joins command and display name with a single space and no required trailing space (SD-AC-2_3)`() {
        assertEquals("/dex Garchomp", insertName("/dex", "Garchomp"))
        assertEquals("/usage Garchomp", insertName("/usage", "Garchomp"))
        assertEquals("/team Rain Offense", insertName("/team", "Rain Offense"))
    }

    @Test
    fun `orders Pokémon, then move, then ability, then item — keeps within-kind input order (SD-BR-17)`() {
        val item = DexNameRow(
            kind = DexNameKind.Item,
            slug = "metronome",
            displayName = "Metronome",
        )
        val ability = DexNameRow(
            kind = DexNameKind.Ability,
            slug = "rough-skin",
            displayName = "Rough Skin",
        )
        val move = DexNameRow(
            kind = DexNameKind.Move,
            slug = "earthquake",
            displayName = "Earthquake",
        )
        val zamazenta = DexNameRow(
            kind = DexNameKind.Pokemon,
            slug = "zamazenta",
            displayName = "Zamazenta",
        )
        val garchomp = DexNameRow(
            kind = DexNameKind.Pokemon,
            slug = "garchomp",
            displayName = "Garchomp",
            spriteUrl = "https://example.com/garchomp.png",
        )

        assertEquals(
            listOf(zamazenta, garchomp, move, ability, item),
            mergeDexNameRows(
                listOf(
                    DexKindMatches(kind = DexNameKind.Item, matches = listOf(item)),
                    DexKindMatches(kind = DexNameKind.Ability, matches = listOf(ability)),
                    DexKindMatches(kind = DexNameKind.Move, matches = listOf(move)),
                    DexKindMatches(
                        kind = DexNameKind.Pokemon,
                        matches = listOf(zamazenta, garchomp),
                    ),
                ),
            ),
        )
    }

    @Test
    fun `dedupes by kind+slug, keeping the first occurrence`() {
        val first = DexNameRow(
            kind = DexNameKind.Pokemon,
            slug = "garchomp",
            displayName = "Garchomp",
        )
        val duplicate = DexNameRow(
            kind = DexNameKind.Pokemon,
            slug = "garchomp",
            displayName = "GARCHOMP",
        )
        val metronomeMove = DexNameRow(
            kind = DexNameKind.Move,
            slug = "metronome",
            displayName = "Metronome",
        )
        val metronomeItem = DexNameRow(
            kind = DexNameKind.Item,
            slug = "metronome",
            displayName = "Metronome",
        )

        assertEquals(
            listOf(first, metronomeMove, metronomeItem),
            mergeDexNameRows(
                listOf(
                    DexKindMatches(
                        kind = DexNameKind.Pokemon,
                        matches = listOf(first, duplicate),
                    ),
                    DexKindMatches(kind = DexNameKind.Move, matches = listOf(metronomeMove)),
                    DexKindMatches(kind = DexNameKind.Item, matches = listOf(metronomeItem)),
                ),
            ),
        )
    }

    @Test
    fun `caps at limit default 8, preserving merge order (SD-BR-10)`() {
        val pokemon = (0 until 9).map { i ->
            DexNameRow(
                kind = DexNameKind.Pokemon,
                slug = "p$i",
                displayName = "P$i",
            )
        }

        val capped = mergeDexNameRows(
            listOf(DexKindMatches(kind = DexNameKind.Pokemon, matches = pokemon)),
        )
        assertEquals(8, capped.size)
        assertEquals(
            listOf("p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7"),
            capped.map { it.slug },
        )
    }

    @Test
    fun `still caps after already-sliced-per-kind arrays (SD-BR-10)`() {
        fun sliced(kind: DexNameKind) = (0 until 8).map { i ->
            DexNameRow(
                kind = kind,
                slug = "${kind.name.lowercase()}-$i",
                displayName = "${kind.name.lowercase()} $i",
            )
        }

        val merged = mergeDexNameRows(
            listOf(
                DexKindMatches(kind = DexNameKind.Pokemon, matches = sliced(DexNameKind.Pokemon)),
                DexKindMatches(kind = DexNameKind.Move, matches = sliced(DexNameKind.Move)),
                DexKindMatches(kind = DexNameKind.Ability, matches = sliced(DexNameKind.Ability)),
                DexKindMatches(kind = DexNameKind.Item, matches = sliced(DexNameKind.Item)),
            ),
        )

        assertEquals(8, merged.size)
        assertTrue(merged.all { it.kind == DexNameKind.Pokemon })
        assertEquals(
            listOf(
                "pokemon-0",
                "pokemon-1",
                "pokemon-2",
                "pokemon-3",
                "pokemon-4",
                "pokemon-5",
                "pokemon-6",
                "pokemon-7",
            ),
            merged.map { it.slug },
        )
    }

    @Test
    fun `bindStillValid is true when parse is dex navigate and slashArgs equals displayName (SD-BR-17)`() {
        val garchomp = DexBind(
            kind = DexNameKind.Pokemon,
            slug = "garchomp",
            displayName = "Garchomp",
        )
        val metronomeMove = DexBind(
            kind = DexNameKind.Move,
            slug = "metronome",
            displayName = "Metronome",
        )

        assertTrue(bindStillValid(garchomp, "/dex Garchomp"))
        assertTrue(bindStillValid(garchomp, "/DEX garchomp"))
        assertTrue(bindStillValid(garchomp, "  /dex GARCHOMP"))
        assertTrue(bindStillValid(metronomeMove, "/dex Metronome"))
    }

    @Test
    fun `bindStillValid is false when the name is edited, the composer is not dex, or the command changes (SD-BR-17)`() {
        val garchomp = DexBind(
            kind = DexNameKind.Pokemon,
            slug = "garchomp",
            displayName = "Garchomp",
        )

        assertFalse(bindStillValid(garchomp, "/dex Garchom"))
        assertFalse(bindStillValid(garchomp, "/dex GarchompX"))
        assertFalse(bindStillValid(garchomp, "/dex"))
        assertFalse(bindStillValid(garchomp, "/team Garchomp"))
        assertFalse(bindStillValid(garchomp, "/usage Garchomp"))
        assertFalse(bindStillValid(garchomp, "/calc Garchomp"))
        assertFalse(bindStillValid(garchomp, "/new"))
        assertFalse(bindStillValid(garchomp, "/dexish Garchomp"))
        assertFalse(bindStillValid(garchomp, "please /dex Garchomp"))
    }
}
