package ai.gowtam.oak.features.chat.answercard

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.MarkdownBlockView
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.Citation
import ai.gowtam.oak.wire.EntityKind
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Link
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

/**
 * Why + Sources disclosure. Unifies reasoning + citations into one expandable
 * drawer on the paper plate. Tab label: `Why · Sources (N)` or `Why`. Closed by
 * default.
 *
 * Keeps stable instrumentation tags [AnswerSection.REASONING] /
 * [AnswerSection.CITATIONS] on always-mounted section shells so
 * `AnswerCardRenderTest` order stays intact.
 */
@Composable
fun ReceiptsFooter(
    reasoningMarkdown: String?,
    citations: List<Citation>,
    modifier: Modifier = Modifier,
    onOpenEntity: (EntityKind, String) -> Unit = { _, _ -> },
    onHighlight: (Citation) -> Unit = {},
    /** Type-tinted top border when the parent plate has a primary type. */
    edgeColor: Color? = null,
) {
    val oak = LocalOakColors.current
    var expanded by remember { mutableStateOf(false) }
    val hasReasoning = !reasoningMarkdown.isNullOrBlank()
    val sourceCount = citations.size
    val label = when {
        sourceCount > 0 -> "Why · Sources ($sourceCount)"
        hasReasoning -> "Why"
        else -> "Sources"
    }
    val topBorder = edgeColor?.copy(alpha = 0.35f) ?: oak.border

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(oak.surfaceSunken.copy(alpha = 0.65f)),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(topBorder),
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded }
                .padding(horizontal = OakSpacing.lg, vertical = OakSpacing.md)
                .semantics(mergeDescendants = true) {
                    role = Role.Button
                    heading()
                    stateDescription = if (expanded) "Expanded" else "Collapsed"
                },
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                color = oak.textStrong,
            )
            Icon(
                imageVector = if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                contentDescription = null,
                tint = oak.textFaint,
                modifier = Modifier.size(20.dp),
            )
        }

        // Always-mounted section shells keep testTags in the tree (instrumentation).
        if (hasReasoning) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag(AnswerSection.REASONING.testTag),
            ) {
                AnimatedVisibility(visible = expanded) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = OakSpacing.lg)
                            .padding(bottom = if (citations.isEmpty()) OakSpacing.md else OakSpacing.sm),
                    ) {
                        Text(
                            text = "Why",
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                            color = oak.textMuted,
                        )
                        MarkdownBlockView(
                            markdown = reasoningMarkdown!!,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = OakSpacing.xs),
                        )
                    }
                }
            }
        }
        if (citations.isNotEmpty()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag(AnswerSection.CITATIONS.testTag),
            ) {
                AnimatedVisibility(visible = expanded) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = OakSpacing.lg)
                            .padding(bottom = OakSpacing.md),
                        verticalArrangement = Arrangement.spacedBy(OakSpacing.md),
                    ) {
                        Text(
                            text = "Sources",
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                            color = oak.textMuted,
                        )
                        for (citation in citations) {
                            ReceiptCitationRow(citation, onOpenEntity, onHighlight)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ReceiptCitationRow(
    citation: Citation,
    onOpenEntity: (EntityKind, String) -> Unit,
    onHighlight: (Citation) -> Unit,
) {
    val oak = LocalOakColors.current
    val parsed = parseCitationSource(citation.source)
    Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm), verticalAlignment = Alignment.Top) {
        Icon(
            imageVector = if (!citation.endpointUrl.isNullOrEmpty()) Icons.Filled.Link else Icons.AutoMirrored.Filled.MenuBook,
            contentDescription = null,
            tint = oak.textMuted,
            modifier = Modifier.size(16.dp),
        )
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = displayCitationSource(citation.source),
                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                color = if (parsed != null) oak.azure else oak.textStrong,
                modifier = if (parsed != null) {
                    val (kind, query) = parsed
                    Modifier.clickable {
                        onHighlight(citation)
                        onOpenEntity(kind, query)
                    }
                } else {
                    Modifier.clickable { onHighlight(citation) }
                },
            )
            Text(text = citation.detail, style = MaterialTheme.typography.bodySmall, color = oak.textMuted)
            val url = citation.endpointUrl
            if (!url.isNullOrEmpty()) {
                Text(
                    text = url,
                    style = MaterialTheme.typography.bodySmall,
                    color = oak.azure,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
