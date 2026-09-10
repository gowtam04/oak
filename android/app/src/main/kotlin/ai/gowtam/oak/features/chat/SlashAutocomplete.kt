package ai.gowtam.oak.features.chat

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.TeamSummary
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

/**
 * Composer `/` picker (SD-AC-1.1, SD-AC-8.6). Command rows, Dex/Usage name
 * rows, or an empty line, plus the insert caption. Tap inserts; the parent
 * hops on Send.
 */
@Composable
fun SlashAutocomplete(
    onPickCommand: (String) -> Unit,
    modifier: Modifier = Modifier,
    commands: List<SlashCommandRow> = emptyList(),
    names: List<DexNameRow> = emptyList(),
    teams: List<TeamSummary> = emptyList(),
    empty: String? = null,
    guest: Boolean = false,
    caption: String = PICKER_CAPTION,
    skipMove: Boolean = false,
    onPickName: (DexNameRow) -> Unit = {},
    onPickTeam: (TeamSummary) -> Unit = {},
    onSkipMove: () -> Unit = {},
) {
    val oak = LocalOakColors.current
    val shape = RoundedCornerShape(OakRadius.md)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .testTag("slash-autocomplete")
            .semantics(mergeDescendants = false) {
                contentDescription = "Slash commands"
                role = Role.DropdownList
            }
            .background(MaterialTheme.colorScheme.surface, shape)
            .border(1.dp, oak.border, shape)
            .padding(vertical = OakSpacing.xs),
    ) {
        Text(
            text = caption,
            style = MaterialTheme.typography.bodySmall,
            color = oak.textMuted,
            modifier = Modifier.padding(horizontal = OakSpacing.md, vertical = OakSpacing.xs),
        )
        when {
            commands.isNotEmpty() -> {
                for (row in commands) {
                    val hint = if (guest) row.hintGuest ?: row.hint else row.hint
                    Text(
                        text = "${row.token}  $hint",
                        style = MaterialTheme.typography.bodyMedium,
                        color = oak.textStrong,
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics {
                                role = Role.Button
                                contentDescription = "${row.token} $hint"
                            }
                            .clickable { onPickCommand(row.token) }
                            .padding(horizontal = OakSpacing.md, vertical = OakSpacing.sm),
                    )
                }
            }
            skipMove || names.isNotEmpty() -> {
                if (skipMove) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("slash-ac-skip-move")
                            .semantics {
                                role = Role.Button
                                contentDescription = "$CALC_SKIP_MOVE $CALC_SKIP_MOVE_HINT"
                            }
                            .clickable { onSkipMove() }
                            .padding(horizontal = OakSpacing.md, vertical = OakSpacing.sm),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = CALC_SKIP_MOVE,
                            style = MaterialTheme.typography.bodyMedium,
                            color = oak.textStrong,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            text = CALC_SKIP_MOVE_HINT,
                            style = MaterialTheme.typography.bodySmall,
                            color = oak.textMuted,
                        )
                    }
                }
                for (row in names) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics {
                                role = Role.Button
                                contentDescription = "${row.displayName} ${row.kind.label()}"
                            }
                            .clickable { onPickName(row) }
                            .padding(horizontal = OakSpacing.md, vertical = OakSpacing.sm),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = row.displayName,
                            style = MaterialTheme.typography.bodyMedium,
                            color = oak.textStrong,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            text = row.kind.label(),
                            style = MaterialTheme.typography.bodySmall,
                            color = oak.textMuted,
                        )
                    }
                }
            }
            teams.isNotEmpty() -> {
                for (team in teams) {
                    Text(
                        text = team.name,
                        style = MaterialTheme.typography.bodyMedium,
                        color = oak.textStrong,
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics { role = Role.Button }
                            .clickable { onPickTeam(team) }
                            .padding(horizontal = OakSpacing.md, vertical = OakSpacing.sm),
                    )
                }
            }
            empty != null -> {
                Text(
                    text = empty,
                    style = MaterialTheme.typography.bodySmall,
                    color = oak.textMuted,
                    modifier = Modifier.padding(horizontal = OakSpacing.md, vertical = OakSpacing.sm),
                )
            }
        }
    }
}
