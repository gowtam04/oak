package ai.gowtam.oak.features.teams

import ai.gowtam.oak.app.AppState
import ai.gowtam.oak.app.ServiceContainer
import ai.gowtam.oak.features.auth.AuthDialog
import ai.gowtam.oak.features.auth.AuthViewModel
import ai.gowtam.oak.services.AuthState
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.Team
import ai.gowtam.oak.wire.TeamSummary
import ai.gowtam.oak.wire.titleizeTeamSlug
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/**
 * The Teams tab's root: gates on sign-in (history-and-teams.md D-TEAM-1 — teams are
 * signed-in only; a guest sees a sign-in prompt, never a 401), then owns the small
 * list ⟷ editor navigation for the tab (mirrors iOS `TeamsListView`'s
 * `navigationDestination`; there is no shared app-wide `NavHost` for this yet, so the
 * tab manages its own two-screen stack with a system-back handler).
 *
 * This is the single entry point [ai.gowtam.oak.app.OakApp] swaps in for the Teams
 * tab's placeholder.
 */
@Composable
fun TeamsRoute(services: ServiceContainer, appState: AppState, modifier: Modifier = Modifier) {
    val authState by appState.authState.collectAsState()
    if (authState !is AuthState.SignedIn) {
        TeamsSignInPrompt(services = services, appState = appState, modifier = modifier)
        return
    }

    val listViewModel = remember(services) { TeamsListViewModel(services.teams, services.dexLookup) }
    var destination by rememberSaveable(services) { mutableStateOf(0) } // 0 = list, 1 = editor
    var editorViewModel by remember { mutableStateOf<TeamEditorViewModel?>(null) }
    var loadsOnAppear by remember { mutableStateOf(false) }

    fun openEditor(vm: TeamEditorViewModel, loadOnAppear: Boolean) {
        editorViewModel = vm
        loadsOnAppear = loadOnAppear
        destination = 1
    }

    fun backToList() {
        destination = 0
        editorViewModel = null
        listViewModel.reload()
    }

    BackHandler(enabled = destination == 1) { backToList() }

    val activeEditor = editorViewModel
    if (destination == 1 && activeEditor != null) {
        TeamEditor(
            viewModel = activeEditor,
            teamsAssistantService = services.teamsAssistant,
            loadsOnAppear = loadsOnAppear,
            onBack = ::backToList,
            modifier = modifier,
        )
    } else {
        TeamsListScreen(
            viewModel = listViewModel,
            onOpenNew = { format -> openEditor(listViewModel.makeEditor(format), loadOnAppear = false) },
            onOpenExisting = { summary -> openEditor(listViewModel.makeEditor(summary), loadOnAppear = true) },
            onOpenCreated = { team -> openEditor(listViewModel.makeEditor(team), loadOnAppear = false) },
            modifier = modifier,
        )
    }
}

/** The signed-in gate (history-and-teams.md D-TEAM-1): saved teams, the team builder,
 * and Showdown import/export all unlock with a free account — mirrors iOS
 * `TeamsListView.guestState`/web's `/teams` gate copy. */
@Composable
private fun TeamsSignInPrompt(services: ServiceContainer, appState: AppState, modifier: Modifier = Modifier) {
    var showSignIn by remember { mutableStateOf(false) }
    val oak = LocalOakColors.current

    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(OakSpacing.md)) {
            Icon(Icons.Filled.Groups, contentDescription = null, tint = oak.accent, modifier = Modifier.size(64.dp))
            Text("Sign in to build teams", style = MaterialTheme.typography.titleLarge)
            Text(
                text = "Saved teams, the team builder, and Showdown import/export unlock with a free account.",
                style = MaterialTheme.typography.bodyMedium,
                color = oak.textMuted,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = OakSpacing.xl),
            )
            Button(onClick = { showSignIn = true }) { Text("Sign in") }
        }
    }

    if (showSignIn) {
        val authViewModel = remember { AuthViewModel(services.auth, appState) }
        AuthDialog(viewModel = authViewModel, onDismissRequest = { showSignIn = false })
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TeamsListScreen(
    viewModel: TeamsListViewModel,
    onOpenNew: (Format) -> Unit,
    onOpenExisting: (TeamSummary) -> Unit,
    onOpenCreated: (Team) -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by viewModel.uiState.collectAsState()
    var isImporting by remember { mutableStateOf(false) }
    var showAddMenu by remember { mutableStateOf(false) }
    var showFilterMenu by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { viewModel.reload() }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Teams") },
                navigationIcon = {
                    Box {
                        IconButton(onClick = { showFilterMenu = true }) { Icon(Icons.Filled.FilterList, contentDescription = "Filter") }
                        DropdownMenu(expanded = showFilterMenu, onDismissRequest = { showFilterMenu = false }) {
                            DropdownMenuItem(
                                text = { Text("All formats") },
                                onClick = { viewModel.setFormatFilter(null); showFilterMenu = false },
                                leadingIcon = if (state.formatFilter == null) { { Icon(Icons.Filled.Check, contentDescription = null) } } else null,
                            )
                            Format.knownCases.forEach { fmt ->
                                DropdownMenuItem(
                                    text = { Text(fmt.shortLabel) },
                                    onClick = { viewModel.setFormatFilter(fmt); showFilterMenu = false },
                                    leadingIcon = if (state.formatFilter == fmt) { { Icon(Icons.Filled.Check, contentDescription = null) } } else null,
                                )
                            }
                        }
                    }
                },
                actions = {
                    Box {
                        IconButton(onClick = { showAddMenu = true }) { Icon(Icons.Filled.Add, contentDescription = "Add team") }
                        DropdownMenu(expanded = showAddMenu, onDismissRequest = { showAddMenu = false }) {
                            Format.knownCases.forEach { fmt ->
                                DropdownMenuItem(
                                    text = { Text("New ${fmt.shortLabel} team") },
                                    onClick = { showAddMenu = false; onOpenNew(fmt) },
                                )
                            }
                            HorizontalDivider()
                            DropdownMenuItem(
                                text = { Text("Import from Showdown") },
                                onClick = { showAddMenu = false; isImporting = true },
                            )
                        }
                    }
                },
            )
        },
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            when {
                state.teams.isEmpty() && state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                state.teams.isEmpty() -> EmptyState(formatFilter = state.formatFilter)
                else -> LazyColumn {
                    items(state.teams, key = { it.id }) { team ->
                        TeamRow(
                            team = team,
                            onClick = { onOpenExisting(team) },
                            onDuplicate = { viewModel.duplicate(team) { created -> onOpenCreated(created) } },
                            onDelete = { viewModel.delete(team) },
                        )
                    }
                }
            }
            state.errorMessage?.let { message ->
                TeamsErrorBanner(
                    message = message,
                    onDismiss = viewModel::dismissError,
                    modifier = Modifier.align(Alignment.BottomCenter).padding(OakSpacing.md),
                )
            }
        }
    }

    if (isImporting) {
        ShowdownImportDialog(
            initialFormat = state.formatFilter ?: Format.ScarletViolet,
            onImport = { paste, format, onResult -> viewModel.importPaste(paste, format, onResult) },
            onDismiss = { isImporting = false; viewModel.reload() },
        )
    }
}

@Composable
private fun EmptyState(formatFilter: Format?) {
    val oak = LocalOakColors.current
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
            Icon(Icons.Filled.Groups, contentDescription = null, tint = oak.textMuted, modifier = Modifier.size(56.dp))
            Text(
                text = if (formatFilter == null) "No teams yet" else "No teams in this format",
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                text = "Create a team with the + button, or import one from Showdown.",
                style = MaterialTheme.typography.bodyMedium,
                color = oak.textMuted,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = OakSpacing.xl),
            )
        }
    }
}

/** One team row: a six-slot roster indicator, name, a format tag, and a glanceable
 * composition summary. Color is never the sole signal — the format is shown as text. */
@Composable
private fun TeamRow(team: TeamSummary, onClick: () -> Unit, onDuplicate: () -> Unit, onDelete: () -> Unit) {
    val oak = LocalOakColors.current
    var showMenu by remember { mutableStateOf(false) }

    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(horizontal = OakSpacing.lg, vertical = OakSpacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(OakSpacing.md),
        ) {
            SlotIndicator(team.memberCount)
            Column(modifier = Modifier.weight(1f)) {
                Text(team.name, style = MaterialTheme.typography.bodyLarge, maxLines = 1)
                Text(
                    text = "${team.format.shortLabel} · ${compositionLabel(team)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = oak.textMuted,
                    maxLines = 1,
                )
            }
            Box {
                IconButton(onClick = { showMenu = true }) { Icon(Icons.Filled.MoreVert, contentDescription = "More") }
                DropdownMenu(expanded = showMenu, onDismissRequest = { showMenu = false }) {
                    DropdownMenuItem(text = { Text("Edit") }, onClick = { showMenu = false; onClick() })
                    DropdownMenuItem(text = { Text("Duplicate") }, onClick = { showMenu = false; onDuplicate() })
                    DropdownMenuItem(text = { Text("Delete") }, onClick = { showMenu = false; onDelete() })
                }
            }
        }
        HorizontalDivider()
    }
}

@Composable
private fun SlotIndicator(memberCount: Int) {
    val oak = LocalOakColors.current
    Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        for (slot in 0 until 6) {
            val filled = slot < memberCount
            Box(
                modifier = if (filled) {
                    Modifier.size(8.dp).background(oak.accent.copy(alpha = 0.4f), CircleShape)
                } else {
                    Modifier.size(8.dp).border(1.dp, oak.textMuted, CircleShape)
                },
            )
        }
    }
}

/** Either the filled-slot species (titleized) or a "n/6 Pokémon" count when empty. */
private fun compositionLabel(team: TeamSummary): String =
    if (team.species.isEmpty()) "${team.memberCount}/6 Pokémon" else team.species.joinToString(", ") { titleizeTeamSlug(it) }
