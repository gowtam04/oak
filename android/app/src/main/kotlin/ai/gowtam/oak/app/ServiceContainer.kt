package ai.gowtam.oak.app

import ai.gowtam.oak.networking.BaseUrl
import ai.gowtam.oak.networking.OakApiClient
import ai.gowtam.oak.networking.SseClient
import ai.gowtam.oak.networking.TokenStore
import ai.gowtam.oak.services.ArtifactService
import ai.gowtam.oak.services.AuthService
import ai.gowtam.oak.services.ChatService
import ai.gowtam.oak.services.DexLookupService
import ai.gowtam.oak.services.HistoryService
import ai.gowtam.oak.services.LiveArtifactService
import ai.gowtam.oak.services.LiveAuthService
import ai.gowtam.oak.services.LiveChatService
import ai.gowtam.oak.services.LiveDexLookupService
import ai.gowtam.oak.services.LiveHistoryService
import ai.gowtam.oak.services.LiveTeamService
import ai.gowtam.oak.services.LiveTeamsAssistantService
import ai.gowtam.oak.services.TeamService
import ai.gowtam.oak.services.TeamsAssistantService
import android.content.Context
import androidx.compose.runtime.staticCompositionLocalOf

/**
 * The app's **composition root** (component-design.md "App / session state"; mirrors
 * iOS `ServiceContainer`). ViewModels resolve **service interfaces** (never `Live…`
 * concretes) so they unit-test against fakes; production code obtains the container
 * once from [live] and shares it across every screen (manual DI, no Hilt).
 */
data class ServiceContainer(
    /** The sign-in lifecycle. Backed by [LiveAuthService] in production. */
    val auth: AuthService,
    /** Durable, signed-in-only chat history. Backed by [LiveHistoryService]. */
    val history: HistoryService,
    /** One chat turn → a live `SseEvent` stream. Backed by [LiveChatService]. */
    val chat: ChatService,
    /** The artifact-viewer data seam. Backed by [LiveArtifactService]. */
    val artifact: ArtifactService,
    /** The team-builder seam. Backed by [LiveTeamService]. */
    val teams: TeamService,
    /** The team-builder entity-picker seam (public/read-only). Backed by [LiveDexLookupService]. */
    val dexLookup: DexLookupService,
    /** The team-builder assistant seam (signed-in only). Backed by [LiveTeamsAssistantService]. */
    val teamsAssistant: TeamsAssistantService,
) {
    companion object {
        /**
         * The production wiring (real `Live…` services). Every service shares **one**
         * [TokenStore] (Keystore-backed) and **one** [OakApiClient] (the `OkHttpClient`,
         * base URL, and Bearer-header policy), so a token written on `verify` is read
         * identically by every authed request and the chat/assistant byte streams
         * alike (both borrow the same [SseClient]).
         */
        fun live(context: Context): ServiceContainer {
            val tokenStore = TokenStore(context)
            val apiClient = OakApiClient(baseUrl = BaseUrl.current, tokenStore = tokenStore)
            val sseClient = SseClient(apiClient)
            return ServiceContainer(
                auth = LiveAuthService(apiClient, tokenStore),
                history = LiveHistoryService(apiClient, tokenStore),
                chat = LiveChatService(sseClient),
                artifact = LiveArtifactService(apiClient),
                teams = LiveTeamService(apiClient),
                dexLookup = LiveDexLookupService(apiClient),
                teamsAssistant = LiveTeamsAssistantService(sseClient),
            )
        }
    }
}

/**
 * Ambient access to the composition root, for the rare leaf composable that can't have
 * [ServiceContainer] threaded through its call chain — e.g.
 * [ai.gowtam.oak.features.chat.answercard.TeamBlocks]'s "Apply" action lives several
 * call sites below [ai.gowtam.oak.app.OakApp] (through `ChatScreen` → `AnswerCard`),
 * which are owned by a different build phase and out of scope to re-plumb a parameter
 * through. Provided once at the top of [ai.gowtam.oak.app.OakApp]; `null` when
 * unprovided (a preview or a component test rendered without a container), in which
 * case a dependent composable degrades to a local-only affordance rather than crashing.
 */
val LocalServices = staticCompositionLocalOf<ServiceContainer?> { null }
