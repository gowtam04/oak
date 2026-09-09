package ai.gowtam.oak.features.chat

import ai.gowtam.oak.app.LocalServices
import ai.gowtam.oak.features.artifact.ArtifactSheet
import ai.gowtam.oak.features.artifact.ArtifactViewModel
import ai.gowtam.oak.features.artifact.PinnedArtifactStrip
import ai.gowtam.oak.features.calc.CalculatorOverlay
import ai.gowtam.oak.features.calc.CalculatorViewModel
import ai.gowtam.oak.features.chat.answercard.AnswerCard
import ai.gowtam.oak.features.chat.answercard.AnswerCardActions
import ai.gowtam.oak.features.teams.AddToTeamSheet
import ai.gowtam.oak.features.teams.AddToTeamViewModel
import ai.gowtam.oak.wire.TeamMember
import ai.gowtam.oak.features.share.shareExportedFile
import ai.gowtam.oak.ui.LocalOakColors
import android.content.Intent
import androidx.compose.ui.platform.LocalContext
import ai.gowtam.oak.ui.OakMotion
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakTopBar
import ai.gowtam.oak.ui.OakWordmark
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.rememberHaptics
import ai.gowtam.oak.ui.rememberReduceMotion
import ai.gowtam.oak.wire.Format
import android.os.SystemClock
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.exclude
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Functions
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Photo
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The chat thread screen (chat-experience.md M-CHAT-US-1/2/3/4; component-design.md
 * "Navigation graph"): a scrolling conversation of user messages and reasoned answers,
 * a live streaming section while a turn is in flight, a recoverable error banner, and
 * the composer. Mirrors the iOS `ChatView`, re-expressed for Compose.
 *
 * All logic lives in [ChatViewModel]; this composable is layout + bindings. The header
 * scope chip (component-design.md "AnswerCard render order" / GS-C) is the ONLY
 * interactive scope control — it opens a bottom-sheet picker over the eleven known
 * [Format]s and is disabled while a turn streams so a turn's scope stays stable.
 *
 * Screen-off auto-reconnect (DADR-13) is wired here via the lifecycle observer:
 * `ON_STOP` arms the retry gate, `ON_START` fires any deferred retry — the Android
 * analog of iOS's `scenePhase` handling. Leaving the composition cancels the stream
 * (mirrors iOS's `.onDisappear`), which also releases the keep-screen-on hold.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    viewModel: ChatViewModel,
    artifactViewModel: ArtifactViewModel,
    modifier: Modifier = Modifier,
    showsNewConversationButton: Boolean = true,
    /** When non-null, renders the guest "Sign in to save your conversations" nudge as
     * the first row inside the scrollable transcript; the "Sign in" button calls this
     * (it presents the sign-in sheet). `null` for a signed-in thread — mirrors iOS
     * `ChatView.signInAction`. */
    signInAction: (() -> Unit)? = null,
    /** When non-null, the top bar shows a back arrow calling this instead of the
     * app title alone — used for a pushed/resumed signed-in thread so there is an
     * explicit affordance back to the conversation list (history-and-teams.md
     * D-HIST-1) alongside system/predictive back. `null` for the guest single
     * thread and the list's own "New Chat" push. */
    onBack: (() -> Unit)? = null,
    onOpenTeam: (id: String?, name: String?) -> Unit = { _, _ -> },
    onResumeConversation: (String) -> Unit = {},
    onForked: (String) -> Unit = {},
    onOpenInDex: (ai.gowtam.oak.features.artifact.DexHop) -> Unit = {},
    onOpenCalculator: () -> Unit = {},
    conversationId: String? = null,
    density: ai.gowtam.oak.wire.AnswerDensity = ai.gowtam.oak.wire.AnswerDensity.Full,
) {
    val uiState by viewModel.uiState.collectAsState()
    val oak = LocalOakColors.current
    val context = LocalContext.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    fun shareUrl(url: String) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, url)
        }
        context.startActivity(Intent.createChooser(intent, "Share"))
    }
    val listState = rememberLazyListState()
    var pinJumpId by remember { mutableStateOf<String?>(null) }
    val haptics = rememberHaptics()

    // Haptics are always redundant with a visible cue (the new AnswerCard / the error
    // banner itself) — removing them never removes meaning. The baseline captures the
    // count as of THIS composable's first composition (which, for a resumed thread, is
    // already the full loaded history) so opening/resuming a conversation never fires a
    // spurious "answer arrived" buzz — only a genuine, in-session growth does.
    var lastAnnouncedTurnCount by remember { mutableStateOf(uiState.turns.size) }
    LaunchedEffect(uiState.turns.size) {
        val grew = uiState.turns.size > lastAnnouncedTurnCount
        lastAnnouncedTurnCount = uiState.turns.size
        if (grew && uiState.turns.lastOrNull() is ChatTurnItem.Assistant) haptics.success()
    }
    LaunchedEffect(uiState.errorBanner != null) {
        if (uiState.errorBanner != null) haptics.error()
    }

    // The elapsed-seconds counter is VIEW-layer only (never the ViewModel — mirrors
    // iOS's `TimelineView`-driven counter, which is deliberately kept out of the model
    // too): a wall-clock timestamp captured on `isStreaming` transitions, ticked into
    // whole seconds once per second.
    var streamStartedAt by remember { mutableStateOf<Long?>(null) }
    LaunchedEffect(uiState.isStreaming) {
        streamStartedAt = if (uiState.isStreaming) SystemClock.elapsedRealtime() else null
    }
    val elapsedSeconds by produceState<Int?>(initialValue = null, streamStartedAt) {
        val started = streamStartedAt
        if (started == null) {
            value = null
        } else {
            while (true) {
                value = ((SystemClock.elapsedRealtime() - started) / 1000L).toInt()
                delay(1_000)
            }
        }
    }

    // A scope change clears any open artifact stack (D-BR-ART-4) since its entries were
    // fetched under the old format.
    LaunchedEffect(uiState.displayFormat) { artifactViewModel.updateFormat(uiState.displayFormat) }

    val services = LocalServices.current
    var addIncoming by remember { mutableStateOf<TeamMember?>(null) }
    LaunchedEffect(uiState.isSignedIn, conversationId, services) {
        artifactViewModel.bindSession(
            signedIn = uiState.isSignedIn,
            conversationId = conversationId,
            pins = services?.pins,
        )
    }
    val cardActions = remember(viewModel, artifactViewModel, uiState.canAddToTeam, uiState.displayFormat) {
        AnswerCardActions(
            onFollowUp = viewModel::sendFollowUp,
            onOpenEntity = artifactViewModel::openEntity,
            onOpenSavedTeam = artifactViewModel::openSavedTeam,
            onOpenProposedTeam = artifactViewModel::openProposedTeam,
            onOpenComparison = artifactViewModel::openComparison,
            onOpenDamageCalc = artifactViewModel::openDamageCalc,
            onOpenCalculator = viewModel::openCalculator,
            calculatorFormat = uiState.displayFormat,
            onAddToTeam = if (uiState.canAddToTeam) { member -> addIncoming = member } else null,
        )
    }

    // Entering the thread (first composition, or re-entry after a tab switch) reattaches
    // to any durable turn still generating for this conversation, rebuilding the
    // in-flight UI from the resume replay (background-turns/design.md §6.3). A no-op when
    // nothing is pending or a live subscription is already running.
    LaunchedEffect(viewModel) { viewModel.reattachIfPending() }
    LaunchedEffect(viewModel, uiState.turns.isEmpty(), uiState.isSignedIn) {
        if (uiState.turns.isEmpty()) viewModel.refreshEmptyDesk()
    }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, viewModel) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_STOP -> viewModel.onEnterBackground()
                Lifecycle.Event.ON_START -> viewModel.onEnterForeground()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            // Leaving composition UNSUBSCRIBES from the stream but leaves the durable turn
            // running server-side (it is reattached on return) — never a cancel. Releases
            // the keep-screen-on hold so it can't get stuck on.
            viewModel.detach()
        }
    }

    val focusManager = LocalFocusManager.current
    val showEmptyState = uiState.turns.isEmpty() && !uiState.isStreaming
    val showInProgress = uiState.isStreaming || uiState.streamingText.isNotEmpty()
    val itemCount = uiState.turns.size + (if (showEmptyState) 1 else 0) + (if (showInProgress) 1 else 0)
    LaunchedEffect(uiState.turns.size, uiState.streamingText, uiState.toolActivities.size) {
        if (itemCount > 0 && pinJumpId == null) listState.animateScrollToItem(itemCount - 1)
    }
    LaunchedEffect(pinJumpId, uiState.turns) {
        val jump = pinJumpId ?: return@LaunchedEffect
        var offset = 0
        if (signInAction != null) offset++
        if (uiState.turns.isEmpty() && !uiState.isStreaming) offset++
        if (uiState.pinnedMessageIds.isNotEmpty()) offset++
        val turnIndex = uiState.turns.indexOfFirst { it.id == jump }
        if (turnIndex >= 0) listState.animateScrollToItem(offset + turnIndex)
        pinJumpId = null
    }

    Scaffold(
        modifier = modifier,
        // Parent `OakApp` already IME-pads tab content; don't stack a second IME inset
        // on top of the nav-bar reservation (that would sit the composer above the bar
        // which itself would sit above the keyboard).
        contentWindowInsets = WindowInsets.safeDrawing.exclude(WindowInsets.ime),
        topBar = {
            OakTopBar(
                title = { OakWordmark() },
                navigationIcon = {
                    if (onBack != null) {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back to conversations")
                        }
                    }
                },
                actions = {
                    ai.gowtam.oak.ui.RegulationChip(onLid = true)
                    IconButton(onClick = onOpenCalculator) {
                        Icon(Icons.Filled.Functions, contentDescription = "Calculator")
                    }
                    if (uiState.isSignedIn && uiState.turns.isNotEmpty()) {
                        var exportOpen by remember { mutableStateOf(false) }
                        Box {
                            IconButton(onClick = { exportOpen = true }) {
                                Icon(Icons.Filled.MoreVert, contentDescription = "Export conversation")
                            }
                            DropdownMenu(expanded = exportOpen, onDismissRequest = { exportOpen = false }) {
                                DropdownMenuItem(
                                    text = { Text("Export Markdown") },
                                    onClick = {
                                        exportOpen = false
                                        viewModel.exportConversation("md") { bytes, name ->
                                            shareExportedFile(context, bytes, name)
                                        }
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text("Export PDF") },
                                    onClick = {
                                        exportOpen = false
                                        viewModel.exportConversation("pdf") { bytes, name ->
                                            shareExportedFile(context, bytes, name)
                                        }
                                    },
                                )
                            }
                        }
                    }
                    if (showsNewConversationButton) {
                        IconButton(onClick = viewModel::startNewConversation) {
                            Icon(Icons.Filled.Add, contentDescription = "New conversation")
                        }
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            Box(modifier = Modifier.weight(1f)) {
                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .fillMaxSize()
                        .pointerInput(Unit) {
                            awaitPointerEventScope {
                                while (true) {
                                    val event = awaitPointerEvent(PointerEventPass.Initial)
                                    if (event.type == PointerEventType.Press) {
                                        focusManager.clearFocus()
                                    }
                                }
                            }
                        },
                    contentPadding = PaddingValues(OakSpacing.lg),
                    verticalArrangement = Arrangement.spacedBy(OakSpacing.lg),
                ) {
                    // A single quiet row inside the scroll, not a full-width band under
                    // the header (soul.md / fable-ui-strategy.md §4 "01 — iOS Home") —
                    // it now scrolls with the transcript instead of permanently costing
                    // fixed viewport height (the old landscape-only hide is gone since
                    // there's no fixed band left to squeeze the list).
                    if (signInAction != null) {
                        item(key = "sign-in-nudge") {
                            SignInNudge(onSignIn = signInAction)
                        }
                    }
                    if (showEmptyState) {
                        item(key = "empty-state") {
                            EmptyState(
                                onExampleTap = viewModel::sendFollowUp,
                                recents = uiState.emptyDeskRecents,
                                onContinueConversation = onResumeConversation,
                                onOpenTeam = { onOpenTeam(it, null) },
                            )
                        }
                    }
                    if (uiState.pinnedMessageIds.isNotEmpty()) {
                        item(key = "pin-strip") {
                            val pinItems = uiState.pinnedMessageIds.mapNotNull { id ->
                                val asst = uiState.turns.firstOrNull { turn ->
                                    turn is ChatTurnItem.Assistant && (turn.serverId == id || turn.id == id)
                                } as? ChatTurnItem.Assistant
                                asst?.let { PinStripItem(it.id, it.answer.answerMarkdown.take(48)) }
                            }
                            PinStrip(items = pinItems, onJump = { pinJumpId = it })
                        }
                    }
                    items(uiState.turns, key = { it.id }) { turn ->
                        TurnRow(
                            turn = turn,
                            actions = cardActions,
                            density = density,
                            isLastUser = turn.id == uiState.lastUserTurnId,
                            isLastAssistant = turn.id == uiState.lastAssistantTurnId,
                            canRetry = uiState.canRetryLast,
                            canEdit = uiState.canEditLast && !uiState.isStreaming,
                            isSignedIn = uiState.isSignedIn,
                            showUndo = uiState.isStreaming &&
                                turn.id == uiState.lastUserTurnId &&
                                uiState.undoUntilMillis != null,
                            isPinned = turn is ChatTurnItem.Assistant &&
                                (turn.serverId ?: turn.id) in uiState.pinnedMessageIds,
                            chips = if (turn.id == uiState.lastAssistantTurnId) uiState.followUpChips else emptyList(),
                            onRetry = viewModel::retryLastAnswer,
                            onEdit = viewModel::beginEditLast,
                            onUndo = viewModel::undoSend,
                            onPin = { viewModel.pinTurn(turn.id, (turn as? ChatTurnItem.Assistant)?.let { (it.serverId ?: it.id) !in uiState.pinnedMessageIds } ?: true) },
                            onFork = {
                                viewModel.forkFrom(turn.id, onForked)
                            },
                            onShare = {
                                viewModel.shareTurn(turn.id) { created -> shareUrl(created.url) }
                            },
                            onChip = viewModel::activateChip,
                        )
                    }
                    if (showInProgress) {
                        item(key = "in-progress") {
                            InProgressRow(
                                phase = uiState.streamingPhase,
                                activities = uiState.toolActivities,
                                reconnecting = uiState.reconnecting,
                                streamingText = uiState.streamingText,
                                elapsedSeconds = elapsedSeconds,
                            )
                        }
                    }
                }
            }
            if (uiState.pinnedArtifacts.isNotEmpty()) {
                PinnedArtifactStrip(
                    pins = uiState.pinnedArtifacts,
                    onOpen = { pin ->
                        val pinService = services?.pins ?: return@PinnedArtifactStrip
                        val conv = conversationId ?: return@PinnedArtifactStrip
                        scope.launch {
                            val detail = pinService.get(conv, pin.id)
                            if (detail != null) {
                                artifactViewModel.openPinned(detail.kind, detail.title, detail.snapshot)
                            }
                        }
                    },
                    onUnpin = { pin -> viewModel.unpinArtifact(pin.id) },
                    modifier = Modifier.padding(horizontal = OakSpacing.md, vertical = OakSpacing.xs),
                )
            }
            uiState.hydrateBanner?.let { banner ->
                HydrateBannerRow(
                    banner = banner,
                    showRetry = uiState.showsHydrateRetry,
                    onRetry = viewModel::retryHydrate,
                )
            }
            HorizontalDivider(color = oak.border)
            uiState.errorBanner?.let { banner ->
                ErrorBannerRow(banner = banner, onRetry = viewModel::retry)
            }
            Composer(
                composerText = uiState.composerText,
                canSend = uiState.canSend,
                isStreaming = uiState.isStreaming,
                pendingImages = uiState.pendingImages,
                onTextChange = viewModel::setComposerText,
                onAttach = viewModel::attachImages,
                onRemoveImage = viewModel::removeImage,
                onSend = viewModel::send,
                onStop = viewModel::stopStreaming,
                mentionQuery = uiState.mentionQuery,
                mentionSuggestions = uiState.mentionSuggestions,
                onPickMention = viewModel::insertMention,
                deadMentions = uiState.deadMentions,
                missingImagesNote = uiState.missingImagesNote,
                signedIn = uiState.isSignedIn,
                slashNameRows = uiState.slashNameRows,
                slashTeamRows = uiState.slashTeamRows,
                slashArgReady = uiState.slashArgReady,
                onInsertSlashCommand = viewModel::insertSlashCommand,
                onInsertSlashName = viewModel::insertSlashName,
                onInsertSlashTeam = viewModel::insertSlashTeam,
            )
        }
    }



    // The artifact bottom sheet overlays the chat (co-visible, not a separate tab —
    // component-design.md "Navigation graph"); it self-hides when its back stack is
    // empty, so it is always safe to host unconditionally.
    ArtifactSheet(
        artifactViewModel,
        onOpenInDex = onOpenInDex,
        onAddToTeam = if (uiState.canAddToTeam) { member -> addIncoming = member } else null,
    )

    val incoming = addIncoming
    if (incoming != null && services != null && uiState.canAddToTeam) {
        val addVm = remember(incoming) {
            AddToTeamViewModel(services.teams, incoming, uiState.displayFormat)
        }
        AddToTeamSheet(
            viewModel = addVm,
            onDismiss = { addIncoming = null },
            onDone = { teamId, _ ->
                addIncoming = null
                onOpenTeam(teamId, null)
            },
        )
    }

    val overlay = uiState.calcOverlay
    if (overlay != null && services != null) {
        val calcVm = remember(overlay.rest, overlay.scenario) {
            CalculatorViewModel(services.calc, overlay.scenario.format, overlay.scenario)
        }
        CalculatorOverlay(
            viewModel = calcVm,
            onDismiss = viewModel::dismissCalculator,
            onExpand = viewModel::expandCalculator,
            onExplain = { prompt -> viewModel.sendFollowUp(prompt) },
            dexLookup = services.dexLookup,
        )
    }
}

@Composable
private fun HydrateBannerRow(
    banner: HydrateBanner,
    showRetry: Boolean,
    onRetry: () -> Unit,
) {
    val oak = LocalOakColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = OakSpacing.md, vertical = OakSpacing.sm),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = when (banner) {
                HydrateBanner.Finishing -> "Finishing card…"
                HydrateBanner.Failed -> "Couldn't finish this spoken answer."
            },
            style = MaterialTheme.typography.bodySmall,
            color = oak.textMuted,
        )
        if (showRetry) {
            TextButton(onClick = onRetry) { Text("Retry") }
        }
    }
}



// ---------------------------------------------------------------------------
// Thread rows
// ---------------------------------------------------------------------------

@Composable
private fun TurnRow(
    turn: ChatTurnItem,
    actions: AnswerCardActions,
    density: ai.gowtam.oak.wire.AnswerDensity = ai.gowtam.oak.wire.AnswerDensity.Full,
    isLastUser: Boolean,
    isLastAssistant: Boolean,
    canRetry: Boolean,
    canEdit: Boolean,
    isSignedIn: Boolean,
    showUndo: Boolean,
    isPinned: Boolean,
    chips: List<FollowUpChip>,
    onRetry: () -> Unit,
    onEdit: () -> Unit,
    onUndo: () -> Unit,
    onPin: () -> Unit,
    onFork: () -> Unit,
    onShare: () -> Unit,
    onChip: (FollowUpChip) -> Unit,
) {
    when (turn) {
        is ChatTurnItem.User -> UserMessageRow(
            turn = turn,
            showUndo = showUndo,
            showEdit = isLastUser && canEdit && !showUndo,
            onUndo = onUndo,
            onEdit = onEdit,
        )
        is ChatTurnItem.Assistant -> {
            Column(verticalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
                if (turn.isVoiceOrigin) {
                    Text(
                        text = "Spoken",
                        style = MaterialTheme.typography.labelSmall,
                        color = LocalOakColors.current.textMuted,
                    )
                }
                AnswerCard(answer = turn.answer, actions = actions, density = density)
                TurnActions(
                    answer = turn.answer,
                    isLastAssistant = isLastAssistant,
                    isSignedIn = isSignedIn,
                    isPinned = isPinned,
                    canRetry = canRetry && isLastAssistant,
                    onRetry = onRetry,
                    onPin = onPin,
                    onFork = onFork,
                    onShare = onShare,
                )
                if (isLastAssistant) {
                    FollowUpChipRow(chips = chips, onChip = onChip)
                }
            }
        }
    }
}

@Composable
private fun UserMessageRow(
    turn: ChatTurnItem.User,
    showUndo: Boolean = false,
    showEdit: Boolean = false,
    onUndo: () -> Unit = {},
    onEdit: () -> Unit = {},
) {
    val oak = LocalOakColors.current
    val dark = oak.isDark
    val surface = MaterialTheme.colorScheme.surface
    // Enamel user bubble: poke-red-soft mixed 55% with surface, 30% red border,
    // sm radius on the bottom-right. Not surfaceSunken (Key Decision 9).
    val bubbleFill = lerp(surface, oak.accentSoft, 0.55f)
    val bubbleBorder = lerp(oak.border, oak.accent, 0.30f)
    val noteShape = RoundedCornerShape(
        topStart = OakRadius.lg,
        topEnd = OakRadius.lg,
        bottomStart = OakRadius.lg,
        bottomEnd = OakRadius.sm,
    )
    val umber = Color(0xFF4A352A)
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
        Column(horizontalAlignment = Alignment.End, modifier = Modifier.widthIn(max = 320.dp)) {
            if (turn.text.isNotEmpty()) {
                Box(
                    modifier = Modifier
                        .then(
                            if (dark) {
                                Modifier
                            } else {
                                Modifier.shadow(
                                    elevation = 4.dp,
                                    shape = noteShape,
                                    ambientColor = umber.copy(alpha = 0.07f),
                                    spotColor = umber.copy(alpha = 0.10f),
                                )
                            },
                        )
                        .clip(noteShape)
                        .background(bubbleFill)
                        .border(1.dp, bubbleBorder, noteShape)
                        .padding(horizontal = OakSpacing.md, vertical = OakSpacing.sm),
                ) {
                    Text(
                        text = turn.text,
                        color = oak.textStrong,
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
            }
            if (turn.imageCount > 0) {
                Row(
                    modifier = Modifier.padding(top = OakSpacing.xs),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Photo, contentDescription = null, tint = oak.textMuted, modifier = Modifier.height(14.dp))
                    Text(
                        text = "${turn.imageCount} image(s) attached",
                        style = MaterialTheme.typography.bodySmall,
                        color = oak.textMuted,
                    )
                }
            }
            if (showUndo) {
                TextButton(onClick = onUndo) { Text("Undo", color = oak.accent) }
            } else if (showEdit) {
                TextButton(onClick = onEdit) { Text("Edit", color = oak.textMuted) }
            }
        }
    }
}

@Composable
private fun InProgressRow(
    phase: StreamingPhase,
    activities: List<ToolActivity>,
    reconnecting: Boolean,
    streamingText: String,
    elapsedSeconds: Int? = null,
) {
    IncomingAnswerPlate(
        phase = phase,
        activities = activities,
        reconnecting = reconnecting,
        streamingText = streamingText,
        elapsedSeconds = elapsedSeconds,
    )
}

// ---------------------------------------------------------------------------
// Guest sign-in nudge
// ---------------------------------------------------------------------------

/**
 * A quiet row inviting a guest to sign in so their conversations persist
 * (accounts-and-access.md M-ACCT-US-1; history-and-teams.md D-HIST-1 — the guest's
 * "history affordance" for a surface that, once signed in, becomes the saved-
 * conversation list). Demoted from a full-width accent-wash band to a single muted
 * text row + inline accent text-button living inside the scrollable transcript
 * (fable-ui-strategy.md §4 "01 — iOS Home": "not a full-width band under the
 * header"). Mirrors iOS `ChatView.signInNudge`.
 */
@Composable
private fun SignInNudge(onSignIn: () -> Unit) {
    val oak = LocalOakColors.current
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "Sign in to save your conversations",
            style = MaterialTheme.typography.bodySmall,
            color = oak.textMuted,
            modifier = Modifier.weight(1f),
        )
        TextButton(onClick = onSignIn) { Text("Sign in", color = oak.accent) }
    }
}

// ---------------------------------------------------------------------------
// Error banner
// ---------------------------------------------------------------------------

@Composable
private fun ErrorBannerRow(banner: ErrorBanner, onRetry: () -> Unit) {
    val oak = LocalOakColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(oak.danger.copy(alpha = 0.12f))
            .padding(OakSpacing.md),
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(Icons.Filled.WarningAmber, contentDescription = null, tint = oak.danger, modifier = Modifier.height(18.dp))
        Text(
            text = banner.message,
            style = MaterialTheme.typography.bodySmall,
            color = oak.textStrong,
            modifier = Modifier.weight(1f),
        )
        if (banner.isRetryable) {
            TextButton(onClick = onRetry) { Text("Retry", color = oak.accent) }
        }
    }
}

// ---------------------------------------------------------------------------
// Empty state — current landing on paper under the enamel lid
// ---------------------------------------------------------------------------

/**
 * Empty-thread landing (`docs/design/enamel-paper.md` Empty chat): Fredoka title
 * on paper, recents, categorized filed starters. No STANDBY plate, no LED well,
 * no centered Oak lockup. Starters are sampled once per composition via
 * [ExamplePrompts.pickFiled].
 */
@Composable
private fun EmptyState(
    onExampleTap: (String) -> Unit,
    recents: EmptyDeskRecents? = null,
    onContinueConversation: (String) -> Unit = {},
    onOpenTeam: (String) -> Unit = {},
) {
    val oak = LocalOakColors.current
    val starters = remember { ExamplePrompts.pickFiled() }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = OakSpacing.md, bottom = OakSpacing.lg),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.md),
    ) {
        Text(
            text = ChatEmptyCopy.headline,
            style = MaterialTheme.typography.displaySmall,
            color = oak.textStrong,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text = ChatEmptyCopy.supporting,
            style = MaterialTheme.typography.bodyMedium,
            color = oak.textMuted,
        )
        recents?.lastConversation?.let { convo ->
            FiledActionRow(label = "Continue", title = convo.title, onClick = { onContinueConversation(convo.id) })
        }
        recents?.lastTeam?.let { team ->
            FiledActionRow(label = "Team", title = team.name, onClick = { onOpenTeam(team.id) })
        }
        recents?.let {
            FiledActionRow(label = "Regulation", title = it.scope.displayLabel, onClick = {})
        }
        Column(verticalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
            for (starter in starters) {
                FiledStarterRow(starter = starter, onClick = { onExampleTap(starter.prompt) })
            }
        }
    }
}

/**
 * One empty-desk recent row: mute category prefix + title. White plate, strong
 * hairline, raised umber shadow. Text only — no LED chip.
 */
@Composable
private fun FiledActionRow(label: String, title: String, onClick: () -> Unit) {
    val oak = LocalOakColors.current
    val shape = RoundedCornerShape(OakRadius.md)
    val dark = oak.isDark
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (dark) Modifier else Modifier.shadow(4.dp, shape))
            .background(MaterialTheme.colorScheme.surface, shape)
            .border(1.dp, oak.borderStrong, shape)
            .clickable(onClick = onClick)
            .padding(horizontal = OakSpacing.md, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
            color = oak.textMuted,
            modifier = Modifier.widthIn(min = 48.dp),
        )
        Text(
            text = title,
            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
            color = oak.textStrong,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun FiledStarterRow(starter: ExamplePrompts.FiledStarter, onClick: () -> Unit) {
    val oak = LocalOakColors.current
    val reduceMotion = rememberReduceMotion()
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val lift by animateFloatAsState(
        targetValue = if (pressed && !reduceMotion) -2f else 0f,
        animationSpec = if (reduceMotion) snap() else OakMotion.spring,
        label = "filedStarterLift",
    )
    val shape = RoundedCornerShape(OakRadius.md)
    val dark = oak.isDark
    val fill = if (pressed) oak.accentSoft else MaterialTheme.colorScheme.surface
    val stroke = if (pressed) oak.accent else oak.borderStrong
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .offset(y = lift.dp)
            .then(if (dark) Modifier else Modifier.shadow(4.dp, shape))
            .background(fill, shape)
            .border(1.dp, stroke, shape)
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(horizontal = OakSpacing.md, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = starter.category.label,
            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
            color = oak.textMuted,
            modifier = Modifier.widthIn(min = 48.dp),
        )
        Text(
            text = starter.prompt,
            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
            color = oak.textStrong,
            modifier = Modifier.weight(1f),
        )
    }
}
