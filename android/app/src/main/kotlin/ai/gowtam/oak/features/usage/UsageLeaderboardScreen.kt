package ai.gowtam.oak.features.usage

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.UsageLadder
import ai.gowtam.oak.wire.UsageLeaderboardRow
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import java.text.DateFormat
import java.util.Date

/**
 * Live Champions usage leaderboard (ADR-6 Dex section). Doubles default,
 * Singles second view. Fail-soft when unavailable — never a Smogon OU board.
 */
@Composable
fun UsageLeaderboardScreen(
    viewModel: UsageLeaderboardViewModel,
    modifier: Modifier = Modifier,
) {
    val state by viewModel.uiState.collectAsState()
    val oak = LocalOakColors.current
    LaunchedEffect(viewModel) { viewModel.start() }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = OakSpacing.md),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs)) {
            FilterChip(
                selected = state.ladder == UsageLadder.Doubles,
                onClick = { viewModel.setLadder(UsageLadder.Doubles) },
                label = { Text("Doubles") },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = oak.accentSoft,
                    selectedLabelColor = oak.accent,
                ),
            )
            FilterChip(
                selected = state.ladder == UsageLadder.Singles,
                onClick = { viewModel.setLadder(UsageLadder.Singles) },
                label = { Text("Singles") },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = oak.accentSoft,
                    selectedLabelColor = oak.accent,
                ),
            )
        }
        val asOf = buildString {
            state.season?.takeIf { it.isNotBlank() }?.let { append(it) }
            state.fetchedAt?.let { fetched ->
                if (isNotEmpty()) append(" · ")
                append(DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(fetched)))
            }
        }
        if (asOf.isNotEmpty()) {
            Text(asOf, style = MaterialTheme.typography.labelSmall, color = oak.textMuted)
        }
        state.attribution?.takeIf { it.isNotBlank() }?.let { attr ->
            Text(attr, style = MaterialTheme.typography.labelSmall, color = oak.textMuted)
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
                        items(state.rows, key = { it.slug }) { row ->
                            UsageRow(row)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun UsageRow(row: UsageLeaderboardRow) {
    val oak = LocalOakColors.current
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, shape)
            .border(1.dp, oak.border, shape)
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
