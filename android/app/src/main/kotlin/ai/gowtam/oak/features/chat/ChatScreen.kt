package ai.gowtam.oak.features.chat

import ai.gowtam.oak.features.artifact.ArtifactSheet
import ai.gowtam.oak.features.artifact.ArtifactViewModel
import ai.gowtam.oak.features.chat.answercard.AnswerCard
import ai.gowtam.oak.features.chat.answercard.AnswerCardActions
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.MarkdownBlockView
import ai.gowtam.oak.ui.OakMotion
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakTopBar
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.rememberHaptics
import ai.gowtam.oak.ui.rememberReduceMotion
import ai.gowtam.oak.wire.Format
import android.content.res.Configuration
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.isSystemInDarkTheme
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Photo
import androidx.compose.material.icons.filled.WarningAmber
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
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver

/**
 * The chat thread screen (chat-experience.md M-CHAT-US-1/2/3/4; component-design.md
 * "Navigation graph"): a scrolling conversation of user messages and reasoned answers,
 * a live streaming section while a turn is in flight, a recoverable error banner, and
 * the composer. Mirrors the iOS `ChatView`, re-expressed for Compose.
 *
 * All logic lives in [ChatViewModel]; this composable is layout + bindings. The header
 * scope chip (component-design.md "AnswerCard render order" / GS-C) is the ONLY
 * interactive scope control — it opens a bottom-sheet picker over the six known
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
    /** When non-null, renders the guest "Sign in to save your conversations" nudge
     * above the thread; the "Sign in" button calls this (it presents the sign-in
     * sheet). `null` for a signed-in thread — mirrors iOS `ChatView.signInAction`. */
    signInAction: (() -> Unit)? = null,
    /** When non-null, the top bar shows a back arrow calling this instead of the
     * app title alone — used for a pushed/resumed signed-in thread so there is an
     * explicit affordance back to the conversation list (history-and-teams.md
     * D-HIST-1) alongside system/predictive back. `null` for the guest single
     * thread and the list's own "New Chat" push. */
    onBack: (() -> Unit)? = null,
) {
    val uiState by viewModel.uiState.collectAsState()
    val oak = LocalOakColors.current
    val listState = rememberLazyListState()
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
            // Tear down any in-flight stream when the screen leaves composition — this
            // also releases the keep-screen-on hold so it can never get stuck on.
            viewModel.cancelStreaming()
        }
    }

    val showEmptyState = uiState.turns.isEmpty() && !uiState.isStreaming
    val showInProgress = uiState.isStreaming || uiState.streamingText.isNotEmpty()
    val itemCount = uiState.turns.size + (if (showEmptyState) 1 else 0) + (if (showInProgress) 1 else 0)
    LaunchedEffect(uiState.turns.size, uiState.streamingText, uiState.toolActivities.size) {
        if (itemCount > 0) listState.animateScrollToItem(itemCount - 1)
    }

    Scaffold(
        modifier = modifier,
        topBar = {
            OakTopBar(
                title = { Text("Oak", modifier = Modifier.semantics { heading() }) },
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
                    if (showsNewConversationButton) {
                        IconButton(onClick = viewModel::startNewConversation) {
                            Icon(Icons.Filled.Add, contentDescription = "New conversation")
                        }
                    }
                },
            )
        },
    ) { innerPadding ->
        // Landscape on a phone leaves very little vertical room once the top bar,
        // composer, and bottom nav (all fixed-height chrome, unchanged from portrait)
        // are subtracted — the sign-in nudge alone was costing the transcript's
        // LazyColumn ~190px out of a ~733px content area, squeezing it down to an
        // unusably (and on some builds, unrenderably) short sliver. It stays available
        // in portrait and via the Account tab either way, so hiding it here in
        // landscape trades a non-essential nudge for a transcript that's actually
        // visible and scrollable.
        val isLandscape = LocalConfiguration.current.orientation == Configuration.ORIENTATION_LANDSCAPE
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            if (signInAction != null && !isLandscape) {
                SignInNudge(onSignIn = signInAction)
            }
            Box(modifier = Modifier.weight(1f)) {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(OakSpacing.lg),
                    verticalArrangement = Arrangement.spacedBy(OakSpacing.lg),
                ) {
                    if (showEmptyState) {
                        item(key = "empty-state") { EmptyState(onExampleTap = viewModel::sendFollowUp) }
                    }
                    items(uiState.turns, key = { it.id }) { turn ->
                        TurnRow(turn, actions = cardActions)
                    }
                    if (showInProgress) {
                        item(key = "in-progress") {
                            InProgressRow(
                                phase = uiState.streamingPhase,
                                activities = uiState.toolActivities,
                                reconnecting = uiState.reconnecting,
                                streamingText = uiState.streamingText,
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
            )
        }
    }

    if (showScopePicker) {
        val sheetState = rememberModalBottomSheetState()
        ModalBottomSheet(onDismissRequest = { showScopePicker = false }, sheetState = sheetState) {
            ScopePickerSheet(
                current = uiState.displayFormat,
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
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = format.shortLabel,
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
            color = if (enabled) oak.textStrong else oak.textMuted,
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
private fun ScopePickerSheet(current: Format, onSelect: (Format) -> Unit) {
    val oak = LocalOakColors.current
    Column(modifier = Modifier.fillMaxWidth().padding(bottom = OakSpacing.xxl)) {
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
        for (format in Format.knownCases) {
            val selected = format == current
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
                    Icon(Icons.Filled.Check, contentDescription = "Selected", tint = oak.accent)
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Thread rows
// ---------------------------------------------------------------------------

@Composable
private fun TurnRow(turn: ChatTurnItem, actions: AnswerCardActions) {
    when (turn) {
        is ChatTurnItem.User -> UserMessageRow(turn)
        is ChatTurnItem.Assistant -> AnswerCard(answer = turn.answer, actions = actions)
    }
}

@Composable
private fun UserMessageRow(turn: ChatTurnItem.User) {
    val oak = LocalOakColors.current
    val dark = isSystemInDarkTheme()
    // The paper bubble (§4.3): a soft accent-tinted fill with a red-tinted hairline and
    // OAK INK (not white) — quieter and more paper-like than a flat coral fill. Raised
    // shadow in light; in dark the hairline carries the edge instead (no shadow).
    val bubbleFill = if (dark) Color(0xFF2E1D1B) else Color(0xFFFDF2F1)
    val bubbleShape = RoundedCornerShape(
        topStart = OakRadius.lg, topEnd = OakRadius.lg,
        bottomEnd = OakRadius.sm, bottomStart = OakRadius.lg,
    )
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
        Column(horizontalAlignment = Alignment.End, modifier = Modifier.widthIn(max = 320.dp)) {
            if (turn.text.isNotEmpty()) {
                Text(
                    text = turn.text,
                    color = oak.text,
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier
                        .then(if (dark) Modifier else Modifier.shadow(2.dp, bubbleShape))
                        .clip(bubbleShape)
                        .background(bubbleFill)
                        .border(1.dp, oak.accent.copy(alpha = 0.28f), bubbleShape)
                        .padding(horizontal = OakSpacing.md, vertical = OakSpacing.sm),
                )
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
        }
    }
}

@Composable
private fun InProgressRow(
    phase: StreamingPhase,
    activities: List<ToolActivity>,
    reconnecting: Boolean,
    streamingText: String,
) {
    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(OakSpacing.md)) {
        StreamingStatus(phase = phase, activities = activities, reconnecting = reconnecting)
        if (streamingText.isNotEmpty()) {
            MarkdownBlockView(markdown = streamingText, modifier = Modifier.fillMaxWidth())
        }
    }
}

// ---------------------------------------------------------------------------
// Guest sign-in nudge
// ---------------------------------------------------------------------------

/**
 * A slim banner inviting a guest to sign in so their conversations persist
 * (accounts-and-access.md M-ACCT-US-1; history-and-teams.md D-HIST-1 — the guest's
 * "history affordance" for a surface that, once signed in, becomes the saved-
 * conversation list). Icon + text so meaning is never carried by color alone.
 * Mirrors iOS `ChatView.signInNudge`.
 */
@Composable
private fun SignInNudge(onSignIn: () -> Unit) {
    val oak = LocalOakColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(oak.accent.copy(alpha = 0.10f))
            .padding(OakSpacing.md),
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.CloudUpload, contentDescription = null, tint = oak.accent, modifier = Modifier.height(18.dp))
        Text(
            text = "Sign in to save your conversations",
            style = MaterialTheme.typography.bodySmall,
            color = oak.textStrong,
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
// Empty state
// ---------------------------------------------------------------------------

/**
 * A branded empty state: a title + description and four example-question chips (a tap
 * sends the text verbatim as the first user turn), plus a scope hint naming the header
 * chip as the interactive scope control. The four chips are sampled fresh from
 * [ExamplePrompts.pool] each time this composable enters composition — a new chat or
 * app relaunch reshuffles them; `remember` keeps them stable while the empty state
 * stays on screen. Mirrors iOS `ChatView.emptyState`.
 */
@Composable
private fun EmptyState(onExampleTap: (String) -> Unit) {
    val oak = LocalOakColors.current
    val examples = remember { ExamplePrompts.pick(4) }
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = OakSpacing.xxl, bottom = OakSpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Ask Oak",
            style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.SemiBold),
            color = oak.textStrong,
            modifier = Modifier.semantics { heading() },
        )
        Spacer(Modifier.height(OakSpacing.xs))
        Text(
            text = "Every answer carries its reasoning, sources, and the generation it's based on.",
            style = MaterialTheme.typography.bodyMedium,
            color = oak.textMuted,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        Spacer(Modifier.height(OakSpacing.lg))
        Text(
            text = "TRY ASKING",
            style = MaterialTheme.typography.labelSmall,
            color = oak.textMuted,
        )
        Spacer(Modifier.height(OakSpacing.sm))
        Column(verticalArrangement = Arrangement.spacedBy(OakSpacing.sm), horizontalAlignment = Alignment.CenterHorizontally) {
            for (question in examples) {
                ExampleChip(text = question, onClick = { onExampleTap(question) })
            }
        }
    }
}

/**
 * An empty-state example chip (§4.6): a surface pill with a `borderStrong` hairline
 * that, on press, tints `accentSoft` with an accent border and dips 0.97 (snappy;
 * instant under reduce-motion). Empty-state chips press *red* — the in-thread variant
 * presses azure. Color is paired with the label, never the sole signal.
 */
@Composable
private fun ExampleChip(text: String, onClick: () -> Unit) {
    val oak = LocalOakColors.current
    val reduceMotion = rememberReduceMotion()
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.97f else 1f,
        animationSpec = if (reduceMotion) snap() else OakMotion.snappy,
        label = "exampleChipScale",
    )
    val shape = RoundedCornerShape(OakRadius.pill)
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
        color = if (pressed) oak.accent else oak.text,
        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        modifier = Modifier
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(shape)
            .background(if (pressed) oak.accentSoft else MaterialTheme.colorScheme.surface, shape)
            .border(1.dp, if (pressed) oak.accent else oak.borderStrong, shape)
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(horizontal = OakSpacing.lg, vertical = OakSpacing.sm),
    )
}
