package ai.gowtam.oak.features.artifact

import ai.gowtam.oak.app.LocalServices
import ai.gowtam.oak.features.usage.UsageDexLink
import ai.gowtam.oak.features.usage.UsageListKind
import ai.gowtam.oak.features.usage.formatUsageFetchedAt
import ai.gowtam.oak.features.usage.parseUsageAttribution
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakButton
import ai.gowtam.oak.ui.OakButtonStyle
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.TeamMember
import ai.gowtam.oak.wire.UsageEntry
import ai.gowtam.oak.wire.UsageLadder
import ai.gowtam.oak.wire.UsageSpecies
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

private const val UNAVAILABLE_COPY =
    "Live Champions usage is unavailable right now. Chat, Dex, Teams, and Calc still work — try this page again in a bit."

/**
 * Full species usage drill-in for a Pokémon artifact (Summary's sibling tab).
 */
@Composable
fun PokemonUsagePane(
    slug: String,
    onOpen: (EntityKind, String) -> Unit,
    modifier: Modifier = Modifier,
    onAddToTeam: ((TeamMember) -> Unit)? = null,
    onApplySpecies: ((String) -> Unit)? = null,
) {
    val usage = LocalServices.current?.usage
    val oak = LocalOakColors.current
    val loader = remember(usage) { usage?.let { PokemonUsageLoader(it) } }
    val idle = remember { kotlinx.coroutines.flow.MutableStateFlow(PokemonUsageLoader.State()) }
    val state by (loader?.state ?: idle).collectAsState()
    var note by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(slug, loader) {
        loader?.load(slug)
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs)) {
            FilterChip(
                selected = state.ladder == UsageLadder.Doubles,
                onClick = { scope.launch { loader?.load(slug, UsageLadder.Doubles) } },
                label = { Text("Doubles") },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = oak.accentSoft,
                    selectedLabelColor = oak.accent,
                ),
            )
            FilterChip(
                selected = state.ladder == UsageLadder.Singles,
                onClick = { scope.launch { loader?.load(slug, UsageLadder.Singles) } },
                label = { Text("Singles") },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = oak.accentSoft,
                    selectedLabelColor = oak.accent,
                ),
            )
        }

        val detail = state.detail
        when {
            loader == null -> {
                Text(UNAVAILABLE_COPY, color = oak.textMuted)
            }
            state.loading && detail == null -> {
                CircularProgressIndicator(color = oak.accent)
            }
            detail == null || !detail.available -> {
                Text("Usage unavailable", style = MaterialTheme.typography.titleMedium, color = oak.textStrong)
                Text(detail?.error ?: UNAVAILABLE_COPY, color = oak.textMuted)
            }
            detail.found != true -> {
                Text("No usage set", style = MaterialTheme.typography.titleMedium, color = oak.textStrong)
                Text(
                    "No Champions usage set is listed for this species. It may not be on the Champions roster.",
                    color = oak.textMuted,
                )
            }
            else -> {
                ArtifactUsageFound(
                    detail = detail,
                    slug = slug,
                    onOpen = onOpen,
                    onApply = {
                        if (onApplySpecies != null) {
                            onApplySpecies(it)
                        } else {
                            note = "Sign in to apply this Champions set to a team."
                        }
                    },
                )
            }
        }
        note?.let { Text(it, color = oak.textMuted, style = MaterialTheme.typography.bodySmall) }
    }
}

@Composable
private fun ArtifactUsageFound(
    detail: UsageSpecies,
    slug: String,
    onOpen: (EntityKind, String) -> Unit,
    onApply: (String) -> Unit,
) {
    val oak = LocalOakColors.current
    val title = detail.savedName ?: detail.slug ?: slug
    Text(title, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold), color = oak.textStrong)
    if (detail.season != null || detail.fetchedAt != null) {
        UsageSnapshotLine(season = detail.season, fetchedAt = detail.fetchedAt)
    }
    detail.attribution?.takeIf { it.isNotBlank() }?.let { UsageSourceLine(it) }
    UsageShareSection("Moves", detail.moves, UsageListKind.MOVES, onOpen)
    UsageShareSection("Items", detail.items, UsageListKind.ITEMS, onOpen)
    UsageShareSection("Abilities", detail.abilities, UsageListKind.ABILITIES, onOpen)
    UsageShareSection("Natures", detail.natures, UsageListKind.NATURES, onOpen)
    UsageShareSection("Spreads", detail.spreads, UsageListKind.SPREADS, onOpen)
    UsageShareSection("Teammates", detail.teammates, UsageListKind.TEAMMATES, onOpen)
    val applySlug = detail.slug?.takeIf { it.isNotBlank() } ?: slug
    OakButton(
        onClick = { onApply(applySlug) },
        style = OakButtonStyle.Primary,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text("Apply this Champions set")
    }
}

@Composable
private fun UsageShareSection(
    title: String,
    entries: List<UsageEntry>,
    kind: UsageListKind,
    onOpen: (EntityKind, String) -> Unit,
) {
    if (entries.isEmpty()) return
    val oak = LocalOakColors.current
    Text(title, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold), color = oak.textStrong)
    for (entry in entries) {
        val pct = entry.pct?.let { "${"%.1f".format(it)}%" } ?: "—"
        val target = UsageDexLink.route(kind, entry.name)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .then(
                    if (target != null) {
                        Modifier.clickable(onClick = { onOpen(target.kind, target.query) }, onClickLabel = "Open ${entry.name}")
                    } else {
                        Modifier
                    },
                )
                .padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
        ) {
            Text(entry.name, style = MaterialTheme.typography.bodyMedium, color = oak.text, modifier = Modifier.weight(1f))
            Text(pct, style = MaterialTheme.typography.bodyMedium, color = oak.textMuted)
            if (target != null) {
                Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = oak.textMuted)
            }
        }
    }
}

@Composable
private fun UsageSnapshotLine(season: String?, fetchedAt: Long?) {
    val oak = LocalOakColors.current
    val liveLine = listOfNotNull("Live", season?.takeIf { it.isNotBlank() }).joinToString(" · ")
    val fetchedLabel = fetchedAt?.let { formatUsageFetchedAt(it) }
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        if (liveLine.isNotEmpty()) {
            Text(liveLine.uppercase(), style = MaterialTheme.typography.labelSmall, color = oak.textMuted)
        }
        fetchedLabel?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = oak.textMuted) }
    }
}

@Composable
private fun UsageSourceLine(attribution: String) {
    val oak = LocalOakColors.current
    val parts = parseUsageAttribution(attribution)
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text("SOURCE", style = MaterialTheme.typography.labelSmall, color = oak.textMuted)
        Text(parts.source, style = MaterialTheme.typography.bodySmall, color = oak.text)
        parts.legal?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = oak.textMuted) }
    }
}
