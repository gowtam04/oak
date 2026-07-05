package ai.gowtam.oak.features.more

import ai.gowtam.oak.app.AppState
import ai.gowtam.oak.app.ServiceContainer
import ai.gowtam.oak.features.account.AccountScreen
import ai.gowtam.oak.features.account.AccountViewModel
import ai.gowtam.oak.services.AuthState
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.OakRadius
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import ai.gowtam.oak.ui.OakTopBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics

/**
 * The More tab's root (mirrors iOS `MoreView`): a list of destinations whose first
 * (and, for now, only) row is Account. A future destination — damage calc, team
 * analysis, etc. (see the repo backlog) — slots in as one more [MoreDestination]
 * case, one [icon] branch, and one `when` branch in [MoreRoute], without
 * re-architecting the tab.
 *
 * This is the single entry point [ai.gowtam.oak.app.OakApp] swaps in for the third
 * tab's placeholder, replacing the old direct-to-[AccountScreen] wiring.
 */
enum class MoreDestination(val title: String) {
    Account("Account"),
}

internal fun MoreDestination.icon(): ImageVector = when (this) {
    MoreDestination.Account -> Icons.Filled.AccountCircle
}

/**
 * Owns the tab's own small list ⟷ detail navigation (mirrors iOS `MoreView`'s
 * `NavigationStack`/`navigationDestination`; the same in-tab push pattern as
 * [ai.gowtam.oak.features.teams.TeamsRoute]'s list ⟷ editor stack): a
 * [rememberSaveable] nullable [MoreDestination] survives rotation, and system/
 * predictive back pops a pushed destination back to the list rather than out of
 * the tab.
 */
@Composable
fun MoreRoute(services: ServiceContainer, appState: AppState, modifier: Modifier = Modifier) {
    var destination by rememberSaveable { mutableStateOf<MoreDestination?>(null) }
    BackHandler(enabled = destination != null) { destination = null }

    when (destination) {
        null -> MoreListScreen(appState = appState, onSelect = { destination = it }, modifier = modifier)
        MoreDestination.Account -> {
            val accountViewModel = remember(services, appState) { AccountViewModel(services.auth, appState) }
            AccountScreen(viewModel = accountViewModel, onBack = { destination = null }, modifier = modifier)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MoreListScreen(appState: AppState, onSelect: (MoreDestination) -> Unit, modifier: Modifier = Modifier) {
    val authState by appState.authState.collectAsState()
    val accountSubtitle = when (val state = authState) {
        is AuthState.SignedIn -> state.email
        AuthState.Guest -> "Sign in"
    }

    Scaffold(
        modifier = modifier,
        topBar = { OakTopBar(title = { Text("More", modifier = Modifier.semantics { heading() }) }) },
    ) { padding ->
        val oak = LocalOakColors.current
        val cardShape = RoundedCornerShape(OakRadius.lg)
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(OakSpacing.lg)) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(cardShape)
                    .background(oak.surfaceRaised)
                    .border(1.dp, oak.border, cardShape),
            ) {
                MoreDestination.entries.forEachIndexed { index, destination ->
                    MoreRow(
                        destination = destination,
                        subtitle = if (destination == MoreDestination.Account) accountSubtitle else null,
                        onClick = { onSelect(destination) },
                    )
                    if (index < MoreDestination.entries.lastIndex) {
                        HorizontalDivider(color = oak.border)
                    }
                }
            }
        }
    }
}

@Composable
private fun MoreRow(destination: MoreDestination, subtitle: String?, onClick: () -> Unit) {
    val colors = LocalOakColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(OakSpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(destination.icon(), contentDescription = null, tint = colors.accent)
        Spacer(Modifier.width(OakSpacing.sm))
        Column(modifier = Modifier.weight(1f)) {
            Text(destination.title, style = MaterialTheme.typography.bodyLarge)
            if (subtitle != null) {
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = colors.textMuted)
            }
        }
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = colors.textMuted)
    }
}
