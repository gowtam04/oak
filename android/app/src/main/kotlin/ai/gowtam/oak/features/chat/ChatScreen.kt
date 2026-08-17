package ai.gowtam.oak.features.chat

import ai.gowtam.oak.features.artifact.ArtifactSheet
import ai.gowtam.oak.features.artifact.ArtifactViewModel
import ai.gowtam.oak.features.chat.answercard.AnswerCard
import ai.gowtam.oak.features.chat.answercard.AnswerCardActions
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.graphics.graphicsLayer
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
) {
    val uiState by viewModel.uiState.collectAsState()
    val oak = LocalOakColors.current
    val context = LocalContext.current
    fun shareUrl(url: String) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, url)
        }
        context.startActivity(Intent.createChooser(intent, "Share"))
    }
    val listState = rememberLazyListState()
    var pinJumpId by remember { mutableStateOf<String?>(null) }
    var showScopePicker by remember { mutableStateOf(false) }
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

    val cardActions = remember(viewModel, artifactViewModel) {
        AnswerCardActions(
            onFollowUp = viewModel::sendFollowUp,
            onOpenEntity = artifactViewModel::openEntity,
            onOpenSavedTeam = artifactViewModel::openSavedTeam,
            onOpenProposedTeam = artifactViewModel::openProposedTeam,
            onOpenComparison = artifactViewModel::openComparison,
            onOpenDamageCalc = artifactViewModel::openDamageCalc,
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
                    ScopeChip(
                        format = uiState.displayFormat,
                        enabled = !uiState.isStreaming,
                        onClick = { showScopePicker = true },
                    )
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
                    modifier = Modifier.fillMaxSize(),
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
            )
        }
    }

    if (showScopePicker) {
        val sheetState = rememberModalBottomSheetState()
        ModalBottomSheet(
            onDismissRequest = { showScopePicker = false },
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surface,
            scrimColor = oak.scrim,
            shape = RoundedCornerShape(topStart = OakRadius.xl, topEnd = OakRadius.xl),
        ) {
            ScopePickerSheet(
                current = uiState.displayFormat,
                mru = uiState.lastUsedScopes,
                onSelect = { format ->
                    viewModel.selectScope(format)
                    showScopePicker = false
                },
            )
        }
    }

    // The artifact bottom sheet overlays the chat (co-visible, not a separate tab —
    // component-design.md "Navigation graph"); it self-hides when its back stack is
    // empty, so it is always safe to host unconditionally.
    ArtifactSheet(artifactViewModel)
}

// ---------------------------------------------------------------------------
// Scope chip + picker
// ---------------------------------------------------------------------------

@Composable
private fun ScopeChip(format: Format, enabled: Boolean, onClick: () -> Unit) {
    val oak = LocalOakColors.current
    val chipShape = RoundedCornerShape(OakRadius.pill)
    Row(
        modifier = Modifier
            .padding(end = OakSpacing.sm)
            .clip(chipShape)
            .background(oak.surfaceSunken, chipShape)
            .border(1.dp, oak.border, chipShape)
            .then(if (enabled) Modifier.clickableChip(onClick) else Modifier)
            .padding(horizontal = OakSpacing.md, vertical = OakSpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Signal scope LED — always on, not only when scope ≠ national-dex.
        Box(
            modifier = Modifier
                .size(6.dp)
                .clip(CircleShape)
                .background(oak.accent),
        )
        Text(
            text = format.shortLabel,
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Medium),
            color = oak.textMuted,
        )
        Icon(
            Icons.Filled.KeyboardArrowDown,
            contentDescription = null,
            tint = if (enabled) oak.textMuted else oak.textFaint,
            modifier = Modifier.height(16.dp),
        )
    }
}

private fun Modifier.clickableChip(onClick: () -> Unit): Modifier =
    this.clickable(onClick = onClick)

@Composable
private fun ScopePickerSheet(
    current: Format,
    mru: List<Format> = emptyList(),
    onSelect: (Format) -> Unit,
) {
    val oak = LocalOakColors.current
    val remaining = Format.knownCases.filterNot { it in mru }
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = "Answer scope",
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
            color = oak.textStrong,
            modifier = Modifier
                .padding(horizontal = OakSpacing.lg, vertical = OakSpacing.sm)
                .semantics { heading() },
        )
        Text(
            text = "Choose which game or generation answers are based on.",
            style = MaterialTheme.typography.bodySmall,
            color = oak.textMuted,
            modifier = Modifier.padding(horizontal = OakSpacing.lg),
        )
        Spacer(Modifier.height(OakSpacing.sm))
        // The known-scopes list now runs to 11 rows (national-dex + gen-1..8 + champions),
        // which overflows a fixed-height ModalBottomSheet on most phones — scroll the rows
        // so every option stays reachable instead of clipping off the bottom.
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(bottom = OakSpacing.xxl),
        ) {
            if (mru.isNotEmpty()) {
                Text(
                    text = "Recent",
                    style = MaterialTheme.typography.labelMedium,
                    color = oak.textMuted,
                    modifier = Modifier.padding(horizontal = OakSpacing.lg, vertical = OakSpacing.xs),
                )
                for (format in mru) {
                    ScopePickerRow(format = format, selected = format == current, onSelect = onSelect)
                }
                Text(
                    text = "All scopes",
                    style = MaterialTheme.typography.labelMedium,
                    color = oak.textMuted,
                    modifier = Modifier.padding(horizontal = OakSpacing.lg, vertical = OakSpacing.xs),
                )
            }
            for (format in remaining) {
                ScopePickerRow(format = format, selected = format == current, onSelect = onSelect)
            }
        }
    }
}

@Composable
private fun ScopePickerRow(format: Format, selected: Boolean, onSelect: (Format) -> Unit) {
    val oak = LocalOakColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickableChip { onSelect(format) }
            .padding(horizontal = OakSpacing.lg, vertical = OakSpacing.md),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = format.displayLabel,
            style = MaterialTheme.typography.bodyLarge,
            color = oak.textStrong,
        )
        if (selected) {
            LedDot(
                dotSize = 8.dp,
                haloSize = 14.dp,
                modifier = Modifier.semantics { contentDescription = "Selected" },
            )
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
                AnswerCard(answer = turn.answer, actions = actions)
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
    // Signal user note: sunken fill + hairline, ink text. No red bubble, no corner pip.
    val noteShape = RoundedCornerShape(OakRadius.lg)
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
        Column(horizontalAlignment = Alignment.End, modifier = Modifier.widthIn(max = 320.dp)) {
            if (turn.text.isNotEmpty()) {
                Box(
                    modifier = Modifier
                        .clip(noteShape)
                        .background(oak.surfaceSunken)
                        .border(1.dp, oak.border, noteShape)
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
// Empty state — Signal hero + filed starter rows
// ---------------------------------------------------------------------------

/**
 * Empty-thread hero (`docs/design/signal.md` §6.1): large title, one mute
 * sentence, four full-width starter rows. Scope LED lives in the header only —
 * no STANDBY plate, no LED well, no centered logo.
 * Starters are sampled once per composition via [ExamplePrompts.pickFiled].
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
            text = "What do you want to know?",
            style = MaterialTheme.typography.displaySmall,
            color = oak.textStrong,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text = "Mechanics, locations, teams, damage. Oak will show its work.",
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
            FiledActionRow(label = "Scope", title = it.scope.shortLabel, onClick = {})
        }
        Column(verticalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
            for (starter in starters) {
                FiledStarterRow(starter = starter, onClick = { onExampleTap(starter.prompt) })
            }
        }
    }
}

/**
 * The Instrument "record light" LED: a solid `oak.accent` dot with a soft halo behind
 * it (a larger, low-alpha same-color disc — cheap, no `RenderEffect` blur needed).
 * Shared by the empty-state scope stamp and the scope picker's selected row.
 */
@Composable
private fun LedDot(modifier: Modifier = Modifier, dotSize: Dp = 6.dp, haloSize: Dp = 10.dp) {
    val oak = LocalOakColors.current
    Box(modifier = modifier.size(haloSize), contentAlignment = Alignment.Center) {
        Box(
            modifier = Modifier
                .size(haloSize)
                .clip(CircleShape)
                .background(oak.accent.copy(alpha = 0.35f)),
        )
        Box(
            modifier = Modifier
                .size(dotSize)
                .clip(CircleShape)
                .background(oak.accent),
        )
    }
}

/**
 * One filed-starter row: mute category prefix + prompt. Surface, 10.dp radius,
 * hairline. Text only — no type-dot, no equal hero chip.
 */
@Composable
private fun FiledActionRow(label: String, title: String, onClick: () -> Unit) {
    val oak = LocalOakColors.current
    val shape = RoundedCornerShape(OakRadius.md)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(MaterialTheme.colorScheme.surface, shape)
            .border(1.dp, oak.border, shape)
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
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.98f else 1f,
        animationSpec = if (reduceMotion) snap() else OakMotion.snappy,
        label = "filedStarterScale",
    )
    val shape = RoundedCornerShape(OakRadius.md)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(shape)
            .background(MaterialTheme.colorScheme.surface, shape)
            .border(1.dp, oak.border, shape)
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
