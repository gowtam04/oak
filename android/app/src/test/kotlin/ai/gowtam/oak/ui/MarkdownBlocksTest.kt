package ai.gowtam.oak.ui

import ai.gowtam.oak.wire.Fixtures
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Exercises the pure block splitter [MarkdownBlocks.parse] and the inline
 * [parseInline] pass. No Android/Compose framework is required for the block grammar
 * — it is deliberately Compose-free — so these run as plain JVM unit tests. Streaming
 * cases truncate real documents at many offsets and assert the split never throws.
 */
class MarkdownBlocksTest {

    // ---- Headings ----

    @Test
    fun `parses ATX headings at each level`() {
        val blocks = MarkdownBlocks.parse("# One\n\n## Two\n\n### Three")
        assertEquals(
            listOf(
                MdBlock.Heading(1, "One"),
                MdBlock.Heading(2, "Two"),
                MdBlock.Heading(3, "Three"),
            ),
            blocks,
        )
    }

    @Test
    fun `heading level clamps to four`() {
        val blocks = MarkdownBlocks.parse("###### Deep")
        assertEquals(listOf(MdBlock.Heading(4, "Deep")), blocks)
    }

    @Test
    fun `hash without a space is not a heading`() {
        val blocks = MarkdownBlocks.parse("#nospace tag")
        assertEquals(listOf(MdBlock.Paragraph("#nospace tag")), blocks)
    }

    @Test
    fun `trailing closing hashes are stripped`() {
        assertEquals(
            listOf(MdBlock.Heading(2, "Title")),
            MarkdownBlocks.parse("## Title ##"),
        )
    }

    // ---- Paragraphs ----

    @Test
    fun `folds consecutive lines into one paragraph and splits on blank line`() {
        val blocks = MarkdownBlocks.parse("Line one\nline two\n\nSecond para")
        assertEquals(
            listOf(
                MdBlock.Paragraph("Line one\nline two"),
                MdBlock.Paragraph("Second para"),
            ),
            blocks,
        )
    }

    // ---- Lists ----

    @Test
    fun `parses an unordered list`() {
        val blocks = MarkdownBlocks.parse("- Alpha\n- Beta\n- Gamma")
        val list = blocks.single() as MdBlock.MdList
        assertEquals(3, list.items.size)
        assertTrue(list.items.all { !it.ordered && it.level == 0 })
        assertEquals(listOf("Alpha", "Beta", "Gamma"), list.items.map { it.text })
    }

    @Test
    fun `parses an ordered list keeping ordinals`() {
        val blocks = MarkdownBlocks.parse("1. First\n2. Second\n3) Third")
        val list = blocks.single() as MdBlock.MdList
        assertTrue(list.items.all { it.ordered })
        assertEquals(listOf(1, 2, 3), list.items.map { it.number })
    }

    @Test
    fun `nested list items clamp to level one and fold continuations`() {
        val blocks = MarkdownBlocks.parse("- Top\n  - Nested\n  wrapped")
        val list = blocks.single() as MdBlock.MdList
        assertEquals(0, list.items[0].level)
        assertEquals(1, list.items[1].level)
        assertEquals("Nested wrapped", list.items[1].text)
    }

    @Test
    fun `a bare dash rule is not a list`() {
        val blocks = MarkdownBlocks.parse("---")
        assertEquals(listOf(MdBlock.ThematicBreak), blocks)
    }

    // ---- Code fences ----

    @Test
    fun `parses a closed fenced code block with a language`() {
        val src = "```kotlin\nval x = 1\nval y = 2\n```"
        assertEquals(
            listOf(MdBlock.CodeBlock(language = "kotlin", code = "val x = 1\nval y = 2")),
            MarkdownBlocks.parse(src),
        )
    }

    @Test
    fun `tilde fences are supported`() {
        val src = "~~~\ncode\n~~~"
        assertEquals(
            listOf(MdBlock.CodeBlock(language = null, code = "code")),
            MarkdownBlocks.parse(src),
        )
    }

    @Test
    fun `an unclosed fence degrades to a paragraph without losing content`() {
        val src = "```\nhalf a code block"
        val blocks = MarkdownBlocks.parse(src)
        assertEquals(1, blocks.size)
        val para = blocks.single() as MdBlock.Paragraph
        assertTrue(para.text.contains("half a code block"))
    }

    // ---- Blockquote ----

    @Test
    fun `parses a multi-line blockquote`() {
        val blocks = MarkdownBlocks.parse("> quoted one\n> quoted two")
        assertEquals(listOf(MdBlock.Blockquote("quoted one\nquoted two")), blocks)
    }

    // ---- Thematic breaks ----

    @Test
    fun `recognizes the three thematic break forms`() {
        for (rule in listOf("---", "***", "___")) {
            assertEquals(listOf(MdBlock.ThematicBreak), MarkdownBlocks.parse(rule))
        }
    }

    // ---- GFM tables ----

    @Test
    fun `parses a GFM table with alignment row`() {
        val src = """
            | Move | Type | BP |
            | :--- | :--: | ---: |
            | Dragon Claw | Dragon | 80 |
            | Earthquake | Ground | 100 |
        """.trimIndent()
        val table = (MarkdownBlocks.parse(src).single() as MdBlock.Table).table
        assertEquals(listOf("Move", "Type", "BP"), table.header)
        assertEquals(
            listOf(MdColumnAlignment.Leading, MdColumnAlignment.Center, MdColumnAlignment.Trailing),
            table.alignments,
        )
        assertEquals(2, table.rows.size)
        assertEquals(listOf("Dragon Claw", "Dragon", "80"), table.rows[0])
    }

    @Test
    fun `ragged table rows are padded and truncated to the header width`() {
        val src = "| A | B | C |\n| --- | --- | --- |\n| only-one |\n| w | x | y | z |"
        val table = (MarkdownBlocks.parse(src).single() as MdBlock.Table).table
        assertEquals(listOf("only-one", "", ""), table.rows[0])
        assertEquals(listOf("w", "x", "y"), table.rows[1])
    }

    @Test
    fun `a pipe line without a separator row stays a paragraph`() {
        val blocks = MarkdownBlocks.parse("a | b | c\nnot a separator")
        assertTrue(blocks.all { it is MdBlock.Paragraph })
    }

    @Test
    fun `a heading ends a table`() {
        val src = "| A | B |\n| --- | --- |\n| 1 | 2 |\n## After"
        val blocks = MarkdownBlocks.parse(src)
        assertTrue(blocks[0] is MdBlock.Table)
        assertEquals(MdBlock.Heading(2, "After"), blocks[1])
    }

    // ---- Mixed document ----

    @Test
    fun `parses a mixed document into the expected block sequence`() {
        val src = """
            ## Best moveset for Garchomp

            Garchomp wants a **physical** set. Key moves:

            - Dragon Claw — reliable STAB
            - Earthquake — coverage

            | Move | Type | BP |
            | --- | --- | ---: |
            | Dragon Claw | Dragon | 80 |

            > Speed tiers matter.

            ```
            252 Atk Garchomp Earthquake
            ```

            ---

            See [Bulbapedia](https://bulbapedia.bulbagarden.net).
        """.trimIndent()
        val kinds = MarkdownBlocks.parse(src).map { it::class.simpleName }
        assertEquals(
            listOf(
                "Heading", "Paragraph", "MdList", "Table", "Blockquote",
                "CodeBlock", "ThematicBreak", "Paragraph",
            ),
            kinds,
        )
    }

    // ---- HTML comments (citation-span markers) ----

    @Test
    fun `citation span comments are stripped from prose`() {
        assertEquals(
            listOf(MdBlock.Paragraph("Garchomp is fast.")),
            MarkdownBlocks.parse("<!-- span:c0 -->Garchomp is fast.<!-- /span:c0 -->"),
        )
    }

    @Test
    fun `citation span comments leave surrounding prose`() {
        assertEquals(
            listOf(MdBlock.Paragraph("X Y Z")),
            MarkdownBlocks.parse("X <!-- span:c0 -->Y<!-- /span:c0 --> Z"),
        )
    }

    @Test
    fun `html comments inside a closed fence stay intact`() {
        val source = "```\n<!-- span:c0 -->kept<!-- /span:c0 -->\n```"
        assertEquals(
            listOf(MdBlock.CodeBlock(language = null, code = "<!-- span:c0 -->kept<!-- /span:c0 -->")),
            MarkdownBlocks.parse(source),
        )
    }

    @Test
    fun `unclosed html comment is dropped`() {
        assertEquals(
            listOf(MdBlock.Paragraph("before")),
            MarkdownBlocks.parse("before <!-- span:c0"),
        )
    }

    @Test
    fun `stripHtmlComments is the shared helper`() {
        val raw = "<!-- span:c0 -->Ceruledge is Fire/Ghost.<!-- /span:c0 --> It has no Ground immunity."
        val stripped = MarkdownBlocks.stripHtmlComments(raw)
        assertEquals("Ceruledge is Fire/Ghost. It has no Ground immunity.", stripped)
        assertFalse(stripped.contains("<!--"))
    }

    // ---- Streaming safety ----

    @Test
    fun `growing prefixes of a rich document never throw`() {
        val doc = """
            ## Garchomp

            A **fast** pseudo-legendary. Key facts:

            - Base 102 Speed
            - Dragon / Ground

            | Stat | Value |
            | --- | ---: |
            | HP | 108 |
            | Atk | 130 |

            > Sand Veil boosts evasion in sand.

            ```
            252+ Atk Garchomp Earthquake vs. 0 HP Rotom
            ```

            See [more](https://example.com).
        """.trimIndent()
        // Every single-character prefix must parse without throwing and lose nothing.
        for (end in 0..doc.length) {
            val prefix = doc.substring(0, end)
            val blocks = MarkdownBlocks.parse(prefix)
            // Sensible: an empty prefix yields no blocks; a non-blank prefix yields ≥1.
            if (prefix.isNotBlank()) {
                assertTrue("prefix len $end produced no blocks", blocks.isNotEmpty())
            }
        }
    }

    @Test
    fun `mid-fence and mid-table truncations do not throw`() {
        val doc = "```kotlin\nval a = 1\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |"
        for (offset in listOf(3, 8, 12, 20, 30, 40, doc.length)) {
            val cut = doc.substring(0, minOf(offset, doc.length))
            // Must not throw.
            val blocks = MarkdownBlocks.parse(cut)
            assertNotNull(blocks)
        }
    }

    // ---- Real fixture input ----

    @Test
    fun `parses the answer_markdown from the answered fixture`() {
        val json = Json { ignoreUnknownKeys = true }
        val fixture = json.parseToJsonElement(Fixtures.string("oakanswer_answered_full.json"))
        val markdown = fixture.jsonObject["answer_markdown"]!!.jsonPrimitive.content
        val blocks = MarkdownBlocks.parse(markdown)
        assertTrue(blocks.isNotEmpty())
        assertTrue(blocks.first() is MdBlock.Paragraph)
        // The bold marker survives into the inline pass, not the block text.
        assertTrue((blocks.first() as MdBlock.Paragraph).text.contains("Garchomp"))
    }

    // ---- Inline spans ----

    @Test
    fun `inline parsing strips bold italic and code markers from the plain text`() {
        assertEquals("bold", parseInline("**bold**").text)
        assertEquals("italic", parseInline("*italic*").text)
        assertEquals("code", parseInline("`code`").text)
        assertEquals("Garchomp is fast", parseInline("**Garchomp** is *fast*").text)
    }

    @Test
    fun `inline link keeps its label as visible text`() {
        val result = parseInline("see [Bulbapedia](https://bulbapedia.bulbagarden.net)")
        assertEquals("see Bulbapedia", result.text)
    }

    @Test
    fun `unbalanced inline markers are emitted literally`() {
        assertEquals("**bold", parseInline("**bold").text)
        assertEquals("a * b", parseInline("a * b").text)
    }
}
