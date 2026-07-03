package ai.gowtam.oak.app

import ai.gowtam.oak.features.account.AccountScreen
import ai.gowtam.oak.features.account.AccountViewModel
import ai.gowtam.oak.features.artifact.ArtifactViewModel
import ai.gowtam.oak.features.auth.AuthDialog
import ai.gowtam.oak.features.auth.AuthViewModel
import ai.gowtam.oak.features.chat.ChatScreen
import ai.gowtam.oak.features.chat.ChatViewModel
import ai.gowtam.oak.features.history.HistoryScreen
import ai.gowtam.oak.features.history.HistoryViewModel
import ai.gowtam.oak.features.teams.TeamsRoute
import ai.gowtam.oak.services.AuthState
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.ConversationSummary
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
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
 *
 * **Guest→sign-in import (history-and-teams.md D-HIST-1; mirrors iOS `RootView`).**
 * The single wiring point for the app-wide side effect: whenever [AppState.authState]
 * transitions to signed-in, the in-memory guest thread (if any) is imported into
 * durable history via [AppState.importGuestThread]. Non-fatal by design — a failure
 * keeps the on-screen thread (see [AppState.importGuestThread]'s doc).
 */
@Composable
fun OakApp(
    services: ServiceContainer,
    appState: AppState,
    chatViewModel: ChatViewModel,
    artifactViewModel: ArtifactViewModel,
) {
    var selectedTab by remember { mutableStateOf(OakTab.Chat) }
    val authState by appState.authState.collectAsState()

    LaunchedEffect(appState, services) {
        appState.authState.collect { state ->
            if (state is AuthState.SignedIn) {
                appState.importGuestThread(services.history)
            }
        }
    }

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
        // Ambient composition-root access (P10): a few leaf composables several call
        // sites below this point — e.g. the chat AnswerCard's team "Apply" button — need
        // a service without threading a new parameter through files this phase doesn't
        // own. See [LocalServices]'s doc for why this is scoped narrowly rather than
        // becoming the primary DI seam (ViewModels still take services as constructor
        // params).
        CompositionLocalProvider(LocalServices provides services) {
            Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
                when (selectedTab) {
                    OakTab.Chat -> ChatTab(
                        services = services,
                        appState = appState,
                        authState = authState,
                        chatViewModel = chatViewModel,
                        artifactViewModel = artifactViewModel,
                    )
                    OakTab.Teams -> TeamsRoute(services = services, appState = appState)
                    OakTab.Account -> {
                        val accountViewModel = remember(services, appState) { AccountViewModel(services.auth, appState) }
                        AccountScreen(viewModel = accountViewModel)
                    }
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

// ---------------------------------------------------------------------------
// Chat tab — auth-adaptive, history folded in (history-and-teams.md D-HIST-1)
// ---------------------------------------------------------------------------

/**
 * The Chat tab's auth-adaptive root (chat-experience.md M-CHAT-US-2/3;
 * history-and-teams.md M-HIST-US-2/3) — the Kotlin/Compose expression of iOS
 * `ChatTabView`, mirrored as closely as Compose's lack of a `NavigationStack`
 * allows:
 *   - **Signed in:** the saved-conversation list ([HistoryScreen]) is the tab's
 *     root; selecting a row or tapping New Chat pushes a local route that resolves
 *     to [ChatScreen], so Back returns to the list.
 *   - **Guest:** the tab opens directly into the single in-memory thread
 *     ([ChatScreen]) with the "Sign in to save your conversations" nudge; tapping
 *     it presents the email-OTP dialog ([AuthDialog]). Completing sign-in flips
 *     [AppState.authState] and this composable re-renders into the signed-in list.
 *
 * Unlike iOS (which constructs a fresh `ChatViewModel` per pushed thread), Android
 * shares ONE long-lived [chatViewModel] instance across the whole app (so its
 * stream/wake-lock state survives a tab switch — see `MainActivity`'s doc), so
 * "New Chat" / "resume" are expressed as calls into that instance
 * ([ChatViewModel.startNewConversation] / [ChatViewModel.loadResumed]) rather than
 * new view-model instances.
 */
@Composable
private fun ChatTab(
    services: ServiceContainer,
    appState: AppState,
    authState: AuthState,
    chatViewModel: ChatViewModel,
    artifactViewModel: ArtifactViewModel,
) {
    when (authState) {
        is AuthState.SignedIn -> SignedInChatHome(services, appState, chatViewModel, artifactViewModel)
        AuthState.Guest -> GuestChatHome(services, appState, chatViewModel, artifactViewModel)
    }
}

/** A navigation route within the signed-in Chat tab (mirrors iOS `ChatRoute`). */
private sealed interface ChatTabRoute {
    /** The saved-conversation list (the tab's root). */
    data object ConversationList : ChatTabRoute

    /** Start a brand-new, unsaved thread. */
    data object New : ChatTabRoute

    /** Open and resume an existing saved conversation. */
    data class Existing(val summary: ConversationSummary) : ChatTabRoute
}

@Composable
private fun SignedInChatHome(
    services: ServiceContainer,
    appState: AppState,
    chatViewModel: ChatViewModel,
    artifactViewModel: ArtifactViewModel,
) {
    var route by remember { mutableStateOf<ChatTabRoute>(ChatTabRoute.ConversationList) }
    // System/predictive back pops a pushed thread back to the conversation list,
    // mirroring iOS's NavigationStack pop (Back returns to "Chats").
    BackHandler(enabled = route != ChatTabRoute.ConversationList) {
        route = ChatTabRoute.ConversationList
    }

    when (val current = route) {
        ChatTabRoute.ConversationList -> {
            val historyViewModel = remember(services) { HistoryViewModel(services.history) }
            HistoryScreen(
                viewModel = historyViewModel,
                onSelect = { route = ChatTabRoute.Existing(it) },
                onNewChat = { route = ChatTabRoute.New },
            )
        }

        ChatTabRoute.New -> {
            // A truly fresh thread: no prior context, no active conversation.
            LaunchedEffect(Unit) { chatViewModel.startNewConversation() }
            ChatScreen(
                viewModel = chatViewModel,
                artifactViewModel = artifactViewModel,
                showsNewConversationButton = false,
                onBack = { route = ChatTabRoute.ConversationList },
            )
        }

        is ChatTabRoute.Existing -> {
            ExistingConversationThread(
                summary = current.summary,
                services = services,
                chatViewModel = chatViewModel,
                artifactViewModel = artifactViewModel,
                onBack = { route = ChatTabRoute.ConversationList },
            )
        }
    }
}

/**
 * Loads one saved conversation's full detail (`HistoryService.get`) and resumes it
 * into [chatViewModel] (mirrors iOS `ChatThreadScreen`'s `.existing(_:)` case — the
 * already-tested `HistoryDetailViewModel.load()` → `.resume()` sequence, folded here
 * since Android's [ChatViewModel.loadResumed] already does both steps at once). While
 * the detail loads it shows a spinner; a load failure shows a retry.
 */
@Composable
private fun ExistingConversationThread(
    summary: ConversationSummary,
    services: ServiceContainer,
    chatViewModel: ChatViewModel,
    artifactViewModel: ArtifactViewModel,
    onBack: () -> Unit,
) {
    var isLoaded by remember(summary.id) { mutableStateOf(false) }
    var loadError by remember(summary.id) { mutableStateOf<String?>(null) }
    var retryToken by remember(summary.id) { mutableStateOf(0) }

    LaunchedEffect(summary.id, retryToken) {
        isLoaded = false
        loadError = null
        try {
            val detail = services.history.get(summary.id)
            chatViewModel.loadResumed(conversationId = detail.id, format = detail.format, turns = detail.turns)
            isLoaded = true
        } catch (e: Exception) {
            loadError = "This conversation is no longer available."
        }
    }

    when {
        isLoaded -> ChatScreen(
            viewModel = chatViewModel,
            artifactViewModel = artifactViewModel,
            showsNewConversationButton = false,
            onBack = onBack,
        )
        loadError != null -> LoadErrorState(message = loadError!!, onRetry = { retryToken++ }, onBack = onBack)
        else -> LoadingState()
    }
}

@Composable
private fun LoadingState() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = LocalOakColors.current.accent)
    }
}

@Composable
private fun LoadErrorState(message: String, onRetry: () -> Unit, onBack: () -> Unit) {
    val oak = LocalOakColors.current
    Box(modifier = Modifier.fillMaxSize().padding(OakSpacing.xl), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "Couldn't open conversation",
                style = MaterialTheme.typography.titleMedium,
                color = oak.textStrong,
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = oak.textMuted,
                modifier = Modifier.padding(top = OakSpacing.xs, bottom = OakSpacing.lg),
            )
            Button(onClick = onRetry) { Text("Retry") }
            TextButton(onClick = onBack) { Text("Back to conversations") }
        }
    }
}

/** The guest single-thread home: the tab opens directly into [ChatScreen] with the
 * sign-in nudge; tapping it presents [AuthDialog]. */
@Composable
private fun GuestChatHome(
    services: ServiceContainer,
    appState: AppState,
    chatViewModel: ChatViewModel,
    artifactViewModel: ArtifactViewModel,
) {
    var showSignIn by remember { mutableStateOf(false) }

    ChatScreen(
        viewModel = chatViewModel,
        artifactViewModel = artifactViewModel,
        showsNewConversationButton = true,
        signInAction = { showSignIn = true },
    )

    if (showSignIn) {
        val authViewModel = remember(services, appState) { AuthViewModel(services.auth, appState) }
        AuthDialog(viewModel = authViewModel, onDismissRequest = { showSignIn = false })
    }
}
