package ai.gowtam.oak.features.dex

import ai.gowtam.oak.app.AppState
import ai.gowtam.oak.app.ServiceContainer
import ai.gowtam.oak.features.teams.AddToTeamSheet
import ai.gowtam.oak.features.teams.AddToTeamViewModel
import ai.gowtam.oak.features.teams.incomingMemberFromSpecies
import ai.gowtam.oak.services.AuthState
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.TeamMember
import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Modifier

/**
 * The Dex tab's root: list ⟷ detail stack (mirrors iOS `DexView`'s
 * `NavigationStack`). Owns one [DexViewModel] for the tab lifetime so search
 * state survives a detail push and pops cleanly.
 */
@Composable
fun DexRoute(services: ServiceContainer, appState: AppState, modifier: Modifier = Modifier) {
    val viewModel = remember(services) {
        DexViewModel(
            dexLookup = services.dexLookup,
            artifact = services.artifact,
            initialFormat = Format.Champions,
        )
    }
    LaunchedEffect(viewModel) { viewModel.start() }

    // Saveable stack of "kind|query" strings so rotation restores the path.
    val stack = rememberSaveable(saver = dexStackSaver()) { mutableStateListOf<DexEntityRoute>() }

    val surface by appState.surfaceRequest.collectAsState()
    LaunchedEffect(surface) {
        when (val req = surface) {
            is ai.gowtam.oak.app.AppState.SurfaceRequest.Dex -> {
                val query = req.query
                if (!query.isNullOrBlank()) {
                    val kind = req.kind ?: EntityKind.POKEMON
                    viewModel.applyHop(kind, query, Format.Champions)
                    stack.add(DexEntityRoute(kind, query))
                }
                appState.consumeSurfaceRequest()
            }
            ai.gowtam.oak.app.AppState.SurfaceRequest.Usage -> {
                viewModel.selectSection(DexSection.Usage)
                appState.consumeSurfaceRequest()
            }
            else -> Unit
        }
    }

    BackHandler(enabled = stack.isNotEmpty()) {
        stack.removeAt(stack.lastIndex)
        if (stack.isEmpty()) viewModel.clearDetail()
    }

    val authState by appState.authState.collectAsState()
    val signedIn = authState is AuthState.SignedIn
    var addIncoming by remember { mutableStateOf<TeamMember?>(null) }

    val top = stack.lastOrNull()
    if (top == null) {
        DexListScreen(
            viewModel = viewModel,
            usage = services.usage,
            onOpen = { kind, query -> stack.add(DexEntityRoute(kind, query)) },
            modifier = modifier,
        )
    } else {
        DexDetailScreen(
            viewModel = viewModel,
            kind = top.kind,
            query = top.query,
            onBack = {
                stack.removeAt(stack.lastIndex)
                if (stack.isEmpty()) viewModel.clearDetail()
            },
            onOpen = { kind, query -> stack.add(DexEntityRoute(kind, query)) },
            onAddToTeam = if (signedIn && top.kind == EntityKind.POKEMON) {
                { addIncoming = incomingMemberFromSpecies(top.query) }
            } else {
                null
            },
            modifier = modifier,
        )
    }

    addIncoming?.let { incoming ->
        val addVm = remember(incoming) {
            AddToTeamViewModel(services.teams, incoming, Format.Champions)
        }
        AddToTeamSheet(
            viewModel = addVm,
            onDismiss = { addIncoming = null },
            onDone = { teamId, _ ->
                addIncoming = null
                appState.requestTeams(teamId, null)
            },
        )
    }
}

private fun dexStackSaver() = listSaver<MutableList<DexEntityRoute>, String>(
    save = { list -> list.map { "${it.kind.rawValue}\u0000${it.query}" } },
    restore = { saved ->
        saved.mapNotNull { raw ->
            val parts = raw.split('\u0000', limit = 2)
            if (parts.size != 2) return@mapNotNull null
            DexEntityRoute(EntityKind.fromRaw(parts[0]), parts[1])
        }.toMutableStateList()
    },
)
