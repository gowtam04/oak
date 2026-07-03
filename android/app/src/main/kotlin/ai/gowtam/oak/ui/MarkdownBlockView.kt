package ai.gowtam.oak.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Renders block-level Markdown — headings, lists, GFM tables, fenced code,
 * blockquotes, thematic breaks — natively, using [MarkdownBlocks.parse] to split the
 * source and [parseInline] to render the bold/italic/`code`/link markup *inside* each
 * block. The block-aware counterpart to [MarkdownText] (which stays inline-only).
 *
 * **Streaming-safe by construction:** the splitter degrades a half-formed trailing
 * block (an open code fence, a header without its separator) to a plain inline-parsed
 * paragraph, so re-rendering on every delta never drops content and never flickers
 * structure it can't yet resolve.
 *
 * Ports `ios/OakApp/UI/MarkdownBlockView.swift`.
 */
@Composable
fun MarkdownBlockView(
    markdown: String,
    modifier: Modifier = Modifier,
) {
    val blocks = MarkdownBlocks.parse(markdown)
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        for (block in blocks) {
            BlockView(block)
        }
    }
}

/**
 * Inline-only Markdown prose — the counterpart to iOS `MarkdownText`. Renders
 * bold/italic/`code`/links into a single wrapping [Text]; block structure is ignored.
 * Use where a field is known to be a single run of prose.
 */
@Composable
fun MarkdownText(
    markdown: String,
    modifier: Modifier = Modifier,
    color: Color = Color.Unspecified,
) {
    val oak = LocalOakColors.current
    Text(
        text = parseInline(markdown, linkColor = oak.azure),
        modifier = modifier,
        color = color,
    )
}

@Composable
private fun BlockView(block: MdBlock) {
    val oak = LocalOakColors.current
    when (block) {
        is MdBlock.Heading -> Text(
            text = parseInline(block.text, linkColor = oak.azure),
            style = headingStyle(block.level),
            color = oak.textStrong,
            modifier = Modifier.fillMaxWidth(),
        )

        is MdBlock.Paragraph -> Text(
            text = parseInline(block.text, linkColor = oak.azure),
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.fillMaxWidth(),
        )

        is MdBlock.MdList -> MarkdownListView(block.items)

        is MdBlock.Table -> MarkdownTableView(block.table)

        is MdBlock.CodeBlock -> MarkdownCodeBlock(block.code)

        is MdBlock.Blockquote -> MarkdownBlockquote(block.text)

        MdBlock.ThematicBreak -> HorizontalDivider(color = oak.border)
    }
}

@Composable
private fun headingStyle(level: Int) = when (level) {
    1 -> MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold)
    2 -> MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold)
    3 -> MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold)
    else -> MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold)
}

// ---- Lists ----

@Composable
private fun MarkdownListView(items: List<MdListItem>) {
    val oak = LocalOakColors.current
    Column(verticalArrangement = Arrangement.spacedBy(OakSpacing.xs)) {
        for (item in items) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = (item.level * 18).dp),
                horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
            ) {
                Text(
                    text = marker(item),
                    color = oak.textMuted,
                    style = MaterialTheme.typography.bodyLarge,
                    fontFamily = if (item.ordered) FontFamily.Monospace else FontFamily.Default,
                )
                Text(
                    text = parseInline(item.text, linkColor = oak.azure),
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

private fun marker(item: MdListItem): String = when {
    item.ordered -> "${item.number}."
    item.level == 0 -> "•" // •
    else -> "◦" // ◦
}

// ---- Code block ----

@Composable
private fun MarkdownCodeBlock(code: String) {
    val oak = LocalOakColors.current
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(OakRadius.md))
            .background(oak.surfaceSunken)
            .border(1.dp, oak.border, RoundedCornerShape(OakRadius.md))
            .horizontalScroll(rememberScrollState())
            .padding(OakSpacing.md),
    ) {
        Text(
            text = code,
            fontFamily = FontFamily.Monospace,
            fontSize = 13.sp,
            color = oak.text,
        )
    }
}

// ---- Blockquote ----

@Composable
private fun MarkdownBlockquote(text: String) {
    val oak = LocalOakColors.current
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        Box(
            modifier = Modifier
                .width(3.dp)
                .background(oak.accent.copy(alpha = 0.5f), RoundedCornerShape(2.dp)),
        )
        Text(
            text = parseInline(text, linkColor = oak.azure),
            style = MaterialTheme.typography.bodyLarge,
            color = oak.textMuted,
            modifier = Modifier.weight(1f),
        )
    }
}

// ---- Table ----

/**
 * A GFM table rendered as a native grid, horizontally scrollable so a wide table
 * never forces the page to scroll sideways. Column widths size to content (capped)
 * and every cell in a visual column shares that width, so rows line up. Header row
 * gets a wash + underline; body rows zebra-stripe.
 */
@Composable
private fun MarkdownTableView(table: MdTable) {
    val oak = LocalOakColors.current
    val cols = maxOf(table.header.size, 1)
    val allRows = remember(table) { listOf(table.header) + table.rows }

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(OakRadius.md))
            .border(1.dp, oak.border, RoundedCornerShape(OakRadius.md))
            .background(MaterialTheme.colorScheme.surface)
            .horizontalScroll(rememberScrollState()),
    ) {
        TableGrid(
            cols = cols,
            cellCap = 240.dp,
        ) {
            allRows.forEachIndexed { rowIndex, row ->
                val isHeader = rowIndex == 0
                val background = when {
                    isHeader -> oak.textStrong.copy(alpha = 0.06f)
                    rowIndex % 2 == 0 -> Color.Transparent
                    else -> oak.textStrong.copy(alpha = 0.04f)
                }
                for (c in 0 until cols) {
                    val value = row.getOrNull(c) ?: ""
                    val align = table.alignments.getOrNull(c) ?: MdColumnAlignment.Leading
                    Box(
                        modifier = Modifier
                            .background(background)
                            .padding(horizontal = OakSpacing.md, vertical = OakSpacing.sm),
                        contentAlignment = when (align) {
                            MdColumnAlignment.Leading -> Alignment.CenterStart
                            MdColumnAlignment.Center -> Alignment.Center
                            MdColumnAlignment.Trailing -> Alignment.CenterEnd
                        },
                    ) {
                        Text(
                            text = parseInline(value, linkColor = oak.azure),
                            style = if (isHeader) {
                                MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold)
                            } else {
                                MaterialTheme.typography.bodyMedium
                            },
                            color = if (isHeader) oak.textStrong else oak.text,
                            textAlign = when (align) {
                                MdColumnAlignment.Leading -> TextAlign.Start
                                MdColumnAlignment.Center -> TextAlign.Center
                                MdColumnAlignment.Trailing -> TextAlign.End
                            },
                        )
                    }
                }
            }
        }
    }
}

/**
 * A fixed grid: [content] must emit exactly `rows * [cols]` children in row-major
 * order. Column widths are the max content width in that column (each cell capped at
 * [cellCap] so one long cell can't blow out the layout); every cell then fills its
 * column width and its row height, so backgrounds tile the whole grid and rows align.
 */
@Composable
private fun TableGrid(
    cols: Int,
    cellCap: Dp,
    content: @Composable () -> Unit,
) {
    Layout(content = content) { measurables, constraints ->
        if (measurables.isEmpty()) return@Layout layout(0, 0) {}
        val capPx = cellCap.roundToPx()
        val rowCount = (measurables.size + cols - 1) / cols

        // Pass 1 — natural width (capped) → per-column max width.
        val colWidths = IntArray(cols)
        measurables.forEachIndexed { idx, m ->
            val p = m.measure(Constraints(maxWidth = capPx))
            val c = idx % cols
            if (p.width > colWidths[c]) colWidths[c] = p.width
        }

        // Pass 2 — fixed column width → per-row max height.
        val rowHeights = IntArray(rowCount)
        measurables.forEachIndexed { idx, m ->
            val c = idx % cols
            val w = colWidths[c]
            val p = m.measure(Constraints(minWidth = w, maxWidth = w))
            val r = idx / cols
            if (p.height > rowHeights[r]) rowHeights[r] = p.height
        }

        // Pass 3 — fixed width + fixed row height so each cell fills its grid slot.
        val placeables = measurables.mapIndexed { idx, m ->
            val c = idx % cols
            val r = idx / cols
            val w = colWidths[c]
            val h = rowHeights[r]
            m.measure(Constraints(minWidth = w, maxWidth = w, minHeight = h, maxHeight = h))
        }

        val totalWidth = colWidths.sum()
        val totalHeight = rowHeights.sum()
        layout(totalWidth, totalHeight) {
            var y = 0
            for (r in 0 until rowCount) {
                var x = 0
                for (c in 0 until cols) {
                    val idx = r * cols + c
                    if (idx < placeables.size) {
                        placeables[idx].placeRelative(x, y)
                    }
                    x += colWidths[c]
                }
                y += rowHeights[r]
            }
        }
    }
}
