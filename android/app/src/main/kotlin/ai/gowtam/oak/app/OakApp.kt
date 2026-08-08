package ai.gowtam.oak.app

import ai.gowtam.oak.features.account.AccountScreen
import ai.gowtam.oak.features.account.AccountViewModel
import ai.gowtam.oak.features.artifact.ArtifactViewModel
import ai.gowtam.oak.features.auth.AuthDialog
import ai.gowtam.oak.features.auth.AuthViewModel
import ai.gowtam.oak.features.chat.ChatScreen
import ai.gowtam.oak.features.chat.ChatViewModel
import ai.gowtam.oak.features.dex.DexRoute
import ai.gowtam.oak.features.history.HistoryScreen
import ai.gowtam.oak.features.history.HistoryViewModel
import ai.gowtam.oak.features.teams.TeamsRoute
import ai.gowtam.oak.services.AuthState
import ai.gowtam.oak.ui.ConnectionBanner
import ai.gowtam.oak.ui.OakButton
import ai.gowtam.oak.ui.OakButtonStyle
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakMotion
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.rememberReduceMotion
import ai.gowtam.oak.wire.ConversationSummary
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import androidx.compose.ui.unit.dp

private enum class OakTab(val label: String) {
    Chat("Chat"),
    Teams("Teams"),
    Dex("Dex"),
    Account("Account"),
}

/**
 * The app's root composable — the 4-tab `NavigationBar` shell (Chat / Teams /
 * Dex / Account). Chat, Teams, Dex, and Account are all fully wired. The
 * [ChatViewModel] and [ArtifactViewModel] are owned by the caller
 * (`MainActivity`) and passed in so their stream/back-stack state survives a tab
 * switch away from Chat and back.
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
    val connectionStatus by rememberConnectionStatus()
    val reduceMotion = rememberReduceMotion()

    LaunchedEffect(appState, services) {
        appState.authState.collect { state ->
            if (state is AuthState.SignedIn) {
                appState.importGuestThread(services.history)
            }
        }
    }

    val oak = LocalOakColors.current
    Scaffold(
        bottomBar = {
            Column {
                // Hairline that separates the nav band from the canvas above it —
                // the branded stand-in for Material's tonal-elevation shadow.
                HorizontalDivider(color = oak.border, thickness = 1.dp)
                NavigationBar(containerColor = MaterialTheme.colorScheme.background) {
                    OakTab.entries.forEach { tab ->
                        NavigationBarItem(
                            selected = selectedTab == tab,
                            onClick = { selectedTab = tab },
                            icon = { Icon(imageVector = tab.icon(), contentDescription = tab.label) },
                            label = { Text(tab.label) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = oak.accent,
                                selectedTextColor = oak.accent,
                                indicatorColor = oak.accentSoft,
                                unselectedIconColor = oak.textMuted,
                                unselectedTextColor = oak.textMuted,
                            ),
                        )
                    }
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
            Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
                ConnectionBanner(status = connectionStatus)
                // Tab content crossfades on switch (reduce-motion: an instant swap —
                // AnimatedContent's default transitionSpec already collapses to
                // EnterTransition.None/ExitTransition.None-equivalent timing when both
                // fade specs are zero-duration, so a single shared branch covers both).
                AnimatedContent(
                    targetState = selectedTab,
                    modifier = Modifier.weight(1f),
                    transitionSpec = {
                        val millis = if (reduceMotion) 0 else OakMotion.FADE_MILLIS
                        fadeIn(tween(millis)) togetherWith fadeOut(tween(millis))
                    },
                    label = "OakTabContent",
                ) { tab ->
                    Box(modifier = Modifier.fillMaxSize()) {
                        when (tab) {
                            OakTab.Chat -> ChatTab(
                                services = services,
                                appState = appState,
                                authState = authState,
                                chatViewModel = chatViewModel,
                                artifactViewModel = artifactViewModel,
                            )
                            OakTab.Teams -> TeamsRoute(services = services, appState = appState)
                            OakTab.Dex -> DexRoute(services = services, appState = appState)
                            OakTab.Account -> {
                                val accountViewModel = remember(services, appState) {
                                    AccountViewModel(services.auth, appState)
                                }
                                AccountScreen(viewModel = accountViewModel, onBack = null)
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun OakTab.icon() = when (this) {
    OakTab.Chat -> Icons.AutoMirrored.Filled.Chat
    OakTab.Teams -> Icons.Filled.Groups
    OakTab.Dex -> Icons.AutoMirrored.Filled.MenuBook
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
 *   - **Signed in:** the tab opens directly into a fresh, unsaved thread
 *     ([ChatScreen]); the saved-conversation list ([HistoryScreen]) is one Back
 *     away rather than the root, so returning users land in a new chat instead
 *     of history. Selecting a row from the list pushes a local route that
 *     resolves back to [ChatScreen], and Back from any pushed route returns to
 *     the list.
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
    /** The saved-conversation list — one Back away from a new thread, not the tab's
     * initial route (a returning user should land in a fresh chat, not history). */
    data object ConversationList : ChatTabRoute

    /** Start a brand-new, unsaved thread — the tab's initial route. */
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
    var route by remember { mutableStateOf<ChatTabRoute>(ChatTabRoute.New) }
    // The last conversation the user opened from the list, remembered in-memory so the
    // list can mark that row on return (survives the list⟷thread navigation because this
    // state lives above the route `when`). Not persisted across process death by design.
    var lastOpenedConversationId by remember { mutableStateOf<String?>(null) }
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
                onSelect = {
                    lastOpenedConversationId = it.id
                    route = ChatTabRoute.Existing(it)
                },
                onNewChat = { route = ChatTabRoute.New },
                activeConversationId = lastOpenedConversationId,
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
            chatViewModel.loadResumed(
                conversationId = detail.id,
                format = detail.format,
                turns = detail.turns,
                // A durable turn still generating server-side (survives an app relaunch,
                // when the client's own pending pointer is gone) — reattach on open.
                activeTurnId = detail.activeTurn?.turnId,
            )
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
            OakButton(onClick = onRetry) { Text("Retry") }
            OakButton(onClick = onBack, style = OakButtonStyle.Ghost) { Text("Back to conversations") }
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
