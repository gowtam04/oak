package ai.gowtam.oak.features.chat.answercard

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.Citation
import ai.gowtam.oak.wire.EntityKind
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

/**
 * The "Sources" section at the foot of an answer card — the cited sources backing the
 * answer, as a collapsible disclosure (closed by default) titled "Sources" with a count
 * pill. Each [Citation] shows its `source` in bold, `detail` muted, and `endpoint_url`
 * (when present) as a link line. The caller gates it on non-empty citations.
 */
@Composable
fun Citations(
    citations: List<Citation>,
    modifier: Modifier = Modifier,
    onOpenEntity: (EntityKind, String) -> Unit = { _, _ -> },
    onHighlight: (ai.gowtam.oak.wire.CitationAnchor) -> Unit = {},
) {
    val oak = LocalOakColors.current
    var expanded by remember { mutableStateOf(false) }
    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded }
                .padding(vertical = OakSpacing.xs)
                .semantics(mergeDescendants = true) {
                    role = Role.Button
                    heading()
                    stateDescription = if (expanded) "Expanded" else "Collapsed"
                },
            horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.AutoMirrored.Filled.MenuBook,
                contentDescription = null,
                tint = oak.textMuted,
                modifier = Modifier.size(18.dp),
            )
            Text(
                text = "Sources",
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                color = oak.textStrong,
            )
            Text(
                text = citations.size.toString(),
                style = MaterialTheme.typography.labelSmall,
                color = oak.textMuted,
                modifier = Modifier
                    .background(oak.surfaceRaised, RoundedCornerShape(OakRadius.pill))
                    .padding(horizontal = 7.dp, vertical = 2.dp),
            )
            Text(text = "", modifier = Modifier.weight(1f))
            Icon(
                imageVector = if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                contentDescription = null,
                tint = oak.textMuted,
                modifier = Modifier.size(20.dp),
            )
        }
        AnimatedVisibility(visible = expanded) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(top = OakSpacing.sm),
                verticalArrangement = Arrangement.spacedBy(OakSpacing.md),
            ) {
                for (citation in citations) {
                    CitationRow(citation, onOpenEntity, onHighlight)
                }
            }
        }
    }
}

@Composable
private fun CitationRow(
    citation: Citation,
    onOpenEntity: (EntityKind, String) -> Unit,
    onHighlight: (ai.gowtam.oak.wire.CitationAnchor) -> Unit,
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
                        citationHighlight(citation)?.let(onHighlight)
                        onOpenEntity(kind, query)
                    }
                } else {
                    Modifier.clickable { citationHighlight(citation)?.let(onHighlight) }
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
