package ai.gowtam.oak.features.teams

import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.services.TeamService
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.Team
import ai.gowtam.oak.wire.TeamMember
import ai.gowtam.oak.wire.TeamSummary
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Signed-in Add-to-team picker / replace sheet (ADD-US-1–4). Guest hide lives
 * on the caller (AUTH-BR-1). Writes go through [TeamService] + [placeSpeciesOnTeam].
 */
class AddToTeamViewModel(
    private val teams: TeamService,
    private val incoming: TeamMember,
    private val conversationFormat: Format,
) : ViewModel() {

    sealed interface Phase {
        data object Loading : Phase
        data class Picker(val teams: List<TeamSummary>) : Phase
        data class Replace(val team: Team) : Phase
        data class Done(val teamId: String, val slotIndex: Int) : Phase
        data class Failed(val message: String) : Phase
    }

    private val _phase = MutableStateFlow<Phase>(Phase.Loading)
    val phase: StateFlow<Phase> = _phase.asStateFlow()

    private var pickerTeams: List<TeamSummary> = emptyList()

    fun load() {
        viewModelScope.launch {
            _phase.value = Phase.Loading
            try {
                val list = teams.list(null)
                pickerTeams = list
                _phase.value = Phase.Picker(list)
            } catch (e: Exception) {
                _phase.value = Phase.Failed(e.message?.takeIf { it.isNotBlank() } ?: "Couldn't load teams.")
            }
        }
    }

    fun pickTeam(id: String) {
        viewModelScope.launch {
            try {
                val (team, _) = teams.get(id)
                when (val placed = placeSpeciesOnTeam(team.members, incoming, PlaceOnTeamTarget.FirstEmpty)) {
                    is PlaceOnTeamResult.Ok -> {
                        teams.update(id, name = null, members = placed.members)
                        _phase.value = Phase.Done(id, placed.slotIndex)
                    }
                    PlaceOnTeamResult.Full -> _phase.value = Phase.Replace(team)
                }
            } catch (e: OakError.Http) {
                _phase.value = Phase.Failed(writeFailureMessage(e))
            } catch (e: Exception) {
                _phase.value = Phase.Failed("We couldn't add to that team.")
            }
        }
    }

    fun createNew(name: String?) {
        viewModelScope.launch {
            try {
                val (team, _) = teams.create(conversationFormat, name, listOf(incoming))
                _phase.value = Phase.Done(team.id, 0)
            } catch (e: Exception) {
                _phase.value = Phase.Failed("We couldn't create that team.")
            }
        }
    }

    fun replaceSlot(index: Int) {
        val current = _phase.value as? Phase.Replace ?: return
        viewModelScope.launch {
            try {
                val placed = placeSpeciesOnTeam(
                    current.team.members,
                    incoming,
                    PlaceOnTeamTarget.Replace(index),
                )
                if (placed is PlaceOnTeamResult.Ok) {
                    teams.update(current.team.id, name = null, members = placed.members)
                    _phase.value = Phase.Done(current.team.id, placed.slotIndex)
                }
            } catch (e: Exception) {
                _phase.value = Phase.Failed("We couldn't add to that team.")
            }
        }
    }

    fun cancelReplace() {
        _phase.value = Phase.Picker(pickerTeams)
    }

    fun dismiss() {
        // Caller closes the sheet; no writes.
    }

    private fun writeFailureMessage(error: OakError.Http): String {
        if (error.status == 404) {
            return error.message.takeIf { it.isNotBlank() } ?: "That team is gone."
        }
        return "We couldn't add to that team."
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddToTeamSheet(
    viewModel: AddToTeamViewModel,
    onDismiss: () -> Unit,
    onDone: (teamId: String, slotIndex: Int) -> Unit,
) {
    val phase by viewModel.phase.collectAsState()
    val oak = LocalOakColors.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    LaunchedEffect(Unit) { viewModel.load() }
    LaunchedEffect(phase) {
        val done = phase as? AddToTeamViewModel.Phase.Done ?: return@LaunchedEffect
        onDone(done.teamId, done.slotIndex)
    }

    ModalBottomSheet(
        onDismissRequest = {
            viewModel.dismiss()
            onDismiss()
        },
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        scrimColor = oak.scrim,
        tonalElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(OakSpacing.lg),
            verticalArrangement = Arrangement.spacedBy(OakSpacing.md),
        ) {
            Text(
                text = "Add to team",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                color = oak.textStrong,
            )
            when (val current = phase) {
                AddToTeamViewModel.Phase.Loading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
                }
                is AddToTeamViewModel.Phase.Picker -> {
                    TextButton(onClick = { viewModel.createNew(name = null) }) {
                        Text("Create new team")
                    }
                    if (current.teams.isEmpty()) {
                        Text("No saved teams yet.", color = oak.textMuted)
                    } else {
                        LazyColumn(verticalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
                            items(current.teams, key = { it.id }) { team ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { viewModel.pickTeam(team.id) }
                                        .padding(vertical = OakSpacing.sm),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Text(team.name, color = oak.textStrong)
                                    Text("${team.memberCount}/6", color = oak.textMuted)
                                }
                            }
                        }
                    }
                }
                is AddToTeamViewModel.Phase.Replace -> {
                    Text("This team is full. Choose a slot to replace.", color = oak.textMuted)
                    LazyColumn {
                        itemsIndexed(current.team.members) { index, member ->
                            Text(
                                text = member.species ?: "Empty slot",
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { viewModel.replaceSlot(index) }
                                    .padding(vertical = OakSpacing.sm),
                                color = oak.textStrong,
                            )
                        }
                    }
                    TextButton(onClick = { viewModel.cancelReplace() }) {
                        Text("Cancel")
                    }
                }
                is AddToTeamViewModel.Phase.Failed -> {
                    Text(current.message, color = oak.danger)
                    TextButton(onClick = { viewModel.load() }) { Text("Try again") }
                }
                is AddToTeamViewModel.Phase.Done -> Unit
            }
        }
    }
}
