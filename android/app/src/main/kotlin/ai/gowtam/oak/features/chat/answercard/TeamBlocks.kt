package ai.gowtam.oak.features.chat.answercard

import ai.gowtam.oak.app.LocalServices
import ai.gowtam.oak.ui.JetBrainsMonoFamily
import ai.gowtam.oak.ui.OakButton
import ai.gowtam.oak.ui.OakButtonStyle
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.ProposedTeam
import ai.gowtam.oak.wire.SavedTeamRef
import ai.gowtam.oak.wire.TeamMember
import ai.gowtam.oak.wire.TeamWarning
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/**
 * Renders an answer's team-builder blocks — the agent's `proposed_team` (with its
 * server-stamped `proposed_team_warnings`) and/or the `saved_team` reference for a team
 * persisted this turn. Mirrors the iOS `TeamBlocksView`:
 *  - **Proposed team** — member sets, warn-but-allow advisories (never blocking), an
 *    "Apply" button that calls [onApply] AND persists the team as a new saved team via
 *    [ai.gowtam.oak.app.LocalServices] (`TeamService.create`, P10 — ambient since this
 *    card renders several layers below the composition root, through files this phase
 *    doesn't own), swapping to an in-place "Saved"/"Saving…"/retry-on-failure
 *    confirmation, and an "Open team in viewer" action.
 *  - **Saved team** — the "Saved ✓" confirmation with "Open in viewer".
 * The caller gates it on `proposedTeam != null || savedTeam != null`.
 */
/** The "Apply" button's local save lifecycle (P10): [IDLE] shows the button, [SAVING]
 * shows a spinner while [ai.gowtam.oak.services.TeamService.create] is in flight,
 * [SAVED] shows the confirmation, [FAILED] shows an inline retry. */
private enum class ApplyState { IDLE, SAVING, SAVED, FAILED }

@Composable
fun TeamBlocks(
    proposedTeam: ProposedTeam?,
    proposedTeamWarnings: List<TeamWarning>,
    savedTeam: SavedTeamRef?,
    onApply: (ProposedTeam) -> Unit,
    onOpenSavedTeam: (SavedTeamRef) -> Unit,
    onOpenProposedTeam: (ProposedTeam) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(OakSpacing.md)) {
        if (proposedTeam != null) {
            ProposedCard(proposedTeam, proposedTeamWarnings, onApply, onOpenProposedTeam)
        }
        if (savedTeam != null) {
            SavedCard(savedTeam, onOpenSavedTeam)
        }
    }
}

@Composable
private fun ProposedCard(
    team: ProposedTeam,
    warnings: List<TeamWarning>,
    onApply: (ProposedTeam) -> Unit,
    onOpenProposedTeam: (ProposedTeam) -> Unit,
) {
    val oak = LocalOakColors.current
    val teamService = LocalServices.current?.teams
    val scope = rememberCoroutineScope()
    var applyState by remember { mutableStateOf(ApplyState.IDLE) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(lerp(oak.surfaceRaised, oak.accent, 0.08f), RoundedCornerShape(OakRadius.lg))
            .border(1.dp, oak.accent.copy(alpha = 0.25f), RoundedCornerShape(OakRadius.lg))
            .padding(OakSpacing.lg),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.md),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Groups, contentDescription = null, tint = oak.accent, modifier = Modifier.size(14.dp))
                    Text(
                        text = "Proposed team",
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                        color = oak.accent,
                    )
                }
                Text(
                    text = team.name,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = oak.textStrong,
                )
            }
            FormatBadge(team.format)
        }

        Column(verticalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
            team.members.forEachIndexed { index, member -> MemberRow(index, member) }
        }

        if (warnings.isNotEmpty()) {
            WarningsSection(warnings)
        }

        when (applyState) {
            ApplyState.SAVED -> {
                Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = oak.success, modifier = Modifier.size(18.dp))
                    Text(
                        text = "Saved to your Teams",
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                        color = oak.success,
                    )
                }
            }
            ApplyState.SAVING -> {
                Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = oak.accent)
                    Text("Saving…", style = MaterialTheme.typography.bodySmall, color = oak.textMuted)
                }
            }
            ApplyState.IDLE, ApplyState.FAILED -> {
                Column(verticalArrangement = Arrangement.spacedBy(OakSpacing.xs)) {
                    if (applyState == ApplyState.FAILED) {
                        Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.WarningAmber, contentDescription = null, tint = oak.warning, modifier = Modifier.size(14.dp))
                            Text("Couldn't save — try again.", style = MaterialTheme.typography.bodySmall, color = oak.warning)
                        }
                    }
                    OakButton(
                        onClick = {
                            val service = teamService
                            if (service == null) {
                                // Preview/test host with no TeamService — never fake success.
                                applyState = ApplyState.FAILED
                                return@OakButton
                            }
                            applyState = ApplyState.SAVING
                            scope.launch {
                                applyState = try {
                                    service.create(team.format, team.name, team.members)
                                    onApply(team)
                                    ApplyState.SAVED
                                } catch (e: Exception) {
                                    ApplyState.FAILED
                                }
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(if (applyState == ApplyState.FAILED) "Retry" else "Save")
                    }
                }
            }
        }

        OakButton(onClick = { onOpenProposedTeam(team) }, style = OakButtonStyle.Secondary) {
            Icon(Icons.Filled.OpenInNew, contentDescription = null, modifier = Modifier.size(18.dp), tint = oak.accent)
            Text(text = "Open team in viewer", color = oak.accent)
        }
    }
}

@Composable
private fun MemberRow(index: Int, member: TeamMember) {
    val oak = LocalOakColors.current
    val isEmpty = member.species.isNullOrBlank()
    val species = if (isEmpty) "Empty slot" else titleize(member.species)
    Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm), verticalAlignment = Alignment.Top) {
        Text(
            text = "${index + 1}",
            style = MaterialTheme.typography.labelSmall,
            color = oak.textMuted,
            fontFamily = JetBrainsMonoFamily,
        )
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            val item = member.item?.trim()
            val itemSuffix = if (!item.isNullOrEmpty()) " @ ${titleizeNonNull(item)}" else ""
            Text(
                text = species + itemSuffix,
                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                color = if (isEmpty) oak.textMuted else oak.textStrong,
            )
            abilityTeraLine(member)?.let { detail ->
                Text(text = detail, style = MaterialTheme.typography.bodySmall, color = oak.textMuted)
            }
            if (member.moves.isNotEmpty()) {
                Text(
                    text = member.moves.joinToString(", ") { titleizeNonNull(it) },
                    style = MaterialTheme.typography.bodySmall,
                    color = oak.textMuted,
                )
            }
        }
    }
}

private fun abilityTeraLine(member: TeamMember): String? {
    val parts = buildList {
        member.ability?.trim()?.takeIf { it.isNotEmpty() }?.let { add(titleizeNonNull(it)) }
        member.teraType?.trim()?.takeIf { it.isNotEmpty() }?.let { add("Tera ${titleizeNonNull(it)}") }
    }
    return parts.takeIf { it.isNotEmpty() }?.joinToString(" · ")
}

@Composable
private fun WarningsSection(warnings: List<TeamWarning>) {
    val oak = LocalOakColors.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(oak.warning.copy(alpha = 0.10f), RoundedCornerShape(OakRadius.md))
            .padding(OakSpacing.md),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.xs),
    ) {
        Text(
            text = "Legality",
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
            color = oak.textMuted,
        )
        for (warning in warnings) {
            val (icon, tint) = warningPresentation(warning, oak.info, oak.warning)
            Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm), verticalAlignment = Alignment.Top) {
                Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(14.dp))
                Text(text = warning.message, style = MaterialTheme.typography.bodySmall, color = oak.textStrong)
            }
        }
    }
}

@Composable
private fun SavedCard(team: SavedTeamRef, onOpenSavedTeam: (SavedTeamRef) -> Unit) {
    val oak = LocalOakColors.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(lerp(oak.surfaceRaised, oak.success, 0.08f), RoundedCornerShape(OakRadius.lg))
            .border(1.dp, oak.success.copy(alpha = 0.35f), RoundedCornerShape(OakRadius.lg))
            .padding(OakSpacing.lg),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = oak.success, modifier = Modifier.size(18.dp))
            Text(
                text = "  Saved to your Teams: ",
                style = MaterialTheme.typography.bodyMedium,
                color = oak.textMuted,
            )
            Text(
                text = team.name,
                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                color = oak.textStrong,
                modifier = Modifier.weight(1f),
            )
            FormatBadge(team.format)
        }
        OakButton(onClick = { onOpenSavedTeam(team) }, style = OakButtonStyle.Secondary) {
            Icon(Icons.Filled.OpenInNew, contentDescription = null, modifier = Modifier.size(18.dp), tint = oak.accent)
            Text(text = "Open in viewer", color = oak.accent)
        }
    }
}

@Composable
private fun FormatBadge(format: Format) {
    val oak = LocalOakColors.current
    Text(
        text = format.shortLabel,
        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
        color = oak.textMuted,
        modifier = Modifier
            .background(oak.surfaceRaised, RoundedCornerShape(OakRadius.pill))
            .padding(horizontal = OakSpacing.sm, vertical = 3.dp),
    )
}

private fun warningPresentation(
    warning: TeamWarning,
    info: Color,
    warning_: Color,
): Pair<ImageVector, Color> = when (warning.code) {
    TeamWarning.Code.Incomplete -> Icons.Filled.Info to info
    else -> Icons.Filled.WarningAmber to warning_
}

/** Title-cases a slug (`great-tusk` → `Great Tusk`); `null`/blank ⇒ `—`. */
internal fun titleize(slug: String?): String =
    if (slug.isNullOrBlank()) "—" else titleizeNonNull(slug)

/** Title-cases a non-null slug (`focus-sash` → `Focus Sash`). */
internal fun titleizeNonNull(slug: String): String =
    slug.split('-', ' ', '_')
        .filter { it.isNotEmpty() }
        .joinToString(" ") { it.replaceFirstChar { ch -> ch.uppercase() } }
