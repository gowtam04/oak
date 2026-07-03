package ai.gowtam.oak.app

import ai.gowtam.oak.features.account.AccountScreen
import ai.gowtam.oak.features.account.AccountViewModel
import ai.gowtam.oak.features.artifact.ArtifactViewModel
import ai.gowtam.oak.features.chat.ChatScreen
import ai.gowtam.oak.features.chat.ChatViewModel
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier

private enum class OakTab(val label: String) {
    Chat("Chat"),
    Teams("Teams"),
    Account("Account"),
}

/**
 * The app's root composable — the 3-tab `NavigationBar` shell (component-design.md
 * "Navigation graph"). Chat and Account are fully wired to their real screens; Teams
 * stays a placeholder until P10. The [ChatViewModel] and [ArtifactViewModel] are owned
 * by the caller (`MainActivity`) and passed in so their stream/back-stack state
 * survives a tab switch away from Chat and back.
 */
@Composable
fun OakApp(
    services: ServiceContainer,
    appState: AppState,
    chatViewModel: ChatViewModel,
    artifactViewModel: ArtifactViewModel,
) {
    var selectedTab by remember { mutableStateOf(OakTab.Chat) }

    Scaffold(
        bottomBar = {
            NavigationBar {
                OakTab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = selectedTab == tab,
                        onClick = { selectedTab = tab },
                        icon = { Icon(imageVector = tab.icon(), contentDescription = tab.label) },
                        label = { Text(tab.label) },
                    )
                }
            }
        },
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            when (selectedTab) {
                OakTab.Chat -> ChatScreen(viewModel = chatViewModel, artifactViewModel = artifactViewModel)
                OakTab.Teams -> PlaceholderScreen(name = "Teams")
                OakTab.Account -> {
                    val accountViewModel = remember(services, appState) { AccountViewModel(services.auth, appState) }
                    AccountScreen(viewModel = accountViewModel)
                }
            }
        }
    }
}

private fun OakTab.icon() = when (this) {
    OakTab.Chat -> Icons.AutoMirrored.Filled.Chat
    OakTab.Teams -> Icons.Filled.Groups
    OakTab.Account -> Icons.Filled.AccountCircle
}

@Composable
private fun PlaceholderScreen(name: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(text = name, style = MaterialTheme.typography.headlineMedium)
    }
}
