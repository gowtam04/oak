package ai.gowtam.oak.features.chat.answercard

import ai.gowtam.oak.ui.JetBrainsMonoFamily
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.SpriteImage
import ai.gowtam.oak.ui.TypeBadge
import ai.gowtam.oak.wire.CandidateRow
import ai.gowtam.oak.wire.Candidates
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Renders the `candidates` block as a native, horizontally-scrollable table. Columns:
 * Pokémon (sprite + name + dex) · Types (badges) · the six base stats (or the union of
 * `key_stats` keys when no row carries `base_stats`) · Ability. The wire `sort` column is
 * highlighted with a directional caret **and** bolder figures (never color alone). A
 * `truncated` set shows "Showing N of total" and a "Show all N" control. When the server
 * populated `candidates.hidden_rows` (the full remainder, ≤200 rows total), tapping "Show
 * all" expands the table LOCALLY — no follow-up chat message is sent — and the footer
 * disappears just as it does for an already-complete set. Otherwise it falls back to
 * [onShowAll], which sends a follow-up asking for the full set. Rows open the Pokémon;
 * type chips open the type. The caller gates it on non-empty rows.
 */
@Composable
fun CandidatesTable(
    candidates: Candidates,
    onOpenPokemon: (String) -> Unit,
    onOpenType: (String) -> Unit,
    onShowAll: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val oak = LocalOakColors.current
    var expandedLocally by rememberSaveable { mutableStateOf(false) }
    val canExpandLocally = !candidates.hiddenRows.isNullOrEmpty()
    val displayedRows = if (expandedLocally && canExpandLocally) {
        candidates.shown + candidates.hiddenRows.orEmpty()
    } else {
        candidates.shown
    }
    val statColumns = statColumns(displayedRows)
    val showsAbility = displayedRows.any { !it.ability.isNullOrEmpty() }
    val sortedId = sortedColumnId(candidates, statColumns)
    val ascending = candidates.sort?.lowercase()?.contains("asc") == true

    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
        Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.TableChart, contentDescription = null, tint = oak.accent, modifier = Modifier.size(16.dp))
            Text(
                text = "Candidates",
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                color = oak.textStrong,
            )
            sortLabel(candidates, statColumns, sortedId)?.let {
                Text(text = "· sorted by $it", style = MaterialTheme.typography.bodySmall, color = oak.textMuted)
            }
        }

        Column(
            modifier = Modifier
                .border(1.dp, oak.border, RoundedCornerShape(OakRadius.md))
                .horizontalScroll(rememberScrollState()),
        ) {
            // Header
            Row(modifier = Modifier.background(oak.textStrong.copy(alpha = 0.06f))) {
                HeaderCell("Pokémon", COL_POKEMON, TextAlign.Start)
                HeaderCell("Types", COL_TYPES, TextAlign.Start)
                for (column in statColumns) {
                    StatHeaderCell(column.label, sorted = column.id == sortedId, ascending = ascending)
                }
                if (showsAbility) HeaderCell("Ability", COL_ABILITY, TextAlign.Start)
            }
            // Rows
            displayedRows.forEachIndexed { index, row ->
                val rowBackground = if (index % 2 == 0) androidx.compose.ui.graphics.Color.Transparent else oak.textStrong.copy(alpha = 0.04f)
                Row(modifier = Modifier.background(rowBackground)) {
                    // Pokémon cell (tappable)
                    Box(
                        modifier = Modifier
                            .width(COL_POKEMON)
                            .clickable { onOpenPokemon(row.name) }
                            .padding(horizontal = OakSpacing.md, vertical = OakSpacing.sm),
                    ) {
                        Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                            SpriteImage(url = row.spriteUrl, name = row.name, size = 32.dp)
                            Column {
                                Text(
                                    text = row.name,
                                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                                    color = oak.textStrong,
                                )
                                row.dexNumber?.let {
                                    Text(text = dexLabel(it), style = MaterialTheme.typography.labelSmall, color = oak.textMuted, fontFamily = JetBrainsMonoFamily)
                                }
                            }
                        }
                    }
                    // Types cell (per-chip tappable)
                    Row(
                        modifier = Modifier.width(COL_TYPES).padding(horizontal = OakSpacing.md, vertical = OakSpacing.sm),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        for (type in row.types) {
                            Box(modifier = Modifier.clickable { onOpenType(type) }) { TypeBadge(type = type) }
                        }
                    }
                    // Stat cells (row-tappable)
                    for (column in statColumns) {
                        val sorted = column.id == sortedId
                        Box(
                            modifier = Modifier
                                .width(COL_STAT)
                                .clickable { onOpenPokemon(row.name) }
                                .padding(horizontal = OakSpacing.sm, vertical = OakSpacing.sm),
                            contentAlignment = Alignment.CenterEnd,
                        ) {
                            Text(
                                text = column.value(row),
                                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = if (sorted) FontWeight.SemiBold else FontWeight.Normal),
                                fontFamily = JetBrainsMonoFamily,
                                color = if (sorted) oak.textStrong else oak.textMuted,
                            )
                        }
                    }
                    if (showsAbility) {
                        val ability = row.ability
                        Box(
                            modifier = Modifier.width(COL_ABILITY).clickable { onOpenPokemon(row.name) }.padding(horizontal = OakSpacing.md, vertical = OakSpacing.sm),
                        ) {
                            Text(
                                text = if (ability.isNullOrEmpty()) "—" else ability,
                                style = MaterialTheme.typography.bodyMedium,
                                color = if (ability.isNullOrEmpty()) oak.textMuted else oak.textStrong,
                            )
                        }
                    }
                }
            }
        }

        // A local expansion behaves like an already-complete set: no footer at all,
        // matching the wording (or lack of it) the component uses when `truncated`
        // is false — the button disappears along with it.
        if (candidates.truncated && !(expandedLocally && canExpandLocally)) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "Showing ${displayedRows.size} of ${candidates.totalCount} — refine to narrow.",
                    style = MaterialTheme.typography.bodySmall,
                    color = oak.textMuted,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = { if (canExpandLocally) expandedLocally = true else onShowAll() }) {
                    Text(text = "Show all ${candidates.totalCount}", color = oak.accent)
                }
            }
        }
    }
}

@Composable
private fun HeaderCell(text: String, width: Dp, align: TextAlign) {
    val oak = LocalOakColors.current
    Box(modifier = Modifier.width(width).padding(horizontal = OakSpacing.md, vertical = OakSpacing.sm)) {
        Text(
            text = text.uppercase(),
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
            color = oak.textMuted,
            textAlign = align,
        )
    }
}

@Composable
private fun StatHeaderCell(label: String, sorted: Boolean, ascending: Boolean) {
    val oak = LocalOakColors.current
    Row(
        modifier = Modifier.width(COL_STAT).padding(horizontal = OakSpacing.sm, vertical = OakSpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(2.dp, Alignment.End),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label.uppercase(),
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = if (sorted) FontWeight.Bold else FontWeight.SemiBold),
            color = if (sorted) oak.textStrong else oak.textMuted,
        )
        if (sorted) {
            Icon(
                imageVector = if (ascending) Icons.Filled.ArrowUpward else Icons.Filled.ArrowDownward,
                contentDescription = null,
                tint = oak.textStrong,
                modifier = Modifier.size(12.dp),
            )
        }
    }
}

/** One stat column: a stable `id` (for sort matching), a display `label`, and its cell text. */
private class StatColumn(val id: String, val label: String, val value: (CandidateRow) -> String)

/** The fixed six base stats when any row carries them, else the alphabetical key_stats union. */
private fun statColumns(rows: List<CandidateRow>): List<StatColumn> {
    if (rows.any { it.baseStats != null }) {
        return listOf(
            StatColumn("hp", "HP") { it.baseStats?.hp?.toString() ?: "—" },
            StatColumn("attack", "Atk") { it.baseStats?.atk?.toString() ?: "—" },
            StatColumn("defense", "Def") { it.baseStats?.def?.toString() ?: "—" },
            StatColumn("special_attack", "SpA") { it.baseStats?.spa?.toString() ?: "—" },
            StatColumn("special_defense", "SpD") { it.baseStats?.spd?.toString() ?: "—" },
            StatColumn("speed", "Spe") { it.baseStats?.spe?.toString() ?: "—" },
        )
    }
    val keys = sortedSetOf<String>()
    for (row in rows) row.keyStats?.keys?.let { keys.addAll(it) }
    return keys.map { key ->
        StatColumn(key.lowercase(), prettyKey(key)) { row -> row.keyStats?.get(key)?.let { scalarDisplayText(it) } ?: "—" }
    }
}

/** The id of the stat column the set is sorted by (exact match, or `<id> <direction>`). */
private fun sortedColumnId(candidates: Candidates, statColumns: List<StatColumn>): String? {
    val sort = candidates.sort?.lowercase()?.takeIf { it.isNotEmpty() } ?: return null
    return statColumns.firstOrNull { sort == it.id || sort.startsWith(it.id + " ") }?.id
}

private fun sortLabel(candidates: Candidates, statColumns: List<StatColumn>, sortedId: String?): String? {
    val sort = candidates.sort?.takeIf { it.isNotEmpty() } ?: return null
    return statColumns.firstOrNull { it.id == sortedId }?.label ?: sort
}

/** `special_attack` → `Special Attack`. */
private fun prettyKey(key: String): String =
    key.split('_', ' ').filter { it.isNotEmpty() }.joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }

private val COL_POKEMON = 168.dp
private val COL_TYPES = 128.dp
private val COL_STAT = 56.dp
private val COL_ABILITY = 132.dp
