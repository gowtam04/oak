package ai.gowtam.oak.features.teams

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakButton
import ai.gowtam.oak.ui.OakButtonStyle
import ai.gowtam.oak.ui.MarkdownBlockView
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.rememberHaptics
import ai.gowtam.oak.wire.TeamPatch
import ai.gowtam.oak.wire.describeTeamPatch
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/**
 * The team-builder assistant, presented from the team editor's toolbar as a
 * `ModalBottomSheet` (history-and-teams.md D-AC-TEAM2.1) — Android's stand-in for web's
 * docked `TeamsAssistantPanel.tsx` / iOS's `TeamsAssistantSheet`.
 *
 * A deliberately lean chat surface (NOT the full `AnswerCard` tree): user bubbles,
 * streamed assistant Markdown, a tool-activity ticker, and — when an answer proposes a
 * `TeamPatch` — a "Proposed changes" card with Apply/Undo. Apply mutates the editor's
 * in-memory draft only ([TeamsAssistantViewModel.apply]); the user still reviews and
 * Saves. All state lives in the injected [viewModel].
 */
@Composable
fun TeamsAssistantSheet(
    viewModel: TeamsAssistantViewModel,
    onDone: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by viewModel.uiState.collectAsState()
    var input by remember { mutableStateOf("") }
    val oak = LocalOakColors.current
    val haptics = rememberHaptics()

    // A mid-stream dismiss (system back, tap-outside, or Done) cancels the in-flight
    // turn and resets the status so the panel can never get stuck "thinking".
    DisposableEffect(viewModel) { onDispose { viewModel.cancel() } }

    LaunchedEffect(state.errorMessage != null) {
        if (state.errorMessage != null) haptics.error()
    }

    Column(modifier = modifier.fillMaxWidth().heightIn(min = 420.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = OakSpacing.lg, vertical = OakSpacing.md),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "Team assistant",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                modifier = Modifier.semantics { heading() },
            )
            TextButton(onClick = onDone) { Text("Done") }
        }
        HorizontalDivider()

        LazyColumn(
            modifier = Modifier.weight(1f, fill = false).fillMaxWidth().padding(OakSpacing.lg),
            verticalArrangement = Arrangement.spacedBy(OakSpacing.md),
        ) {
            if (state.turns.isEmpty() && state.status != AssistantStatus.THINKING) {
                item { IntroBlock(onSuggestion = viewModel::send) }
            }
            items(state.turns, key = { it.id }) { turn -> TurnBlock(turn, state, viewModel) }
            if (state.status == AssistantStatus.THINKING) {
                item { PendingBlock(activity = state.activity, streamingMarkdown = state.streamingMarkdown) }
            }
            state.errorMessage?.let { message ->
                item {
                    ErrorRow(
                        message,
                        onRetry = if (state.errorIsRetryable) viewModel::retry else null,
                    )
                }
            }
        }
        HorizontalDivider()

        ComposerRow(
            input = input,
            onInputChange = { input = it },
            canSend = viewModel.canSend(input),
            onSend = {
                val text = input
                input = ""
                viewModel.send(text)
            },
        )
    }
}

@Composable
private fun IntroBlock(onSuggestion: (String) -> Unit) {
    val oak = LocalOakColors.current
    Column(verticalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
        Text(
            text = "I can see the team you have open. Ask me to fill a slot, fix a moveset, " +
                "check your coverage, or suggest a spread — edits apply to your unsaved draft, " +
                "and you keep the Save button.",
            style = MaterialTheme.typography.bodyMedium,
            color = oak.textMuted,
        )
        Text(
            text = "TRY ASKING",
            style = MaterialTheme.typography.labelSmall,
            color = oak.textMuted,
        )
        Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
            for (suggestion in TeamsAssistantViewModel.suggestions) {
                OakButton(onClick = { onSuggestion(suggestion) }, style = OakButtonStyle.Secondary) { Text(suggestion) }
            }
        }
    }
}

@Composable
private fun TurnBlock(turn: AssistantTurn, state: TeamsAssistantUiState, viewModel: TeamsAssistantViewModel) {
    val oak = LocalOakColors.current
    Column(verticalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            Text(
                text = turn.user,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier
                    .background(oak.accent.copy(alpha = 0.14f), RoundedCornerShape(OakRadius.md))
                    .padding(horizontal = OakSpacing.md, vertical = OakSpacing.sm),
            )
        }
        turn.answer?.let { answer ->
            MarkdownBlockView(answer.answerMarkdown)
            val patch = answer.teamPatch
            if (patch != null && hasVisibleChanges(patch)) {
                val haptics = rememberHaptics()
                PatchCard(
                    patch = patch,
                    applied = turn.id in state.appliedTurnIds,
                    isLastApplied = state.lastAppliedTurnId == turn.id,
                    onApply = { haptics.success(); viewModel.apply(turn) },
                    onUndo = viewModel::undo,
                )
            }
        }
    }
}

private fun hasVisibleChanges(patch: TeamPatch): Boolean = patch.slots.isNotEmpty() || patch.name != null

@Composable
private fun PatchCard(
    patch: TeamPatch,
    applied: Boolean,
    isLastApplied: Boolean,
    onApply: () -> Unit,
    onUndo: () -> Unit,
) {
    val oak = LocalOakColors.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(oak.surfaceRaised, RoundedCornerShape(OakRadius.md))
            .padding(OakSpacing.md),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        Text(
            "Proposed changes",
            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
            modifier = Modifier.semantics { heading() },
        )
        Column(verticalArrangement = Arrangement.spacedBy(OakSpacing.xs)) {
            for (line in describeTeamPatch(patch)) {
                Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs)) {
                    Text("↳", color = oak.textMuted, style = MaterialTheme.typography.bodySmall)
                    Text(line, style = MaterialTheme.typography.bodySmall, color = oak.textStrong)
                }
            }
        }
        if (applied) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
                Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = oak.success, modifier = Modifier.size(16.dp))
                Text("Applied to draft", style = MaterialTheme.typography.labelMedium, color = oak.success)
                if (isLastApplied) {
                    OakButton(onClick = onUndo, style = OakButtonStyle.Secondary) { Text("Undo") }
                }
            }
        } else {
            OakButton(onClick = onApply) {
                Text("Apply to draft")
            }
        }
    }
}

@Composable
private fun PendingBlock(activity: String?, streamingMarkdown: String) {
    val oak = LocalOakColors.current
    if (streamingMarkdown.isEmpty()) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = oak.accent)
            Text(activity ?: "Thinking…", style = MaterialTheme.typography.bodyMedium, color = oak.textMuted)
        }
    } else {
        MarkdownBlockView(streamingMarkdown)
    }
}

@Composable
private fun ErrorRow(message: String, onRetry: (() -> Unit)?) {
    val oak = LocalOakColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(oak.warning.copy(alpha = 0.10f), RoundedCornerShape(OakRadius.md))
            .padding(OakSpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        Icon(Icons.Filled.WarningAmber, contentDescription = null, tint = oak.warning, modifier = Modifier.size(18.dp))
        Text(message, style = MaterialTheme.typography.bodySmall, color = oak.textStrong, modifier = Modifier.weight(1f))
        if (onRetry != null) {
            TextButton(onClick = onRetry) { Text("Retry") }
        }
    }
}

@Composable
private fun ComposerRow(input: String, onInputChange: (String) -> Unit, canSend: Boolean, onSend: () -> Unit) {
    val scope = rememberCoroutineScope()
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = OakSpacing.lg, vertical = OakSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        OutlinedTextField(
            value = input,
            onValueChange = onInputChange,
            placeholder = { Text("Ask about this team…") },
            modifier = Modifier.weight(1f),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
            keyboardActions = KeyboardActions(onSend = { if (canSend) scope.launch { onSend() } }),
        )
        IconButton(onClick = { if (canSend) onSend() }, enabled = canSend) {
            Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send")
        }
    }
}
