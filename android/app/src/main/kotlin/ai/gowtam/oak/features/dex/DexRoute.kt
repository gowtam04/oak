package ai.gowtam.oak.features.dex

import ai.gowtam.oak.app.AppState
import ai.gowtam.oak.app.ServiceContainer
import ai.gowtam.oak.features.teams.AddToTeamSheet
import ai.gowtam.oak.features.teams.AddToTeamViewModel
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.toMutableStateList
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.Modifier
import kotlinx.coroutines.launch

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
    val scope = rememberCoroutineScope()
    var applyIncoming by remember { mutableStateOf<TeamMember?>(null) }
    var applyNote by remember { mutableStateOf<String?>(null) }

    fun applySpecies(species: String) {
        if (!signedIn) {
            applyNote = "Sign in to apply this Champions set to a team."
            return
        }
        applyNote = null
        scope.launch {
            val result = services.teams.setTemplate(species)
            val member = result.member
            if (!result.found || member == null) {
                applyNote = result.notes.firstOrNull()
                    ?: "Usage is unavailable or no set is listed for this species."
            } else {
                applyIncoming = member
            }
        }
    }

    val top = stack.lastOrNull()
    if (top == null) {
        DexListScreen(
            viewModel = viewModel,
            usage = services.usage,
            onOpen = { kind, query -> stack.add(DexEntityRoute(kind, query)) },
            onApplySpecies = ::applySpecies,
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
            onApplySpecies = if (top.kind == EntityKind.POKEMON) ::applySpecies else null,
            modifier = modifier,
        )
    }

    applyNote?.let { note ->
        AlertDialog(
            onDismissRequest = { applyNote = null },
            text = { Text(note) },
            confirmButton = {
                TextButton(onClick = { applyNote = null }) { Text("OK") }
            },
        )
    }

    applyIncoming?.let { incoming ->
        val addVm = remember(incoming) {
            AddToTeamViewModel(services.teams, incoming, Format.Champions)
        }
        AddToTeamSheet(
            viewModel = addVm,
            onDismiss = { applyIncoming = null },
            onDone = { _, _ -> applyIncoming = null },
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
