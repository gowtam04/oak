package ai.gowtam.oak.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle

/**
 * A single block-level element parsed out of a Markdown document.
 *
 * The inline content each block carries (paragraph `text`, table cells, list-item
 * `text`, blockquote body) is still raw Markdown — bold/italic/`code`/links inside a
 * block are interpreted later by [parseInline]. Only the *block* structure (headings,
 * lists, GFM tables, fences, blockquotes, thematic breaks) is resolved here.
 *
 * This type and [MarkdownBlocks] are deliberately Compose-UI-free at the *block* level
 * so the grammar can be unit-tested in isolation. Ports `MarkdownBlock` /
 * `MarkdownBlocks` from `ios/OakApp/UI/MarkdownBlocks.swift`.
 */
sealed interface MdBlock {
    /** An ATX heading. [level] is clamped to `1..4` (deeper levels collapse to 4). */
    data class Heading(val level: Int, val text: String) : MdBlock

    /** A run of prose. May contain hard line breaks (`\n`) the renderer preserves. */
    data class Paragraph(val text: String) : MdBlock

    /** An ordered or unordered list; items carry their own marker + one nesting level. */
    data class MdList(val items: List<MdListItem>) : MdBlock

    /** A GFM pipe table (header row + `---` separator + zero-or-more body rows). */
    data class Table(val table: MdTable) : MdBlock

    /** A fenced code block (``` … ``` or ~~~ … ~~~). [language] is the info string. */
    data class CodeBlock(val language: String?, val code: String) : MdBlock

    /** A `>`-prefixed blockquote; the body keeps its inner line breaks. */
    data class Blockquote(val text: String) : MdBlock

    /** A thematic break (`---`, `***`, `___`). */
    data object ThematicBreak : MdBlock
}

/**
 * One list item: its marker kind + ordinal, its (clamped) nesting level, and the
 * inline Markdown text after the marker.
 */
data class MdListItem(
    /** `true` for `1.`/`2)` ordered markers, `false` for `-`/`*`/`+` bullets. */
    val ordered: Boolean,
    /** The parsed ordinal for an ordered item (`1` for unordered — unused there). */
    val number: Int,
    /** `0` for a top-level item, `1` for a nested one. Deeper indentation clamps to 1. */
    val level: Int,
    /** The inline Markdown following the marker (continuation lines folded in). */
    val text: String,
)

/** Column text alignment parsed from a GFM separator row (`:---`, `---:`, `:--:`). */
enum class MdColumnAlignment { Leading, Center, Trailing }

/**
 * A parsed GFM table. [alignments] and every [rows] entry are normalized to
 * `header.size` columns (ragged rows padded/truncated), so the renderer can lay out a
 * fixed grid without bounds-checking.
 */
data class MdTable(
    val header: List<String>,
    val alignments: List<MdColumnAlignment>,
    val rows: List<List<String>>,
)

/**
 * Block-level Markdown splitter — a single-pass, line-based grammar tuned for Oak's
 * answer/reasoning prose (a few KB of GFM). It is **streaming-safe**: an unclosed
 * trailing block (half a table, an open code fence) never drops content and never
 * throws — it falls back to a plain paragraph until the block completes.
 */
object MarkdownBlocks {

    /**
     * Removes HTML comments (`<!-- … -->`) so citation-span markers
     * (`<!-- span:c0 -->…<!-- /span:c0 -->`) never render as prose.
     * Fenced code interiors are left intact. A trailing unclosed `<!--`
     * outside a fence is dropped (streaming-safe). Newlines are normalized
     * to `\n`.
     */
    fun stripHtmlComments(source: String): String {
        val text = source.replace("\r\n", "\n").replace("\r", "\n")
        val fences = fencedRanges(text)
        val out = StringBuilder(text.length)
        var i = 0
        while (i < text.length) {
            val inFence = fences.any { i in it }
            if (!inFence && text.startsWith("<!--", i)) {
                val close = text.indexOf("-->", startIndex = i + 4)
                if (close < 0) break
                i = close + 3
                continue
            }
            out.append(text[i])
            i += 1
        }
        return out.toString()
    }

    /**
     * Splits [source] into ordered block elements. Never throws; unrecognized or
     * half-formed input becomes paragraph blocks so no content is lost.
     */
    fun parse(source: String): List<MdBlock> {
        val normalized = stripHtmlComments(source)
        // Keep empty lines: split on '\n' WITHOUT dropping trailing empties.
        val lines = normalized.split("\n")

        val blocks = mutableListOf<MdBlock>()
        val paragraph = mutableListOf<String>()

        fun flushParagraph() {
            val joined = paragraph.joinToString("\n").trim()
            if (joined.isNotEmpty()) blocks.add(MdBlock.Paragraph(joined))
            paragraph.clear()
        }

        var i = 0
        while (i < lines.size) {
            val line = lines[i]
            val trimmed = line.trim()

            // Blank line — a block boundary.
            if (trimmed.isEmpty()) {
                flushParagraph()
                i += 1
                continue
            }

            // Fenced code block. An unclosed fence (mid-stream) degrades to a paragraph.
            val fence = fenceInfo(trimmed)
            if (fence != null) {
                flushParagraph()
                val codeLines = mutableListOf<String>()
                var j = i + 1
                var closed = false
                while (j < lines.size) {
                    val cand = lines[j].trim()
                    if (isClosingFence(cand, fence.char)) {
                        closed = true
                        break
                    }
                    codeLines.add(lines[j])
                    j += 1
                }
                if (closed) {
                    blocks.add(MdBlock.CodeBlock(language = fence.language, code = codeLines.joinToString("\n")))
                    i = j + 1
                } else {
                    // Streaming-safe fallback: keep opener + partial body verbatim.
                    val raw = (listOf(line) + codeLines).joinToString("\n")
                    blocks.add(MdBlock.Paragraph(raw))
                    i = lines.size
                }
                continue
            }

            // ATX heading.
            val heading = parseHeading(trimmed)
            if (heading != null) {
                flushParagraph()
                blocks.add(heading)
                i += 1
                continue
            }

            // GFM table — this line looks like a row AND the next is a separator row.
            if (line.contains("|") && i + 1 < lines.size) {
                val alignments = parseSeparatorRow(lines[i + 1])
                if (alignments != null) {
                    flushParagraph()
                    val header = splitTableRow(line)
                    val rows = mutableListOf<List<String>>()
                    var j = i + 2
                    while (j < lines.size) {
                        val rowLine = lines[j]
                        val rowTrimmed = rowLine.trim()
                        if (rowTrimmed.isEmpty() || !rowLine.contains("|")) break
                        // A heading/fence starting mid-table ends the table.
                        if (parseHeading(rowTrimmed) != null || fenceInfo(rowTrimmed) != null) break
                        rows.add(normalize(splitTableRow(rowLine), header.size))
                        j += 1
                    }
                    blocks.add(
                        MdBlock.Table(
                            MdTable(
                                header = header,
                                alignments = normalizeAlignments(alignments, header.size),
                                rows = rows,
                            ),
                        ),
                    )
                    i = j
                    continue
                }
            }

            // Thematic break.
            if (isThematicBreak(trimmed)) {
                flushParagraph()
                blocks.add(MdBlock.ThematicBreak)
                i += 1
                continue
            }

            // Blockquote.
            if (trimmed.startsWith(">")) {
                flushParagraph()
                val quoteLines = mutableListOf<String>()
                var j = i
                while (j < lines.size) {
                    val q = lines[j].trim()
                    if (!q.startsWith(">")) break
                    var content = q.drop(1)
                    if (content.startsWith(" ")) content = content.drop(1)
                    quoteLines.add(content)
                    j += 1
                }
                val body = quoteLines.joinToString("\n").trim()
                blocks.add(MdBlock.Blockquote(body))
                i = j
                continue
            }

            // List (ordered or unordered), one nesting level.
            if (listItem(line) != null) {
                flushParagraph()
                val items = mutableListOf<MdListItem>()
                var j = i
                while (j < lines.size) {
                    val l = lines[j]
                    if (l.trim().isEmpty()) break
                    val item = listItem(l)
                    if (item != null) {
                        items.add(item)
                        j += 1
                    } else if (l.firstOrNull() == ' ' || l.firstOrNull() == '\t') {
                        // A wrapped continuation line — fold it into the current item.
                        if (items.isNotEmpty()) {
                            val last = items.removeAt(items.size - 1)
                            items.add(last.copy(text = last.text + " " + l.trim()))
                        }
                        j += 1
                    } else {
                        break
                    }
                }
                blocks.add(MdBlock.MdList(items))
                i = j
                continue
            }

            // Default: accumulate into the current paragraph.
            paragraph.add(line)
            i += 1
        }

        flushParagraph()
        return blocks
    }

    // ---- Fences ----

    private data class Fence(val char: Char, val language: String?)

    /**
     * Character ranges of fenced code blocks (opener through closer, or opener
     * through EOS when unclosed). Used so [stripHtmlComments] does not touch
     * comments that belong inside a fence.
     */
    private fun fencedRanges(source: String): List<IntRange> {
        val ranges = mutableListOf<IntRange>()
        var lineStart = 0
        var fenceStart: Int? = null
        var fenceChar: Char? = null
        var i = 0

        fun considerLine(end: Int) {
            val trimmed = source.substring(lineStart, end).trim()
            val ch = fenceChar
            val start = fenceStart
            if (ch != null && start != null) {
                if (isClosingFence(trimmed, ch)) {
                    ranges.add(start until end)
                    fenceChar = null
                    fenceStart = null
                }
            } else {
                val info = fenceInfo(trimmed)
                if (info != null) {
                    fenceStart = lineStart
                    fenceChar = info.char
                }
            }
        }

        while (i < source.length) {
            if (source[i] == '\n') {
                considerLine(i)
                lineStart = i + 1
            }
            i += 1
        }
        considerLine(source.length)
        val openStart = fenceStart
        if (openStart != null) {
            ranges.add(openStart until source.length)
        }
        return ranges
    }

    /**
     * Parses a fence opener from a trimmed line, returning the fence character and the
     * info string (language) if present. Null when the line is not a fence.
     */
    private fun fenceInfo(trimmed: String): Fence? {
        val first = trimmed.firstOrNull() ?: return null
        if (first != '`' && first != '~') return null
        var count = 0
        while (count < trimmed.length && trimmed[count] == first) count += 1
        if (count < 3) return null
        val rest = trimmed.substring(count).trim()
        return Fence(first, if (rest.isEmpty()) null else rest)
    }

    /**
     * A closing fence is a trimmed line of three-or-more of the opener's fence char and
     * nothing else (so `` ```swift `` never closes a `` ``` `` block).
     */
    private fun isClosingFence(trimmed: String, char: Char): Boolean {
        if (trimmed.length < 3 || trimmed.firstOrNull() != char) return false
        return trimmed.all { it == char }
    }

    // ---- Headings ----

    private fun parseHeading(trimmed: String): MdBlock.Heading? {
        if (trimmed.firstOrNull() != '#') return null
        var level = 0
        while (level < trimmed.length && trimmed[level] == '#') level += 1
        if (level !in 1..6) return null
        // ATX requires a space after the run (or end of line for an empty heading).
        if (level != trimmed.length && trimmed[level] != ' ') return null
        val text = stripTrailingHashes(trimmed.substring(level).trim())
        return MdBlock.Heading(level = minOf(level, 4), text = text)
    }

    /** Drops an optional ATX closing `#` sequence (`## Title ##` → `Title`). */
    private fun stripTrailingHashes(text: String): String = text.trimEnd('#').trim()

    // ---- Tables ----

    /**
     * Splits one pipe-delimited row into trimmed cells, dropping the optional
     * leading/trailing border pipes while keeping interior empty cells.
     */
    private fun splitTableRow(line: String): List<String> {
        var s = line.trim()
        if (s.startsWith("|")) s = s.substring(1)
        if (s.endsWith("|")) s = s.substring(0, s.length - 1)
        return s.split("|").map { it.trim() }
    }

    /**
     * Parses a GFM separator row into per-column alignments, or null if the line is not
     * a valid separator (every non-empty cell must be `:?-+:?`).
     */
    private fun parseSeparatorRow(line: String): List<MdColumnAlignment>? {
        if (!line.contains("|") && !line.contains("-")) return null
        val cells = splitTableRow(line)
        if (cells.isEmpty()) return null
        val alignments = mutableListOf<MdColumnAlignment>()
        for (cell in cells) {
            if (cell.isEmpty()) return null
            val left = cell.startsWith(":")
            val right = cell.endsWith(":")
            var body = cell
            if (left) body = body.substring(1)
            if (right) body = body.substring(0, body.length - 1)
            if (body.isEmpty() || !body.all { it == '-' }) return null
            alignments.add(
                when {
                    left && right -> MdColumnAlignment.Center
                    right -> MdColumnAlignment.Trailing
                    else -> MdColumnAlignment.Leading
                },
            )
        }
        return alignments
    }

    private fun normalize(row: List<String>, count: Int): List<String> = when {
        row.size == count -> row
        row.size > count -> row.take(count)
        else -> row + List(count - row.size) { "" }
    }

    private fun normalizeAlignments(
        alignments: List<MdColumnAlignment>,
        count: Int,
    ): List<MdColumnAlignment> = when {
        alignments.size == count -> alignments
        alignments.size > count -> alignments.take(count)
        else -> alignments + List(count - alignments.size) { MdColumnAlignment.Leading }
    }

    // ---- Thematic break ----

    private fun isThematicBreak(trimmed: String): Boolean {
        val dense = trimmed.filter { it != ' ' }
        if (dense.length < 3) return false
        return dense.all { it == '-' } || dense.all { it == '*' } || dense.all { it == '_' }
    }

    // ---- List items ----

    /**
     * Parses a single list-item line into a [MdListItem], or null if the line is not a
     * list item. Leading indentation of two-or-more columns marks a nested (level 1)
     * item; deeper nesting clamps to 1. `-`/`*`/`+` are bullets; `1.`/`2)` are ordered.
     * A bare `-`/`*` with no following text (e.g. `---`) is not a list.
     */
    private fun listItem(line: String): MdListItem? {
        var indent = 0
        var idx = 0
        while (idx < line.length && (line[idx] == ' ' || line[idx] == '\t')) {
            indent += if (line[idx] == '\t') 4 else 1
            idx += 1
        }
        if (idx >= line.length) return null
        val level = if (indent >= 2) 1 else 0
        val ch = line[idx]

        if (ch == '-' || ch == '*' || ch == '+') {
            val after = idx + 1
            if (after >= line.length || line[after] != ' ') return null
            val text = line.substring(after + 1).trim()
            if (text.isEmpty()) return null
            return MdListItem(ordered = false, number = 1, level = level, text = text)
        }

        if (ch.isDigit()) {
            var end = idx
            val digits = StringBuilder()
            while (end < line.length && line[end].isDigit()) {
                digits.append(line[end])
                end += 1
            }
            if (end >= line.length || (line[end] != '.' && line[end] != ')')) return null
            val after = end + 1
            if (after >= line.length || line[after] != ' ') return null
            val text = line.substring(after + 1).trim()
            if (text.isEmpty()) return null
            return MdListItem(
                ordered = true,
                number = digits.toString().toIntOrNull() ?: 1,
                level = level,
                text = text,
            )
        }

        return null
    }
}

/**
 * Renders inline Markdown — `**bold**`, `*italic*`/`_italic_`, `` `code` ``,
 * `[label](url)` — into an [AnnotatedString]. A link becomes a [LinkAnnotation.Url]
 * so `Text` dispatches taps through `LocalUriHandler`. Unbalanced or partial markup
 * (an unclosed `**`, a `[label](` with no close) is emitted as literal text — this is
 * streaming-safe by never throwing and never dropping characters.
 *
 * Ports the inline subset of the iOS renderer (which uses `AttributedString(markdown:)`
 * with `.inlineOnlyPreservingWhitespace`).
 */
fun parseInline(
    text: String,
    linkColor: Color = Color.Unspecified,
    codeBackground: Color = Color(0x1F808080),
): AnnotatedString =
    buildAnnotatedString {
        var i = 0
        val n = text.length
        val plain = StringBuilder()

        fun flushPlain() {
            if (plain.isNotEmpty()) {
                append(plain.toString())
                plain.clear()
            }
        }

        while (i < n) {
            val c = text[i]

            // Inline code — `code`. Highest precedence; contents are not re-parsed.
            if (c == '`') {
                val close = text.indexOf('`', i + 1)
                if (close > i) {
                    flushPlain()
                    withStyle(
                        SpanStyle(
                            fontFamily = JetBrainsMonoFamily,
                            background = codeBackground,
                        ),
                    ) {
                        append(text.substring(i + 1, close))
                    }
                    i = close + 1
                    continue
                }
            }

            // Link — [label](url).
            if (c == '[') {
                val closeBracket = text.indexOf(']', i + 1)
                if (closeBracket > i &&
                    closeBracket + 1 < n &&
                    text[closeBracket + 1] == '('
                ) {
                    val closeParen = text.indexOf(')', closeBracket + 2)
                    if (closeParen > closeBracket) {
                        val label = text.substring(i + 1, closeBracket)
                        val url = text.substring(closeBracket + 2, closeParen).trim()
                        flushPlain()
                        withLink(
                            LinkAnnotation.Url(
                                url = url,
                                styles = TextLinkStyles(
                                    style = SpanStyle(
                                        color = linkColor,
                                        fontWeight = FontWeight.Medium,
                                    ),
                                ),
                            ),
                        ) {
                            append(parseInline(label, linkColor, codeBackground))
                        }
                        i = closeParen + 1
                        continue
                    }
                }
            }

            // Bold — **text** or __text__.
            if ((c == '*' || c == '_') && i + 1 < n && text[i + 1] == c) {
                val marker = "$c$c"
                val close = text.indexOf(marker, i + 2)
                if (close > i + 1) {
                    flushPlain()
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                        append(parseInline(text.substring(i + 2, close), linkColor, codeBackground))
                    }
                    i = close + 2
                    continue
                }
            }

            // Italic — *text* or _text_ (single marker).
            if (c == '*' || c == '_') {
                val close = text.indexOf(c, i + 1)
                if (close > i && close != i + 1) {
                    flushPlain()
                    withStyle(SpanStyle(fontStyle = FontStyle.Italic)) {
                        append(parseInline(text.substring(i + 1, close), linkColor, codeBackground))
                    }
                    i = close + 1
                    continue
                }
            }

            plain.append(c)
            i += 1
        }

        flushPlain()
    }
