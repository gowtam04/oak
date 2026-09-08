package ai.gowtam.oak.features.usage

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakButton
import ai.gowtam.oak.ui.OakButtonStyle
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.UsageEntry
import ai.gowtam.oak.wire.UsageLadder
import ai.gowtam.oak.wire.UsageLeaderboardRow
import ai.gowtam.oak.wire.UsageSpecies
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/**
 * Live Champions usage leaderboard (ADR-6 Dex section). Doubles default,
 * Singles second view. Click a row for species drill-in + Apply.
 */
@Composable
fun UsageLeaderboardScreen(
    viewModel: UsageLeaderboardViewModel,
    modifier: Modifier = Modifier,
    onApplySpecies: ((String) -> Unit)? = null,
    onOpenDex: ((EntityKind, String) -> Unit)? = null,
) {
    val state by viewModel.uiState.collectAsState()
    LaunchedEffect(viewModel) { viewModel.start() }

    val species = state.species
    if (species != null || state.speciesLoading) {
        BackHandler { viewModel.clearSpecies() }
        UsageSpeciesDetail(
            detail = species,
            loading = state.speciesLoading,
            onBack = viewModel::clearSpecies,
            onApply = onApplySpecies,
            onOpenDex = onOpenDex,
            modifier = modifier,
        )
        return
    }

    UsageLeaderboardList(
        state = state,
        onLadder = viewModel::setLadder,
        onOpen = viewModel::openSpecies,
        modifier = modifier,
    )
}

@Composable
private fun UsageLeaderboardList(
    state: UsageLeaderboardViewModel.UiState,
    onLadder: (UsageLadder) -> Unit,
    onOpen: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val oak = LocalOakColors.current
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = OakSpacing.md),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        Text(
            "Live Champions usage",
            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
            color = oak.textStrong,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs)) {
            FilterChip(
                selected = state.ladder == UsageLadder.Doubles,
                onClick = { onLadder(UsageLadder.Doubles) },
                label = { Text("Doubles") },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = oak.accentSoft,
                    selectedLabelColor = oak.accent,
                ),
            )
            FilterChip(
                selected = state.ladder == UsageLadder.Singles,
                onClick = { onLadder(UsageLadder.Singles) },
                label = { Text("Singles") },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = oak.accentSoft,
                    selectedLabelColor = oak.accent,
                ),
            )
        }
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            when {
                state.isLoading && state.rows.isEmpty() -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = oak.accent)
                }
                !state.available -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center).padding(OakSpacing.lg),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text("Usage unavailable", style = MaterialTheme.typography.titleMedium, color = oak.textStrong)
                        Text(
                            state.errorMessage ?: "The live Champions ladder is down. Try again later.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = oak.textMuted,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
                state.rows.isEmpty() -> {
                    Text(
                        "No usage rows for this ladder.",
                        modifier = Modifier.align(Alignment.Center).padding(OakSpacing.lg),
                        style = MaterialTheme.typography.bodyMedium,
                        color = oak.textMuted,
                        textAlign = TextAlign.Center,
                    )
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        if (state.season != null || state.fetchedAt != null) {
                            item(key = "snapshot") {
                                UsageSnapshotHeader(
                                    season = state.season,
                                    fetchedAt = state.fetchedAt,
                                )
                            }
                        }
                        items(state.rows, key = { it.slug }) { row ->
                            UsageRow(row, onClick = { onOpen(row.slug) })
                        }
                        val attribution = state.attribution?.takeIf { it.isNotBlank() }
                        if (attribution != null) {
                            item(key = "source") {
                                UsageSourceFooter(attribution)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun UsageSpeciesDetail(
    detail: UsageSpecies?,
    loading: Boolean,
    onBack: () -> Unit,
    onApply: ((String) -> Unit)?,
    onOpenDex: ((EntityKind, String) -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val oak = LocalOakColors.current
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = OakSpacing.md)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        TextButton(onClick = onBack) { Text("Back to usage") }
        Text(
            "Live Champions usage",
            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
            color = oak.accent,
        )
        when {
            loading && detail == null -> CircularProgressIndicator(color = oak.accent)
            detail == null -> Text("Couldn't load this species.", color = oak.textMuted)
            !detail.available -> {
                Text("Usage unavailable", style = MaterialTheme.typography.titleMedium, color = oak.textStrong)
                Text(
                    detail.error ?: "The live Champions ladder is down. Try again later.",
                    color = oak.textMuted,
                )
            }
            detail.found != true -> {
                Text(
                    detail.slug ?: "This Pokémon",
                    style = MaterialTheme.typography.titleMedium,
                    color = oak.textStrong,
                )
                Text("No live Champions set is listed for this species.", color = oak.textMuted)
                if (detail.suggestions.isNotEmpty()) {
                    Text("Did you mean: ${detail.suggestions.joinToString()}", color = oak.textMuted)
                }
            }
            else -> {
                val title = detail.savedName ?: detail.slug ?: "Species"
                Text(title, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold))
                if (detail.season != null || detail.fetchedAt != null) {
                    UsageSnapshotHeader(season = detail.season, fetchedAt = detail.fetchedAt)
                }
                detail.attribution?.takeIf { it.isNotBlank() }?.let { UsageSourceFooter(it) }
                if (onOpenDex != null) {
                    UsageDexLink.speciesRoute(detail.savedName ?: detail.slug.orEmpty())?.let { target ->
                        TextButton(onClick = { onOpenDex(target.kind, target.query) }) {
                            Text("View in Dex")
                        }
                    }
                }
                val slug = detail.slug
                if (onApply != null && !slug.isNullOrBlank()) {
                    OakButton(onClick = { onApply(slug) }, style = OakButtonStyle.Primary, modifier = Modifier.fillMaxWidth()) {
                        Text("Apply this Champions set")
                    }
                }
                UsageSection("Moves", detail.moves, UsageListKind.MOVES, onOpenDex)
                UsageSection("Items", detail.items, UsageListKind.ITEMS, onOpenDex)
                UsageSection("Abilities", detail.abilities, UsageListKind.ABILITIES, onOpenDex)
                UsageSection("Natures", detail.natures, UsageListKind.NATURES, onOpenDex)
                UsageSection("Spreads", detail.spreads, UsageListKind.SPREADS, onOpenDex)
                UsageSection("Teammates", detail.teammates, UsageListKind.TEAMMATES, onOpenDex)
            }
        }
    }
}

@Composable
private fun UsageSection(
    title: String,
    entries: List<UsageEntry>,
    kind: UsageListKind,
    onOpenDex: ((EntityKind, String) -> Unit)?,
) {
    if (entries.isEmpty()) return
    val oak = LocalOakColors.current
    Text(title, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold), color = oak.textStrong)
    for (entry in entries.take(8)) {
        val pct = entry.pct?.let { "${"%.1f".format(it)}%" } ?: "—"
        val target = UsageDexLink.route(kind, entry.name)
        val open = if (target != null && onOpenDex != null) {
            { onOpenDex(target.kind, target.query) }
        } else {
            null
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .then(
                    if (open != null) {
                        Modifier.clickable(onClick = open, onClickLabel = "Open in Dex")
                    } else {
                        Modifier
                    },
                )
                .padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
        ) {
            Text(
                entry.name,
                style = MaterialTheme.typography.bodyMedium,
                color = oak.text,
                modifier = Modifier.weight(1f),
            )
            Text(pct, style = MaterialTheme.typography.bodyMedium, color = oak.textMuted)
            if (open != null) {
                Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = oak.textMuted)
            }
        }
    }
}

@Composable
private fun UsageSnapshotHeader(season: String?, fetchedAt: Long?) {
    val oak = LocalOakColors.current
    val liveLine = listOfNotNull("Live", season?.takeIf { it.isNotBlank() }).joinToString(" · ")
    val fetchedLabel = fetchedAt?.let { formatUsageFetchedAt(it) }
    val spoken = buildString {
        append("Live Champions usage")
        season?.takeIf { it.isNotBlank() }?.let { append(", "); append(it) }
        fetchedLabel?.let { append(", updated "); append(it) }
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = OakSpacing.xs)
            .semantics { contentDescription = spoken },
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        if (liveLine.isNotEmpty()) {
            Text(
                liveLine.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = oak.textMuted,
            )
        }
        fetchedLabel?.let { label ->
            Text(label, style = MaterialTheme.typography.bodySmall, color = oak.textMuted)
        }
    }
}

@Composable
private fun UsageSourceFooter(attribution: String) {
    val oak = LocalOakColors.current
    val parts = parseUsageAttribution(attribution)
    val spoken = buildString {
        append("Source, ")
        append(parts.source)
        parts.legal?.let { append(", "); append(it) }
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = OakSpacing.sm)
            .semantics { contentDescription = spoken },
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text("SOURCE", style = MaterialTheme.typography.labelSmall, color = oak.textMuted)
        Text(parts.source, style = MaterialTheme.typography.bodySmall, color = oak.text)
        parts.legal?.let { legal ->
            Text(legal, style = MaterialTheme.typography.bodySmall, color = oak.textMuted)
        }
    }
}

@Composable
private fun UsageRow(row: UsageLeaderboardRow, onClick: () -> Unit) {
    val oak = LocalOakColors.current
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, shape)
            .border(1.dp, oak.border, shape)
            .clickable(onClick = onClick)
            .padding(horizontal = OakSpacing.md, vertical = OakSpacing.md),
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "#${row.rank}",
            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
            color = oak.textMuted,
        )
        Text(
            text = row.name,
            style = MaterialTheme.typography.bodyLarge,
            color = oak.text,
            modifier = Modifier.weight(1f),
        )
        row.usagePct?.let { pct ->
            Text(
                text = "${"%.1f".format(pct)}%",
                style = MaterialTheme.typography.labelLarge,
                color = oak.textMuted,
            )
        }
    }
}
